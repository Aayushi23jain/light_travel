// Motion smoothing for the head / hand / leg GLB clips (Activity screen).
//
// Why: the clips inside head.glb / hand.glb / leg.glb only hold 3-6 keyframes with LINEAR interpolation, so the parts move at constant
// speed and change direction with a sharp corner.  demo.mp4 (the Unity original) moves on smooth, eased curves - it slows down and
// "holds" for a moment at every extreme (head turn, elbow bend, leg swing).  Measured on demo.mp4 (skull width, forearm length, motion
// energy per frame) a monotone cubic (PCHIP / "clamped auto" tangents) through the SAME keyframes fits the video 2-3x better than linear
// (head: 2.9 px vs 6.7 px rms) and reproduces the plateaus at the extremes.
//
// smoothClip() keeps the poses of the GLB keyframes and only changes how the part travels between them:
//   - optional retime: [[oldTime, newTime], ...] moves the key times (used for the leg, whose later keys are slower in the video)
//   - vectors (position / scale): PCHIP per component
//   - quaternions: rotation vector relative to the first key, PCHIP per component, back to a quaternion (exact for single-axis turns)
// and then bakes the curve into dense (60 fps) linear keys, so three.js needs no special interpolant.
// Pure maths, no three.js import (except the track constructor taken from the original track), so it is easy to test.

// --- PCHIP (Fritsch-Carlson, same end conditions as scipy.interpolate.PchipInterpolator) -------------------------------------------
const sgn = Math.sign;
function edgeSlope(h0, h1, m0, m1) {
  let d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (sgn(d) !== sgn(m0)) d = 0;
  else if (sgn(m0) !== sgn(m1) && Math.abs(d) > 3 * Math.abs(m0)) d = 3 * m0;
  return d;
}
export function pchip(x, y) {
  const n = x.length, h = [], m = [], d = new Array(n).fill(0);
  if (n === 1) return () => y[0];
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; m[i] = (y[i + 1] - y[i]) / h[i]; }
  if (n === 2) d[0] = d[1] = m[0];
  else {
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] > 0) { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
    }
    d[0] = edgeSlope(h[0], h[1], m[0], m[1]);
    d[n - 1] = edgeSlope(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  }
  return t => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const s = (t - x[i]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h[i] * d[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h[i] * d[i + 1];
  };
}

// --- quaternion helpers ([x, y, z, w]) ---------------------------------------------------------------------------------------------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qconj = q => [-q[0], -q[1], -q[2], q[3]];
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
function qlog(q) {                                   // rotation vector (axis * angle), angle in [0, 2pi] (keeps the hemisphere it is given)
  const s = Math.hypot(q[0], q[1], q[2]);
  if (s < 1e-9) return [0, 0, 0];
  const a = 2 * Math.atan2(s, q[3]);
  return [q[0] / s * a, q[1] / s * a, q[2] / s * a];
}
function qexp(r) {
  const a = Math.hypot(r[0], r[1], r[2]);
  if (a < 1e-9) return [0, 0, 0, 1];
  const s = Math.sin(a / 2) / a;
  return [r[0] * s, r[1] * s, r[2] * s, Math.cos(a / 2)];
}

// Piecewise-linear time remap: pairs = [[oldT, newT], ...] (sorted); times outside the list are shifted with the nearest end.
export function remapTime(pairs, t) {
  if (!pairs) return t;
  if (t <= pairs[0][0]) return t - pairs[0][0] + pairs[0][1];
  for (let i = 0; i < pairs.length - 1; i++) {
    const [a0, b0] = pairs[i], [a1, b1] = pairs[i + 1];
    if (t <= a1) return b0 + (t - a0) / (a1 - a0) * (b1 - b0);
  }
  const [a, b] = pairs[pairs.length - 1]; return t - a + b;
}

// Smooth one track. times: array of key times, values: flat array, size: 3 (vector) or 4 (quaternion). Returns { times, values } (plain arrays).
export function smoothTrack(times, values, size, retime, fps = 60) {
  const n = times.length, T = Array.from(times, t => remapTime(retime, t));
  const t0 = T[0], t1 = T[n - 1], N = Math.max(1, Math.ceil((t1 - t0) * fps)), out = [], tt = [];
  for (let j = 0; j <= N; j++) tt.push(t0 + (t1 - t0) * j / N);
  if (size === 4) {
    const q = []; for (let i = 0; i < n; i++) q.push([values[4 * i], values[4 * i + 1], values[4 * i + 2], values[4 * i + 3]]);
    for (let i = 1; i < n; i++) if (qdot(q[i], q[i - 1]) < 0) q[i] = q[i].map(v => -v);          // shortest way from key to key (same as a slerp)
    const inv = qconj(q[0]), r = q.map(k => qlog(qmul(inv, k)));                                   // rotation of every key relative to the first key
    const f = [0, 1, 2].map(c => pchip(T, r.map(v => v[c])));
    for (const t of tt) {
      const d = qexp([f[0](t), f[1](t), f[2](t)]), o = qmul(q[0], d), l = Math.hypot(o[0], o[1], o[2], o[3]);
      out.push(o[0] / l, o[1] / l, o[2] / l, o[3] / l);
    }
  } else {
    const f = []; for (let c = 0; c < size; c++) f.push(pchip(T, T.map((_, i) => values[size * i + c])));
    for (const t of tt) for (let c = 0; c < size; c++) out.push(f[c](t));
  }
  return { times: tt, values: out };
}

// Whole clip -> new clip (same track names / types, dense smooth keys).  `THREE` is passed in so this file stays import-free.
export function smoothClip(THREE, clip, retime, fps = 60) {
  const tracks = clip.tracks.map(tr => {
    const s = smoothTrack(tr.times, tr.values, tr.getValueSize(), retime, fps);
    return new tr.constructor(tr.name, s.times, s.values);                 // default interpolation = linear (slerp for quaternions)
  });
  return new THREE.AnimationClip(clip.name, -1, tracks);                   // -1: duration = last key time
}
