/**
 * scene.js - "Light Travels in a Straight Line"
 *
 * Model placement / animation ported from the light_sim project (world.js):
 *   - every prop is normalised (footprint centre on the ground, y = 0 is the bottom), no hand-tuned per-mesh scales
 *   - ONE pipe mesh that really bends (same material / same gold colour straight or bent)
 *   - torch.glb + table.glb, matchbox with a loose match that is lifted to the wick
 *   - cardboards use the demo.mp4 colours (tan card, brown clip, dark pole, grey base) and turn green on hover / drag
 *   - camera views: table, close-up of candle, pipe from outside, and *through the pipe* (eye at the pipe end)
 *
 * The exported API is the same one router.js already used (init, showActivity, lightCandle, placePipe, ...),
 * plus framePipeOut / framePipeInside.  Animated calls now return a Promise.
 *
 * Units: 1 unit ~ 10 cm.  Experiment board top is y = 0, activity table top is y = 0.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = s => document.querySelector(s);
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // finger instead of mouse (phone / tablet)

/* ---------------------------------------------------------------- tuning knobs */
export const W = {
  BEAM_TOL: 0.045,     // |offset| below this lets the beam through a cardboard hole
  SNAP: 0.09,          // on release, snap to aligned inside this distance
  DRAG_LIMIT: 0.56,                     // the card is 1.22 wide x 1.26 high: within +-0.56 it always still covers the beam
  BEND: 1.45           // pipe bend angle (rad)
};
const COL = {          // demo.mp4 colours
  card: 0xdcab80,      // cardboard panel (tan)
  cardHover: 0x6fbf8c, // panel while hovered / dragged (green)
  clip: 0x8a5a38,      // cardboard clip
  pole: 0x2c2c32,      // thin pole
  base: 0x9a9ca3,      // small base plate
  board: 0x2b2b2e,     // experiment board
  candle: 0xf3f1ec,    // candle + holder
  beam: 0xffe94a
};

let themeDark = true;                       // current theme (setTheme keeps it), used by things built later
export const S = { tween: null, locked: false, viewDist: Infinity, view: null, viewAspect: 0, touched: false };   // view = last scripted view (re-fitted on rotate / resize until the person moves the camera)   // viewDist = camera distance of the last scripted view
const POLAR_FREE = Math.PI * 0.46;      // free orbit: camera stays above the table, never too low
const POLAR_SCRIPTED = Math.PI * 0.56;  // scripted views (look-through-pipe is eye level) are only clamped by this
export const onFrame = { fn: null };

let renderer, scene, camera, controls, grid, gridCols0;
const clock = new THREE.Clock();
const tweens = [];
const G = { table: new THREE.Group(), exp: new THREE.Group(), intro: new THREE.Group() };
let mode = 'idle';                       // 'idle' | 'intro' | 'act' | 'exp'

const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ---------------------------------------------------------------- helpers */
const clean = n => n.replace(/[.\[\]:/\s]/g, '');          // GLTFLoader strips . [ ] : / from node names
function find(root, name) {
  const want = clean(name); let hit = null;
  root.traverse(o => { if (!hit && clean(o.name) === want) hit = o; });
  if (!hit) throw new Error('Model part not found: ' + name);
  return hit;
}
function box(o) { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); }

// Put an object inside a group whose origin is the footprint centre on the ground (y = 0 is the bottom).
function normalize(obj, scale = 1) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  inner.add(obj); outer.add(inner);
  const b = box(inner), c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);
  outer.scale.setScalar(scale);
  outer.userData.size = b.getSize(new THREE.Vector3());
  outer.userData.inner = inner;
  return outer;
}
function meshOf(o) { return o.isMesh ? o : o.getObjectByProperty('isMesh', true); }
function paint(o, hex, extra = {}) {            // give a mesh its own plain-coloured material (no texture)
  const m = meshOf(o); if (!m) return null;
  m.material = m.material.clone(); m.material.map = null; m.material.color.set(hex);
  Object.assign(m.material, extra); m.material.needsUpdate = true;
  return m.material;
}

/* ---------------------------------------------------------------- tweens */
function tween(ms, fn, { key, ease = easeInOut } = {}) {
  if (key) cancel(key);
  return new Promise(res => tweens.push({ t0: performance.now(), ms: Math.max(1, ms), fn, key, ease, res }));
}
function cancel(key) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1); }
function stepTweens() {
  const now = performance.now();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i], k = Math.min(1, (now - t.t0) / t.ms);
    t.fn(t.ease(k));
    if (k >= 1) { tweens.splice(i, 1); t.res(); }
  }
}

/* ---------------------------------------------------------------- canvas textures */
/** soft light patch seen on a surface.  'paper': white core, pale warm halo that melts into the paper (normal blending, like a real torch spot on white paper);
 *  'card': warm light that brightens the tan cardboard (added on top of it) */
function spotTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const stops = kind === 'paper'
    ? [[0, 'rgba(255,255,250,1)'], [.14, 'rgba(255,251,222,.97)'], [.32, 'rgba(255,238,160,.78)'], [.55, 'rgba(255,218,110,.38)'], [.8, 'rgba(255,200,85,.12)'], [1, 'rgba(255,190,70,0)']]
    : [[0, 'rgba(255,246,205,.95)'], [.3, 'rgba(255,214,120,.62)'], [.65, 'rgba(255,170,60,.22)'], [1, 'rgba(255,140,30,0)']];
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(.35, 'rgba(255,190,70,.55)'); gr.addColorStop(1, 'rgba(255,150,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

/** teardrop flame (demo.mp4): yellow body with an orange rim and a soft edge; `core` = the brighter inner tongue */
function flameTex(core) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  g.beginPath(); g.moveTo(64, 244); g.bezierCurveTo(12, 214, 16, 126, 64, 10); g.bezierCurveTo(112, 126, 116, 214, 64, 244); g.closePath();
  let gr;
  if (core) { gr = g.createLinearGradient(0, 244, 0, 10); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.5, 'rgba(255,246,170,1)'); gr.addColorStop(.9, 'rgba(255,230,110,.35)'); gr.addColorStop(1, 'rgba(255,220,100,0)'); g.shadowColor = 'rgba(255,240,150,.9)'; g.shadowBlur = 6; }
  else { gr = g.createRadialGradient(64, 178, 6, 64, 170, 112); gr.addColorStop(0, 'rgba(255,238,120,1)'); gr.addColorStop(.45, 'rgba(255,196,40,1)'); gr.addColorStop(.8, 'rgba(255,120,10,.92)'); gr.addColorStop(1, 'rgba(255,70,0,0)'); g.shadowColor = 'rgba(255,140,20,.9)'; g.shadowBlur = 14; }
  g.fillStyle = gr; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const flameSprite = (core, w, h) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(core), transparent: true, depthWrite: false })); m.center.set(0.5, 0.06); m.scale.set(w, h, 1); m.userData.b = [w, h]; return m; };

/* ---------------------------------------------------------------- pipe bending (keeps the original textured pipe) */
function makeBender(mesh) {
  const g = mesh.geometry = mesh.geometry.clone();
  // ltsl_models.glb ships this pipe with a blend-shape at weight 0.5 (a half-bent pipe) and its bounding box includes the blend-shape.
  // We bend the mesh ourselves, so drop it: the pipe is now truly straight at rest and normalize() sees the real size.
  g.morphAttributes = {}; g.morphTargetsRelative = false; g.boundingBox = null; g.boundingSphere = null;
  mesh.morphTargetInfluences = undefined; mesh.morphTargetDictionary = undefined;
  const P = g.attributes.position, N = g.attributes.normal;
  const p0 = Float32Array.from(P.array), n0 = Float32Array.from(N.array);
  let sMin = Infinity, sMax = -Infinity;
  for (let i = 1; i < p0.length; i += 3) { sMin = Math.min(sMin, p0[i]); sMax = Math.max(sMax, p0[i]); }
  const len = sMax - sMin, Rb = len * 0.27, s0 = sMin + len * 0.42;         // raw geometry units
  return function setBend(theta) {
    const sEnd = s0 + Rb * theta, ex = s0 + Rb * Math.sin(theta), ey = Rb * (1 - Math.cos(theta));
    for (let i = 0; i < p0.length; i += 3) {
      const u = p0[i], s = p0[i + 1], w = p0[i + 2];
      const phi = Math.min(theta, Math.max(0, (s - s0) / Rb));
      let ca, cb;
      if (s <= s0) { ca = s; cb = 0; }
      else if ((s - s0) / Rb < theta) { ca = s0 + Rb * Math.sin(phi); cb = Rb * (1 - Math.cos(phi)); }
      else { ca = ex + (s - sEnd) * Math.cos(theta); cb = ey + (s - sEnd) * Math.sin(theta); }
      const sn = Math.sin(phi), cs = Math.cos(phi);
      P.array[i] = u; P.array[i + 1] = ca - w * sn; P.array[i + 2] = cb + w * cs;
      const nu = n0[i], na = n0[i + 1], nw = n0[i + 2];
      N.array[i] = nu; N.array[i + 1] = na * cs - nw * sn; N.array[i + 2] = na * sn + nw * cs;
    }
    P.needsUpdate = true; N.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
  };
}

/* ---------------------------------------------------------------- init */
export async function init() {
  const canvas = $('#c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 2));   // touch devices: 1.5 is plenty sharp and keeps phones / tablets smooth

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03062a);   // same background as the Types of Motion simulation
  scene.fog = new THREE.Fog(0x03062a, 30, 110);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0.5, 5.5, 10.5);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 0.5; controls.maxDistance = 60;
  controls.minPolarAngle = Math.PI * 0.03; controls.maxPolarAngle = POLAR_FREE;
  controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;   // full 360 deg turn around the model
  controls.addEventListener('start', () => { S.touched = true; });            // after this a rotate / resize no longer re-frames the view
  controls.target.set(0.8, 1.0, 0.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a80, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(6, 12, 9); scene.add(sun);
  grid = new THREE.GridHelper(260, 130, 0x3b7185, 0x3b7185); grid.position.y = -0.3; scene.add(grid);
  grid.material.transparent = true;
  grid.material.depthWrite = false; grid.renderOrder = -10;   // the floor grid is always drawn FIRST: flame, glow, beams (all transparent) are painted over it, so no grid line crosses them
  gridCols0 = Float32Array.from(grid.geometry.attributes.color.array);
  Object.values(G).forEach(g => scene.add(g));

  addEventListener('resize', resize); resize();

  const loader = new GLTFLoader();
  const [ltsl, mb, torch, table] = await Promise.all(['ltsl_models.glb', 'matchbox.glb', 'torch.glb', 'table.glb']
    .map(f => loader.loadAsync('assets/models/' + f).then(r => r.scene)));

  buildTable(ltsl, mb, table);
  buildExperiment(ltsl, torch);
  buildIntro(torch);
  bindInput(canvas);
  mode = 'intro'; refreshVisibility();      // the torch model comes first
  setView(VIEW.intro);
  renderer.setAnimationLoop(tick);
}

export function setTheme(dark) {   // same values as the CSS variables: --bg-secondary, --grid-color, --grid-opacity
  const c = new THREE.Color(dark ? 0x3b7185 : 0xd4cfa8), col = grid.geometry.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  col.needsUpdate = true; grid.material.color.set(0xffffff); grid.material.opacity = dark ? 0.35 : 0.45;
  const bg = dark ? 0x03062a : 0xfffdde;      // light mode: soft cream (colour taken from image.png)
  scene.background.setHex(bg); scene.fog.color.setHex(bg);
  themeDark = !!dark; applyBeamTheme();
}
/** Light is ADDED on top of the background, which only works on a dark one (on cream it saturates to white and vanishes).
 *  So in light mode the beams use normal blending with a warm amber instead. */
function applyBeamTheme() {
  if (I.coneDark) { I.coneDark.visible = themeDark; I.coneLight.visible = !themeDark; }
  if (beamMesh) beamMesh.material.color.setHex(themeDark ? COL.beam : 0xf29a00);
}

/* ---------------------------------------------------------------- activity table */
const T = {};
export const table = T;      // handles for debugging / tuning
function buildTable(ltsl, mb, tableScene) {
  const g = G.table;
  g.add(tableScene.clone());

  // candle (holder + candle in one mesh)
  const candleMesh = find(ltsl, 'Candelabro').clone();
  paint(candleMesh, COL.candle, { metalness: 0.0, roughness: 0.55 });              // demo.mp4: plain white candle + white holder
  const candle = normalize(candleMesh, 1);
  candle.position.set(1.6, 0, 0.3); g.add(candle);
  const wick = new THREE.Vector3(1.6, candle.userData.size.y - 0.02, 0.3);
  T.wick = wick; T.candle = candle;

  // flame
  const flame = new THREE.Group();
  const outer = flameSprite(false, 0.36, 0.66), inner = flameSprite(true, 0.17, 0.4);   // real teardrop fire (always faces the camera)
  outer.material.opacity = .95; outer.position.y = 0.0; inner.position.y = 0.01;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.3, 1.3, 1); glow.position.y = 0.24;
  const light = new THREE.PointLight(0xffb55a, 0, 14, 1.6); light.position.y = 0.3;
  flame.add(outer, inner, glow, light);
  flame.position.copy(wick); flame.visible = false; g.add(flame);
  T.flame = flame; T.flameLight = light;

  // matchbox + loose match
  const mbRoot = mb.clone();
  const boxMesh = find(mbRoot, 'box'), b0 = box(boxMesh);
  mbRoot.traverse(o => { if (o.isMesh) {            // demo.mp4: cream cardboard + colourful label - opaque and matte, so the texture colours show true
    o.material = o.material.clone(); const m = o.material;
    m.transparent = false; m.alphaTest = 0; m.depthWrite = true; m.opacity = 1; m.metalness = 0; m.roughness = 0.85;
    m.color.set(0xffffff); if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.needsUpdate = true;
  } });
  T.boxMesh = boxMesh;
  const matchSrc = find(mbRoot, 'match022'), matchHost = matchSrc.parent;     // the real stick of the box (no copy)
  const tray = []; mbRoot.traverse(o => { if (o.parent === matchHost && (clean(o.name) === 'insert' || /^match/.test(clean(o.name)))) tray.push({ o, x: o.position.x }); });
  T.tray = tray; T.trayOpen = k => tray.forEach(r => { r.o.position.x = r.x + 0.02 * k; });   // the inner tray (with all sticks) slides out of the box
  const mbn = normalize(mbRoot, 1), mbInner = mbn.userData.inner, sz = mbn.userData.size;
  const k = 1.15 / Math.max(sz.x, sz.z);
  mbn.scale.setScalar(k);
  mbn.position.set(4.6, 0, 0.9); mbn.rotation.y = Math.PI - 0.52; g.add(mbn);   // demo.mp4: box lies turned, tray opens towards the upper left
  Object.assign(T, { matchbox: mbn, match: matchSrc, matchParent: matchHost, matchHome: matchSrc.position.clone(), matchS0: matchSrc.scale.clone(), matchQ0: matchSrc.quaternion.clone() });
  // real stick size, measured from its geometry (LOCAL units; the node itself has scale 100 and the box another ~22x on top).
  // The head (the thick end) is at local +z.  Do NOT hard-code these: 0.04227 / 0.0212 were 100x too big, which threw the stick and its flame far off screen.
  { let sm = matchSrc; if (!sm.geometry) matchSrc.traverse(o => { if (o.isMesh && !sm.geometry) sm = o; });
    sm.geometry.computeBoundingBox(); const sb = sm.geometry.boundingBox;
    T.stickLen = sb.max.z - sb.min.z;      // length of the stick, local units
    T.stickHeadZ = sb.max.z; }             // tip of the head, local z
  // small flame on the head of the burning stick (kept in the scene, follows the stick head every frame)
  const sf = new THREE.Group();
  const so = flameSprite(false, 0.3, 0.55), si = flameSprite(true, 0.14, 0.33);
  const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sg.scale.set(1.0, 1.0, 1); sg.position.y = 0.2;
  sf.add(so, si, sg); sf.visible = false; scene.add(sf); T.stickFlame = sf;

  // pipe: ONE hollow textured mesh that can bend.  Both the straight and the bent pipe use this same material, so the colour never changes.
  const pipeMesh = find(ltsl, 'Cylinder002').clone();
  const pm = meshOf(pipeMesh);
  pm.material = pm.material.clone();
  pm.material.side = THREE.DoubleSide;            // the inside of the pipe is seen from the eye position - same gold as the outside
  T.setBend = makeBender(pm);
  const pipe = normalize(pipeMesh, 0.75);
  T.pipe = pipe; T.pipeR = 0.18 * 0.75;
  g.add(pipe);
  resetPipe();
}
const PIPE_REST = { x: -3.1, y: 0, z: 1.3, ry: Math.PI / 2 };
function resetPipe() {
  T.setBend(0); T.bend = 0;
  T.pipe.rotation.set(0, PIPE_REST.ry, 0); T.pipe.position.set(PIPE_REST.x, PIPE_REST.y, PIPE_REST.z);
}
const pipePlaced = () => ({ x: T.wick.x, y: T.wick.y + 0.2 - T.pipeR, z: T.wick.z + 1.3 + 2.8 });

let candleRun = 0;
function resetCandle() {
  cancel('candle');
  T.flame.visible = false; T.flameLight.intensity = 0; T.flame.scale.set(1, 1, 1); T.flameBoost = 1; cancel('boost');
  T.match.visible = true; T.stickFlame.visible = false; T.trayOpen(0);
  T.matchParent.add(T.match); T.match.position.copy(T.matchHome); T.match.scale.copy(T.matchS0); T.match.quaternion.copy(T.matchQ0);
}
/** the brown striking strip on the long side of the box that faces the camera: { from, to, nrm } in world space
 *  (from -> to runs towards the candle, nrm = outward normal of that side).  The strip is the box's -y / +y face (UV u 0..0.12 / 0.51..0.63). */
function strikeStrip() {
  let bm = T.boxMesh; if (!bm.geometry) bm.traverse(o => { if (o.isMesh && !bm.geometry) bm = o; });
  T.matchbox.updateMatrixWorld(true);
  const g = bm.geometry; g.computeBoundingBox(); const bb = g.boundingBox, zc = (bb.min.z + bb.max.z) / 2;
  const centre = bm.localToWorld(new THREE.Vector3(0, 0, zc));
  const cand = [bb.min.y, bb.max.y].map(y => {
    const a = bm.localToWorld(new THREE.Vector3(bb.min.x, y, zc)), b = bm.localToWorld(new THREE.Vector3(bb.max.x, y, zc));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    return { a, b, mid, nrm: mid.clone().sub(centre).setY(0).normalize() };
  });
  const f = cand[0].mid.z > cand[1].mid.z ? cand[0] : cand[1];            // the side that faces the camera
  return f.a.x > f.b.x ? { from: f.a, to: f.b, nrm: f.nrm } : { from: f.b, to: f.a, nrm: f.nrm };
}

/** on = true (demo.mp4): the tray slides open (sticks show), one stick is pulled up, laid on the left of the box and struck on it - the head bursts into
 *  a real flame; the burning stick flies to the candle, tilts onto the wick and lights it; then it floats away and lies down next to the box.
 *  Resolves when the candle flame is on.  on = false: reset. */
export async function lightCandle(on) {
  const id = ++candleRun;
  resetCandle();
  if (!on) return;
  const live = () => id === candleRun;
  const m = T.match, K = { key: 'candle' };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Bx = T.matchbox.position.x, Bz = T.matchbox.position.z, sY = 0.08;
  const lerpV = (a, b, k) => a.clone().lerp(b, k), lerpD = (a, b, k) => a.clone().lerp(b, k).normalize();
  let P0, Q0, d0, L, curC, curD; const qd = new THREE.Quaternion();
  const set = (C, D) => {                                                                       // head -> direction D; the stick is never allowed below the table top
    const Dn = D.clone().normalize(), low = C.y - Math.abs(Dn.y) * L / 2 - 0.05, C2 = C.clone(); if (low < 0) C2.y -= low;
    m.position.copy(C2); qd.setFromUnitVectors(d0, Dn); m.quaternion.copy(qd).multiply(Q0);
  };
  const to = (C, D) => { curC = C.clone(); curD = D.clone(); };
  const move = (ms, C1, D1, arc = 0) => { const C0 = curC.clone(), D0 = curD.clone(); return tween(ms, k => { const C = lerpV(C0, C1, k); C.y += Math.sin(k * Math.PI) * arc; set(C, lerpD(D0, D1, k)); }, K).then(() => { to(C1, D1); }); };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  flyTo(VIEW.candle, 900);                                          // candle on the left, box on the lower right (like the video)
  await wait(500); if (!live()) return;
  await tween(900, k => T.trayOpen(k), K); if (!live()) return;     // 1. the tray slides out of the box (towards the upper left): sticks show
  scene.attach(m);                                                  // from here on the stick lives in world space
  P0 = m.getWorldPosition(new THREE.Vector3()); Q0 = m.quaternion.clone();
  d0 = V(0, 0, 1).applyQuaternion(Q0).normalize();                  // the way the head points (= the open end of the box)
  L = T.stickLen * m.getWorldScale(new THREE.Vector3()).x;        // real length of the stick in world units (~0.95)
  const U = d0.clone().setY(0).normalize();
  to(P0, d0);
  await wait(250); if (!live()) return;
  await move(600, P0.clone().addScaledVector(U, 0.1).add(V(0, 0.8, 0)), U.clone().multiplyScalar(0.35).add(V(0, 1, 0))); if (!live()) return;   // 2. one stick is pulled up ...
  const st = strikeStrip(), sDir = st.to.clone().sub(st.from).setY(0).normalize();               //    ... and carried to one end of the brown strip on the box side
  const hold = sDir.clone().multiplyScalar(0.45).addScaledVector(st.nrm, -0.7).add(V(0, -0.45, 0)).normalize();   // stick leans: head presses on the strip (low), tail trails behind and ABOVE it - never into the table
  const Hs = st.from.clone().addScaledVector(st.nrm, 0.03), He = st.to.clone().addScaledVector(st.nrm, 0.03);
  const Hw = Hs.clone().addScaledVector(st.nrm, 0.35).addScaledVector(sDir, -0.2);              // wind-up spot: a little off the strip, before its start
  const spark = P => {                                                                           // one tiny spark flying off the rubbing head
    T.sparkTex = T.sparkTex || glowTex();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sparkTex, color: 0xffc860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(0.13); sp.position.copy(P); scene.add(sp);
    const v = V((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4).addScaledVector(st.nrm, 0.5);
    tween(380, k => { sp.position.addScaledVector(v, 0.016); v.y -= 0.025; sp.material.opacity = 1 - k; }).then(() => { scene.remove(sp); sp.material.dispose(); });
  };
  await move(900, Hw.clone().addScaledVector(hold, -L / 2), hold, 0.3); if (!live()) return;
  await wait(250); if (!live()) return;
  await tween(200, k => set(lerpV(Hw, Hs, k).addScaledVector(hold, -L / 2), hold), K); if (!live()) return;   // 3a. the head is pressed on the strip
  let nSp = 0;
  await tween(420, k => {                                                                        // 3b. ONE QUICK RUB along the whole brown strip (speeds up) with sparks ...
    const H = lerpV(Hs, He, k); set(H.clone().addScaledVector(hold, -L / 2), hold);
    while (nSp < k * 14) { nSp++; spark(H); }
    if (k > 0.8 && !T.stickFlame.visible) { T.stickFlame.visible = true; T.stickFlame.scale.setScalar(0.1); }   // ... and at the end of the rub the head catches fire
    if (T.stickFlame.visible) T.stickFlame.scale.setScalar(Math.min(1.15, 0.1 + (k - 0.8) / 0.2 * 1.05));
  }, { key: 'candle', ease: x => x * x }); if (!live()) return;
  to(He.clone().addScaledVector(hold, -L / 2), hold);
  await tween(300, k => T.stickFlame.scale.setScalar(1.15 - 0.15 * k), K); if (!live()) return;   // flame settles
  await wait(500); if (!live()) return;
  const a = 0.62, flyD = V(-Math.cos(a), -Math.sin(a), 0);                                       // head down-left, like in the video
  const wickHead = V(T.wick.x - 0.02, T.wick.y - 0.03, T.wick.z + 0.08);
  const candleC = wickHead.clone().addScaledVector(flyD, -L / 2);
  await move(550, curC.clone().add(V(-0.1, 1.0, 0.1)), flyD.clone().add(V(0.2, 0.3, 0))); if (!live()) return;   // 4. lifted (flame upright) ...
  await move(1400, candleC, flyD, 0.3); if (!live()) return;                                     // 5. ... flies to the candle and touches the wick
  T.flame.visible = true; T.flameBoost = 0.2;
  await tween(600, k => { T.flameLight.intensity = 14 * k; T.flameBoost = 0.2 + 1.25 * k; T.stickFlame.scale.setScalar(1 - 0.85 * k); }, K); if (!live()) return;   // 6. candle lights (big flame)
  T.stickFlame.visible = false;
  await wait(700); if (!live()) return;
  const away = move(900, wickHead.clone().add(V(1.0, 0.9, 0.3)), V(-1, -0.35, 0));              // 7. stick floats away to the right ...
  tween(700, k => { T.flameBoost = 1.45 - 0.45 * k; }, { key: 'boost' });                        //    (the candle flame settles to its normal size)
  await away; if (!live()) return;
  flyTo(VIEW.table, 1300);
  await move(1300, V(Bx - 0.1, sY, Bz + 0.95), V(-1, 0, 0.03), 0.4); if (!live()) return;       // 8. ... and lies down in front of the box
}

/** front = true: carry the pipe in front of the candle.  front = false: put it back on the table, straight (ms = 0: instantly). */
export function placePipe(front, ms = 1300) {
  const p = T.pipe; cancel('pipe');
  const a = { x: p.position.x, y: p.position.y, z: p.position.z, r: p.rotation.y, b: T.bend || 0 };
  const tgt = front ? pipePlaced() : PIPE_REST, r1 = front ? 0 : PIPE_REST.ry, b1 = front ? a.b : 0;
  if (!ms) { p.position.set(tgt.x, tgt.y, tgt.z); p.rotation.set(0, r1, 0); T.bend = b1; T.setBend(b1); return Promise.resolve(); }
  return tween(ms, k => {
    p.position.set(a.x + (tgt.x - a.x) * k, a.y + (tgt.y - a.y) * k + Math.sin(Math.PI * k) * 0.8, a.z + (tgt.z - a.z) * k);
    p.rotation.y = a.r + (r1 - a.r) * k;
    T.bend = a.b + (b1 - a.b) * k; T.setBend(T.bend);
  }, { key: 'pipe' });
}
/** bent = true: bend the pipe (Promise).  false: straighten it instantly. */
export function setPipeBent(bent, ms = 1300) {
  cancel('bend');
  if (!bent) { T.bend = 0; T.setBend(0); return Promise.resolve(); }
  const b0 = T.bend || 0;
  return tween(ms, k => { T.bend = b0 + (W.BEND - b0) * k; T.setBend(T.bend); }, { key: 'bend' });
}

/* ---------------------------------------------------------------- experiment */
export const X = { beamY: 0, lensZ: 0, zs: [5, 8, 11], screenZ: 14.4, offsets: [0, 0, 0], offsetsX: [0, 0, 0], sliders: [], torchOn: false };   // offsets = up/down (y), offsetsX = sideways (x, +x = LEFT as seen from the torch)
const HOLE_Y = 2.071;                               // hole centre height above the stand base (measured from the model)
const TORCH_Z = 1.4;
let beamMesh, beamGlow, lensGlow, screenSpot, cardSpot;
function buildExperiment(ltsl, torchScene) {
  const g = G.exp;
  X.beamY = HOLE_Y;

  // base board
  const boardMesh = find(ltsl, 'Cube002').clone();
  paint(boardMesh, COL.board);
  const board = normalize(boardMesh, 1), bs = board.userData.size;
  board.scale.set(4.4 / bs.x, 1, 16.4 / bs.z);
  board.position.set(0, -bs.y, 8.0); g.add(board);

  // torch stand + torch
  const holderMesh = find(ltsl, 'torch_holder002').clone();
  paint(holderMesh, COL.pole, { metalness: 0.5, roughness: 0.45 });                 // model ships a green material; demo.mp4 stand is dark
  const holder = normalize(holderMesh, 1);
  holder.position.set(0, 0, TORCH_Z); g.add(holder);
  const ts = 0.85, torch = torchScene.clone();
  const tg = new THREE.Group(); tg.add(torch); tg.scale.setScalar(ts);
  tg.position.set(0, HOLE_Y, TORCH_Z + 0.45 * ts); g.add(tg);
  X.lensZ = TORCH_Z + 0.45 * ts + 1.2 * ts; X.torchZ = TORCH_Z + 0.45 * ts;

  // cardboards: static (base + pole) and sliding (clip + card) - demo colours
  X.cardMats = [];
  X.zs.forEach((z, i) => {
    const asm = new THREE.Group();
    const base = find(ltsl, 'Cube001').clone(), pole = find(ltsl, 'cardboard_stand').clone();
    paint(base, COL.base, { metalness: 0.1, roughness: 0.7 });
    paint(pole, COL.pole, { metalness: 0.6, roughness: 0.4 });
    const clip = find(ltsl, 'cardboard_holder').clone(), card = find(ltsl, 'cardboard').clone();
    paint(clip, COL.clip, { metalness: 0.05, roughness: 0.8, emissive: new THREE.Color(0x1c1209) });
    const cardMat = paint(card, COL.card, { metalness: 0.0, roughness: 0.85, emissive: new THREE.Color(0x2a1c10) });
    const slide = new THREE.Group(); slide.add(clip, card);
    asm.add(base, pole, slide);
    const n = normalize(asm, 1);
    n.position.set(0, 0, z);
    slide.userData.index = i;
    g.add(n);
    X.sliders.push({ group: slide, root: n, z });
    X.cardMats.push(cardMat);
  });

  // screen + wedge stand
  const sc = 0.62;
  const screenMesh = find(ltsl, 'Cube003').clone();
  paint(screenMesh, 0xffffff, { metalness: 0, roughness: 1, emissive: new THREE.Color(0xffffff) });   // pure white paper (emissive keeps it white under any light)
  const screen = normalize(screenMesh, sc); screen.position.set(0, 0, X.screenZ); g.add(screen);
  const stand = normalize(find(ltsl, 'Cube').clone(), sc); stand.position.set(0, 0, X.screenZ + 0.25 + 0.013); g.add(stand);

  // beam
  beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: COL.beam, transparent: true, opacity: 0.95 }));
  beamMesh.position.set(0, HOLE_Y, X.lensZ); g.add(beamMesh); applyBeamTheme();
  const gm = () => new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  beamGlow = new THREE.Sprite(gm()); beamGlow.scale.set(0.7, 0.7, 1); g.add(beamGlow);
  lensGlow = new THREE.Sprite(gm()); lensGlow.scale.set(0.9, 0.9, 1); lensGlow.position.set(0, HOLE_Y, X.lensZ + 0.03); g.add(lensGlow);
  const spotMat = (kind, additive) => new THREE.MeshBasicMaterial({ map: spotTex(kind), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  screenSpot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spotMat('paper', false));       // the lit patch on the white paper: flat on its face, soft edge (no hard yellow disc)
  screenSpot.scale.set(1.15, 1.15, 1); screenSpot.position.set(0, HOLE_Y, X.screenZ - 0.02); g.add(screenSpot);
  cardSpot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spotMat('card', true));           // where the beam is stopped by a cardboard: a small patch ON the card (it cannot leak past it)
  g.add(cardSpot);
  setOffsets([0, 0, 0]);
  setTorchOn(false);
}
export function setCardOffsets(o, ox = [0, 0, 0]) { setOffsets(o, ox); }   // o = up/down per card, ox = sideways per card (+x = left)
function setOffsets(o, ox = X.offsetsX) {
  X.offsets = o.slice(); X.offsetsX = ox.slice();
  X.sliders.forEach((s, i) => { s.group.position.x = ox[i] || 0; s.group.position.y = o[i] || 0; });
  updateBeam();
}
const holeOff = i => Math.hypot(X.offsets[i] || 0, X.offsetsX[i] || 0);      // how far card i's hole is from the beam axis
export function setTorchOn(on) { X.torchOn = !!on; updateBeam(); }
export const aligned = () => X.zs.every((_, i) => holeOff(i) <= W.BEAM_TOL);
function updateBeam() {
  const on = X.torchOn;
  beamMesh.visible = lensGlow.visible = on; beamGlow.visible = false;           // no glow sprite at the end of the beam: a sprite is camera-facing and bled past the cardboard
  if (!on) { screenSpot.visible = cardSpot.visible = false; return false; }
  let end = X.screenZ - 0.015, reaches = true, hit = -1;
  for (let i = 0; i < X.zs.length; i++) if (holeOff(i) > W.BEAM_TOL) { end = X.zs[i] - 0.03; reaches = false; hit = i; break; }
  const len = Math.max(0.05, end - X.lensZ);
  beamMesh.scale.z = len;
  screenSpot.visible = reaches;
  cardSpot.visible = !reaches;
  if (hit >= 0) {                                                                // patch of light on the card face, never bigger than the card around the beam point
    const room = Math.min(0.611 - Math.abs(X.offsetsX[hit] || 0), 0.629 - Math.abs(X.offsets[hit] || 0));
    cardSpot.position.set(0, X.beamY, X.zs[hit] - 0.025); cardSpot.scale.setScalar(2 * Math.max(0.05, Math.min(0.2, room * 0.9)));
  }
  return reaches;
}
function highlightCard(i, on) { if (X.cardMats[i]) X.cardMats[i].color.setHex(on ? COL.cardHover : COL.card); }

/* ---------------------------------------------------------------- intro: the torch model shown first */
const I = {};
function buildIntro(torchScene) {
  const rig = new THREE.Group(), s = 1.5;                  // rig turns, the torch inside it points along +z (like in the experiment)
  const torch = torchScene.clone(); torch.scale.setScalar(s); rig.add(torch);
  const L = 5.5, R = 1.5, N = 24, lens = 1.2 * s;
  const geo = new THREE.ConeGeometry(R, L, N, 1, true).rotateX(-Math.PI / 2).translate(0, 0, lens + L / 2);   // apex at the lens, opens along +z
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 1 - (pos.getZ(i) - lens) / L; col[3 * i] = 1 * k; col[3 * i + 1] = .93 * k; col[3 * i + 2] = .62 * k; }   // fades out along the beam
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const colA = new Float32Array(pos.count * 4);                                           // light mode: amber with alpha fading along the beam
  for (let i = 0; i < pos.count; i++) { const k = Math.max(0, 1 - (pos.getZ(i) - lens) / L); colA[4 * i] = 1; colA[4 * i + 1] = .70; colA[4 * i + 2] = .10; colA[4 * i + 3] = .08 + .62 * Math.pow(k, .8); }
  const geoL = geo.clone(); geoL.setAttribute('color', new THREE.BufferAttribute(colA, 4));
  const coneL = new THREE.Mesh(geoL, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  rig.add(cone, coneL); I.coneDark = cone; I.coneLight = coneL; applyBeamTheme();
  rig.position.set(0, 2.0, 0); rig.rotation.set(0, Math.PI / 2, 0); G.intro.add(rig); I.rig = rig;   // the torch stays still, pointing right
}

/* ---------------------------------------------------------------- scenes + visibility */
function applyPolar() {                                   // intro: the torch can be turned a full 360 deg in every direction; other free views keep the camera above the table
  const free = !S.locked, intro = mode === 'intro' && free;
  controls.minPolarAngle = intro ? 0 : Math.PI * 0.03;
  controls.maxPolarAngle = S.locked ? POLAR_SCRIPTED : intro ? Math.PI : POLAR_FREE;
}
function refreshVisibility() { fitBox = null; G.table.visible = mode === 'act' || mode === 'idle'; G.exp.visible = mode === 'exp'; G.intro.visible = mode === 'intro'; if (controls) applyPolar(); }
export function showIntro(on) { if (on) mode = 'intro'; else if (mode === 'intro') mode = 'idle'; refreshVisibility(); if (on) flyTo(VIEW.intro, 0); }
export function showActivity(on) { if (on) mode = 'act'; else if (mode === 'act') mode = 'idle'; refreshVisibility(); }
export function showExperiment(on) { if (on) mode = 'exp'; else if (mode === 'exp') mode = 'idle'; refreshVisibility(); }

/* ---------------------------------------------------------------- camera */
/** smallest distance from `target`, looking along `dir` (unit vector target -> camera), at which all 8 corners of `box` are inside the view (|ndc| <= margin) */
const _fc = new THREE.PerspectiveCamera(), _fv = new THREE.Vector3();
function fitDist(box, target, dir, margin = 1) {
  _fc.fov = camera.fov; _fc.aspect = camera.aspect; _fc.near = 0.05; _fc.far = 1000; _fc.updateProjectionMatrix();
  const cs = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) cs.push(new THREE.Vector3(x, y, z));
  const worst = D => { _fc.position.copy(target).addScaledVector(dir, D); _fc.lookAt(target); _fc.updateMatrixWorld(true);
    let m = 0; for (const c of cs) { _fv.copy(c).project(_fc); if (_fv.z > 1) return Infinity; m = Math.max(m, Math.abs(_fv.x), Math.abs(_fv.y)); } return m; };
  let lo = 0.3, hi = 80; if (worst(hi) > margin) return hi;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (worst(mid) > margin) lo = mid; else hi = mid; }
  return hi;
}
let fitBox = null;                                   // bounding box of what is on screen in the current mode (cached per mode)
const modeBox = () => { if (!fitBox) { const g = mode === 'intro' ? G.intro : mode === 'exp' ? G.exp : G.table; g.updateMatrixWorld(true); fitBox = new THREE.Box3().setFromObject(g); } return fitBox; };
const fitDistance = () => fitDist(modeBox(), controls.target, camera.position.clone().sub(controls.target).normalize(), 1);
function introView() {
  G.intro.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(G.intro), c = box.getCenter(new THREE.Vector3());
  const e = 38 * Math.PI / 180, dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));          // 38 deg above the horizon (was ~22)
  const D = fitDist(box, c, dir, 0.88);
  return { fixed: true, dyn: 'intro', pos: c.clone().addScaledVector(dir, D).toArray(), target: c.toArray() };
}
const VIEW = {
  table:  { pos: [0.5, 5.5, 10.5], target: [0.8, 1.0, 0.6], fit: 'table' },
  candle: { pos: [2.2, 2.9, 7.0], target: [2.8, 1.5, 0.5] },
  box:    { pos: [3.3, 2.7, 4.6], target: [3.9, 0.3, 0.9] },
  pipeOut: { pos: [-5.5, 4.6, 9.5], target: [1.6, 2.2, 3.8], fit: 'table' },
  get intro() { return introView(); },   // torch + beam, seen from above (top tilt), distance fitted so nothing is cut off at any window shape
  expSide: { pos: [-11.8, 4.2, 3.8], target: [0, 1.8, 7.6], fit: 'exp', phi: 70 },   // slightly angled, a bit higher
  exp3q:  { pos: [-9.2, 6.8, 1.2], target: [0, 1.4, 8.2], fit: 'exp', phi: 55 }
};
// eye at the near end of the placed pipe, looking through it at the flame
const pipeInside = () => { const p = pipePlaced(); return { fixed: true, pos: [p.x, p.y + T.pipeR, p.z + 2.8 + 0.25], target: [T.wick.x, T.wick.y + 0.2, T.wick.z] }; };

/** The views were framed for a landscape window.  On a narrower window (tablet, phone) the same camera would cut the scene off at the sides:
 *  - overviews (fit: 'exp' = the whole experiment board, 'table' = candle + matchbox + pipe) are re-framed from the real bounding box of that content,
 *    so every part stays inside the window at ANY shape; on a portrait screen the experiment is seen from behind the torch (phi = angle round the board),
 *    because the long board then runs up the screen instead of across it.
 *  - close-ups simply back off along their own line of sight (never more than 3.2x). */
const REF_ASPECT = 1.6;
function contentBox(kind) {
  const b = new THREE.Box3(), add = o => { if (o) { o.updateMatrixWorld(true); b.union(new THREE.Box3().setFromObject(o)); } };
  if (kind === 'exp') add(G.exp); else { add(T.candle); add(T.matchbox); add(T.pipe); }
  return b;
}
function adaptView(v) {
  const a = camera.aspect; if (v.fixed) return v;
  if (v.fit && a < 1.45) {
    const box = contentBox(v.fit);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3()), tgt = new THREE.Vector3(...v.target), eye = new THREE.Vector3(...v.pos);
      const dir = eye.clone().sub(tgt).normalize();
      if (v.fit === 'exp' && a < 1.0) { const ph = (v.phi || 70) * Math.PI / 180, th = 38 * Math.PI / 180; dir.set(-Math.cos(ph) * Math.cos(th), Math.sin(th), -Math.sin(ph) * Math.cos(th)); }
      const D = Math.max(eye.distanceTo(tgt), fitDist(box, c, dir, 0.95));
      return { pos: c.clone().addScaledVector(dir, D).toArray(), target: c.toArray() };
    }
  }
  if (!(a < REF_ASPECT)) return v;
  const k = Math.min(3.2, REF_ASPECT / a), t = new THREE.Vector3(...v.target);
  return { pos: new THREE.Vector3(...v.pos).sub(t).multiplyScalar(k).add(t).toArray(), target: v.target };
}
function setView(v) { S.view = v; S.touched = false; S.viewAspect = camera.aspect; v = adaptView(v); S.viewDist = new THREE.Vector3(...v.pos).distanceTo(new THREE.Vector3(...v.target)); camera.position.set(...v.pos); controls.target.set(...v.target); camera.lookAt(...v.target); controls.update(); }
function flyTo(v, ms = 900) {
  S.view = v; S.touched = false; S.viewAspect = camera.aspect; v = adaptView(v);
  const p1 = new THREE.Vector3(...v.pos), t1 = new THREE.Vector3(...v.target); S.viewDist = p1.distanceTo(t1);
  if (!ms) { S.tween = null; camera.position.copy(p1); controls.target.copy(t1); camera.lookAt(t1); return Promise.resolve(); }
  return new Promise(res => { S.tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, s: performance.now(), ms, res }; });
}
export function lockCamera(on) { S.locked = !!on; controls.enableZoom = controls.enableRotate = !on; applyPolar(); }
export const home = ms => flyTo(mode === 'exp' ? VIEW.expSide : mode === 'intro' ? VIEW.intro : VIEW.table, ms);
export const frameActivity = ms => flyTo(VIEW.table, ms);
export const frameExperiment = ms => flyTo(VIEW.expSide, ms);
export const frameCandle = ms => flyTo(VIEW.candle, ms);
export const frame3q = ms => flyTo(VIEW.exp3q, ms);
export const frameIntro = ms => flyTo(VIEW.intro, ms);
export const framePipeOut = ms => flyTo(VIEW.pipeOut, ms);
export const framePipeInside = ms => flyTo(pipeInside(), ms);

/* ---------------------------------------------------------------- overlay projection / click anchors */
export const project = (arr, off = 0) => {
  const v = new THREE.Vector3(...arr).project(camera), w = innerWidth, h = innerHeight;
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h + off,
           vis: v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
};
export const ANCHOR = {
  matchbox: () => [T.matchbox.position.x, 0.45, T.matchbox.position.z],
  pipe:     () => [T.pipe.position.x, T.pipe.position.y + T.pipeR, T.pipe.position.z],
  torch:    () => [0, HOLE_Y, X.torchZ],
  card:      i  => [X.offsetsX[i] || 0, HOLE_Y + (X.offsets[i] || 0) + 0.9, X.zs[i]]
};

/* ---------------------------------------------------------------- dragging the cardboards (vertical plane, moves along y) */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null, onDrag = null, hover = -1, wired = false, allowed = [0, 1, 2];
function setNdc(e, cv) { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pickCard() {
  if (!G.exp.visible) return -1;
  const hit = ray.intersectObjects(X.sliders.map(s => s.group), true)[0];
  if (hit) {
    let o = hit.object; while (o && o.userData.index == null) o = o.parent;
    if (o && allowed.includes(o.userData.index)) return o.userData.index;
  }
  if (!COARSE) return -1;
  // finger: a cardboard seen from the side is only a thin strip, so also accept a touch that lands close to one on the screen
  const rc = renderer.domElement.getBoundingClientRect(); let best = -1, bd = 46;
  allowed.forEach(i => {
    const p = new THREE.Vector3(X.offsetsX[i] || 0, HOLE_Y + (X.offsets[i] || 0), X.zs[i]).project(camera); if (p.z > 1) return;
    const d = Math.hypot((ndc.x - p.x) * rc.width / 2, (ndc.y - p.y) * rc.height / 2); if (d < bd) { bd = d; best = i; }
  });
  return best;
}
/** all three cardboards glide up and down on their own (until the person grabs one, or `on` = false) */
export function autoCards(on) {
  cancel('cards'); if (!on) return;
  const ph = [0, 2.1, 4.2], sp = [0.9, 0.7, 1.1], A = 0.6, t0 = performance.now();
  tween(60000, () => { const t = (performance.now() - t0) / 1000; setOffsets(ph.map((p, i) => A * Math.sin(p + t * sp[i]))); }, { key: 'cards', ease: x => x });
}
/** glide all three cardboards (smoothly, once) to the given up/down offsets and leave them standing there - no automatic motion afterwards.
 *  They can still be dragged by hand (a grab cancels the glide). */
export function moveCards(target, ms = 700) {
  const from = X.offsets.slice(), fromX = X.offsetsX.slice();
  return tween(ms, k => setOffsets(from.map((v, i) => v + ((target[i] || 0) - v) * k), fromX.map(v => v * (1 - k))), { key: 'cards' });
}
export function enableCardDrag(on, cb, which = [0, 1, 2]) {   // `which` = indices of the cardboards that can be moved
  onDrag = on ? cb : null; allowed = which.slice(); if (!on) cancel('cards');
  if (!on) { if (drag) { highlightCard(drag.idx, false); controls.enabled = true; } drag = null; if (hover >= 0) highlightCard(hover, false); hover = -1; if (renderer) renderer.domElement.style.cursor = ''; }
}
function bindInput(cv) {
  if (wired) return; wired = true;
  cv.addEventListener('pointerdown', e => {
    if (!onDrag || !G.exp.visible) return;
    setNdc(e, cv);
    const idx = pickCard(); if (idx < 0) return;
    const wp = new THREE.Vector3(); X.sliders[idx].root.getWorldPosition(wp);
    const nrm = new THREE.Vector3(camera.position.x - wp.x, 0, camera.position.z - wp.z); if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0); nrm.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, new THREE.Vector3(wp.x + (X.offsetsX[idx] || 0), wp.y + HOLE_Y, wp.z)), hit = new THREE.Vector3();   // vertical, faces the camera: works from the side AND from behind
    if (!ray.ray.intersectPlane(plane, hit)) return;
    cancel('cards');
    if (Math.abs(X.offsetsX[idx] || 0) > W.BEAM_TOL) {      // card is pushed sideways: this drag slides it left/right (screen-horizontal) until its hole is back on the beam
      const p0 = new THREE.Vector3(wp.x + (X.offsetsX[idx] || 0), wp.y + HOLE_Y + (X.offsets[idx] || 0), wp.z), p1 = p0.clone().add(new THREE.Vector3(1, 0, 0));
      const a = p0.clone().project(camera), b = p1.clone().project(camera), rc = cv.getBoundingClientRect();
      let h = (b.x - a.x) * rc.width / 2;                    // screen pixels per world unit of +x (negative: +x points to the left of the screen)
      if (Math.abs(h) < 12) h = h < 0 ? -12 : 12;
      drag = { idx, mode: 'x', cx: e.clientX, x0: X.offsetsX[idx], h };
    } else drag = { idx, mode: 'y', plane, grab: hit.y - X.offsets[idx] };
    controls.enabled = false; highlightCard(idx, true);
    cv.setPointerCapture(e.pointerId); e.stopImmediatePropagation();
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!onDrag) return;
    setNdc(e, cv);
    if (drag && drag.mode === 'x') {
      const ox = X.offsetsX.slice(); ox[drag.idx] = Math.max(-W.DRAG_LIMIT, Math.min(W.DRAG_LIMIT, drag.x0 + (e.clientX - drag.cx) / drag.h));
      setOffsets(X.offsets, ox); onDrag(false);
      return;
    }
    if (drag) {
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(drag.plane, hit)) {
        const o = X.offsets.slice(); o[drag.idx] = Math.max(-W.DRAG_LIMIT, Math.min(W.DRAG_LIMIT, hit.y - drag.grab));
        setOffsets(o); onDrag(false);
      }
      return;
    }
    const idx = pickCard();
    cv.style.cursor = idx >= 0 ? 'pointer' : '';
    if (idx !== hover) { if (hover >= 0) highlightCard(hover, false); hover = idx; if (idx >= 0) highlightCard(idx, true); }
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null; controls.enabled = true;
    { const o = X.offsets.slice(), ox = X.offsetsX.slice();     // snap each axis to the beam when close
      if (Math.abs(o[d.idx]) <= W.SNAP) o[d.idx] = 0;
      if (Math.abs(ox[d.idx]) <= W.SNAP) ox[d.idx] = 0;
      setOffsets(o, ox); }
    highlightCard(d.idx, hover === d.idx);
    onDrag && onDrag(true);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- keep the model clear of the banner / panel */
const cur = { t: 0, b: 0, l: 0 };
function applyReserve() {
  const Wd = innerWidth, H = innerHeight, o = { t: 0, b: 0, l: 0 };
  const bn = $('#banner'), pn = $('#panel');
  if (bn && !bn.hidden) { const r = bn.getBoundingClientRect(); if (r.width > Wd * 0.8) o.t = Math.max(o.t, r.bottom + 6); }   // only a banner that spans the width pushes the model; a small one just floats over the scene
  if (pn && !pn.hidden) {
    const r = pn.getBoundingClientRect();
    if (r.width > Wd * 0.8) { if (r.top > H * 0.4) o.b = Math.max(o.b, H - r.top + 6); else o.t = Math.max(o.t, r.bottom + 6); }   // phone: card spans the width -> keep the model clear above / below it
    // a card at the side (tablet / desktop) never moves or shrinks the model: it stays centred in the window in every case
  }
  for (const k in cur) { cur[k] += (o[k] - cur[k]) * 0.18; if (Math.abs(o[k] - cur[k]) < 0.5) cur[k] = o[k]; }
  if (cur.t < 0.5 && cur.b < 0.5 && cur.l < 0.5) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
  // draw the whole scene, uniformly scaled (no stretching), centred in the free rectangle
  const fw = Math.max(160, Wd - cur.l), fh = Math.max(120, H - cur.t - cur.b);
  const sc = Math.max(0.35, Math.min(1, fw / Wd, fh / H)), cx = cur.l + fw / 2, cy = cur.t + fh / 2;
  camera.setViewOffset(Wd * sc, H * sc, Wd * sc / 2 - cx, H * sc / 2 - cy, Wd, H);
}
function resize() {
  const w = renderer.domElement.clientWidth || innerWidth, h = renderer.domElement.clientHeight || innerHeight;   // the canvas's real size (mobile browser bars come and go)
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (S.view && !S.touched && !S.tween && Math.abs(camera.aspect - S.viewAspect) > 0.05)           // phone / tablet turned (or window resized): frame the same view again for the new shape
    flyTo(S.view.dyn === 'intro' ? VIEW.intro : S.view, 0);
}
addEventListener('orientationchange', () => setTimeout(() => resize(), 250));

/* Looking through the BENT pipe the flame must be completely hidden: no flame, no glow, no flickering light on the pipe.
   (Seen from outside - while the pipe is being bent - the flame stays visible.) */
const clamp01 = x => Math.max(0, Math.min(1, x));
function blockFlame() {
  const f = T.flame, [outer, inner, glow] = f.children, light = T.flameLight;
  const eye = new THREE.Vector3(T.pipe.position.x, T.pipe.position.y + T.pipeR, T.pipe.position.z + 2.8);
  const b = clamp01((T.bend - 0.4) / 0.6) * clamp01((T.pipe.position.z - 1.8) / 2.2) * clamp01((3 - camera.position.distanceTo(eye)) / 2);
  if (b > 0 || T.flameBlocked) {
    light.intensity = 14 * (1 - b); glow.material.opacity = 1 - b; outer.material.opacity = 0.95 * (1 - b);
    outer.visible = inner.visible = b < 0.5; glow.visible = b < 0.98;
    T.flameBlocked = b > 0;
  }
}

/* ---------------------------------------------------------------- render loop */
function tick() {
  stepTweens();
  const tw = S.tween;
  if (tw) {
    const k = Math.min(1, (performance.now() - tw.s) / tw.ms), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(tw.p0, tw.p1, e);
    controls.target.lerpVectors(tw.t0, tw.t1, e);
    camera.lookAt(controls.target);
    if (k >= 1) { S.tween = null; tw.res(); }
  }
  if (T.stickFlame && T.stickFlame.visible) { T.match.updateMatrixWorld(true); T.stickFlame.position.copy(T.match.localToWorld(new THREE.Vector3(0, 0, T.stickHeadZ))); const f = 1 + Math.sin(performance.now() / 55) * 0.08 + Math.sin(performance.now() / 23) * 0.04, [w, h] = T.stickFlame.children[0].userData.b; T.stickFlame.children[0].scale.set(w / f, h * f, 1); }
  if (T.flame && T.flame.visible) {
    const t = clock.getElapsedTime(), f = 1 + Math.sin(t * 17) * 0.06 + Math.sin(t * 29) * 0.04;
    const B = T.flameBoost ?? 1; T.flame.scale.set(B / f, B * f, B / f);
    blockFlame();
  }
  applyReserve();
  { const D = camera.position.distanceTo(controls.target);               // grid fades into the fog a little way out, at any zoom (fog colour = background, set in setTheme: dark + light)
    scene.fog.near = D + 12; scene.fog.far = D + 42;
    // free orbit: zoom in only until the whole model is still in view (nothing cut off); scripted views keep their own framing
    controls.minDistance = (S.locked || S.tween) ? 0.5 : Math.max(0.5, Math.min(fitDistance(), S.viewDist)); }
  controls.update();
  renderer.render(scene, camera);
  onFrame.fn && onFrame.fn();
}