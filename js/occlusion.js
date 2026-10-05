// Pure maths (no three.js) for the Labels dots / leader lines.
//  - nearestOutside : put a dot ON the skeleton surface (fixed joint: the old anchor floated in the air beside the skull)
//  - smooth / lateralOcc / facingOcc : continuous 0..1 "hidden behind the body" amount, so a dot and its line FADE while the model is
//    rotated instead of popping.  (Replaces the per-frame raycast against the whole skeleton mesh, which was slow and all-or-nothing.)

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };   // 0 at x=a, 1 at x=b (a > b also works)

// ux = sideways component of the unit camera direction (+1 = camera on the joint's own side, -1 = opposite side).
// occ is 0 while ux >= -show and reaches 1 at ux <= -hide.
export const lateralOcc = (ux, show, hide) => smooth(-show, -hide, ux);

// d = dot(surface normal, unit vector to the camera).  Visible while the surface faces the camera (d >= 0), gone once it has turned away.
export const facingOcc = (d, show = .1, hide = -.55) => smooth(show, hide, d);

// Nearest vertex (of the triangles `tris`, a flat list of vertex indices) that FACES `target`, i.e. target lies on the outer side of it.
// Returns { p: [x, y, z], n: [x, y, z] } with a smoothed unit normal (average over the vertices around p), or null.
export function nearestOutside(P, N, tris, target, avgR = .7) {
  const [tx, ty, tz] = target;
  let best = -1, bd = Infinity, any = -1, ad = Infinity;
  for (let i = 0; i < tris.length; i++) {
    const v = tris[i], dx = tx - P[3 * v], dy = ty - P[3 * v + 1], dz = tz - P[3 * v + 2], d = dx * dx + dy * dy + dz * dz;
    if (d < ad) { ad = d; any = v; }
    if (d < bd && dx * N[3 * v] + dy * N[3 * v + 1] + dz * N[3 * v + 2] > 0) { bd = d; best = v; }
  }
  if (best < 0) best = any;                       // nothing faces the target (it is inside): fall back to the plain nearest vertex
  if (best < 0) return null;
  const p = [P[3 * best], P[3 * best + 1], P[3 * best + 2]], r2 = avgR * avgR;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < tris.length; i++) {
    const v = tris[i], dx = P[3 * v] - p[0], dy = P[3 * v + 1] - p[1], dz = P[3 * v + 2] - p[2];
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    const l = Math.hypot(N[3 * v], N[3 * v + 1], N[3 * v + 2]) || 1;
    nx += N[3 * v] / l; ny += N[3 * v + 1] / l; nz += N[3 * v + 2] / l;
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return { p, n: [nx / l, ny / l, nz / l] };
}
