// 3D world: scenes, models, beam, pipe bending, picking, camera tweens.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const W = {
  // layout numbers (world units)
  BEAM_TOL: 0.045,          // |offset| below this lets the beam through a cardboard hole
  SNAP: 0.09,               // on release, snap to aligned inside this distance
  DRAG_LIMIT: 0.95
};

let renderer, scene, camera, controls;
const clock = new THREE.Clock();
const tweens = [];
const groups = { intro: new THREE.Group(), table: new THREE.Group(), exp: new THREE.Group() };
let pickables = [];
let hoverObj = null;
let onPick = null;
let drag = null;
let onDragEnd = null;
let userCanOrbit = true;

const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ---------- small helpers ---------- */
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
function parts(root, names) { const g = new THREE.Group(); names.forEach(n => g.add(find(root, n).clone())); return g; }
function tag(group, id) { group.userData.pick = id; return group; }

/* ---------- tweens ---------- */
export function tween(ms, fn, { key, ease = easeInOut } = {}) {
  if (key) for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1);
  return new Promise(res => tweens.push({ t0: performance.now(), ms: Math.max(1, ms), fn, key, ease, res }));
}
function stepTweens() {
  const now = performance.now();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i], k = Math.min(1, (now - t.t0) / t.ms);
    t.fn(t.ease(k));
    if (k >= 1) { tweens.splice(i, 1); t.res(); }
  }
}
export function flyTo(pos, target, ms = 1200) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
  controls.enabled = false;
  return tween(ms, k => {
    camera.position.lerpVectors(p0, p1, k);
    controls.target.lerpVectors(t0, t1, k);
    camera.lookAt(controls.target);
  }, { key: 'cam' }).then(() => { controls.enabled = userCanOrbit; });
}
export function setOrbit(on) { userCanOrbit = on; controls.enabled = on; }
export function setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); }

/* ---------- canvas textures ---------- */
function gradTex(stops, size = 256, vertical = true) {
  const c = document.createElement('canvas'); c.width = vertical ? 4 : size; c.height = vertical ? size : 4;
  const g = c.getContext('2d'), gr = vertical ? g.createLinearGradient(0, 0, 0, size) : g.createLinearGradient(0, 0, size, 0);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return new THREE.CanvasTexture(c);
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(.35, 'rgba(255,190,70,.55)'); gr.addColorStop(1, 'rgba(255,150,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

/* ---------- pipe bending (keeps the original textured pipe) ---------- */
function makeBender(mesh) {
  const g = mesh.geometry = mesh.geometry.clone();
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
    P.needsUpdate = true; N.needsUpdate = true; g.computeBoundingSphere();
  };
}

/* ---------- init + load ---------- */
export async function init(canvas, onProgress = () => {}) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050a3c);
  scene.fog = new THREE.Fog(0x050a3c, 30, 110);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 0.4, 7);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 2; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI * 0.53;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a80, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(6, 12, 9); scene.add(sun);
  const grid = new THREE.GridHelper(260, 130, 0x2a46a8, 0x1a2e84); grid.position.y = -0.3; scene.add(grid);
  Object.values(groups).forEach(g => { g.visible = false; scene.add(g); });

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  };
  addEventListener('resize', onResize); onResize();

  const loader = new GLTFLoader();
  const files = ['ltsl_models.glb', 'matchbox.glb', 'torch.glb', 'table.glb'];
  let done = 0;
  const [ltsl, mb, torch, table] = await Promise.all(files.map(f =>
    loader.loadAsync('assets/models/' + f).then(r => { onProgress(++done, files.length); return r.scene; })));

  buildIntro(torch);
  buildTable(ltsl, mb, table);
  buildExperiment(ltsl, torch);
  buildArrow();
  bindInput(canvas);
  renderer.setAnimationLoop(frame);
}

/* ---------- intro: spinning torch with beam cone ---------- */
function makeBeamCone(len, r0, r1) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, 40, 1, true);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
    alphaMap: gradTex([[0, '#000'], [1, '#fff']])
  });
  return new THREE.Mesh(geo, mat);
}
let introTorch;
function buildIntro(torchScene) {
  const t = torchScene.clone();
  const holder = new THREE.Group(); holder.add(t);
  const cone = makeBeamCone(5.5, 0.3, 1.5); cone.position.z = 1.14; holder.add(cone);
  holder.scale.setScalar(1.35);
  introTorch = new THREE.Group(); introTorch.add(holder);
  groups.intro.add(introTorch);
}

/* ---------- activity table ---------- */
const T = {};      // table scene handles
function buildTable(ltsl, mb, tableScene) {
  const g = groups.table;
  g.add(tableScene.clone());

  // candle (holder + candle in one mesh)
  const candleMesh = find(ltsl, 'Candelabro').clone();
  const candle = normalize(candleMesh, 1);
  candle.position.set(1.6, 0, 0.3);
  tag(candle, 'candle');
  g.add(candle);
  const candleSize = candle.userData.size;
  // the wick sits at the footprint centre of the model (measured: wick x=-0.048, z=-11.293, bbox centre the same)
  const wick = new THREE.Vector3(1.6, candleSize.y - 0.02, 0.3);
  T.wick = wick; T.candle = candle;

  // flame
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.46, 16), new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: .85 }));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.3, 16), new THREE.MeshBasicMaterial({ color: 0xfff08a }));
  outer.position.y = 0.23; inner.position.y = 0.17;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(1.6, 1.6, 1); glow.position.y = 0.25;
  const light = new THREE.PointLight(0xffb55a, 0, 14, 1.6); light.position.y = 0.3;
  flame.add(outer, inner, glow, light);
  flame.position.copy(wick); flame.visible = false;
  g.add(flame);
  T.flame = flame; T.flameLight = light;

  // matchbox + loose match
  const mbRoot = mb.clone();
  const boxMesh = find(mbRoot, 'box');
  const b0 = box(boxMesh);
  const matchSrc = find(mbRoot, 'match022').clone();
  const mbn = normalize(mbRoot, 1);
  const mbInner = mbn.userData.inner;
  const sz = mbn.userData.size;
  const k = 1.15 / Math.max(sz.x, sz.z);
  mbn.scale.setScalar(k);
  matchSrc.position.set(b0.getCenter(new THREE.Vector3()).x, b0.min.y + 0.0011, b0.max.z + 0.011);
  mbInner.add(matchSrc);
  mbn.position.set(4.6, 0, 0.9);
  tag(mbn, 'matchbox');
  g.add(mbn);
  T.matchbox = mbn; T.match = matchSrc; T.matchParent = mbInner; T.matchHome = matchSrc.position.clone(); T.matchS0 = matchSrc.scale.clone(); T.matchQ0 = matchSrc.quaternion.clone(); T.matchK = k;

  // pipe (hollow, textured) – lies on the table, can be placed in front of the candle and bent
  const pipeMesh = find(ltsl, 'Cylinder002').clone();
  const pipe = normalize(pipeMesh, 0.75);
  T.setBend = makeBender(pipeMesh.isMesh ? pipeMesh : pipeMesh.getObjectByProperty('isMesh', true));
  T.pipe = pipe; T.pipeR = 0.18 * 0.75;
  tag(pipe, 'pipe');
  g.add(pipe);
}
export const table = T;
export function resetTable() {
  T.setBend(0);
  T.pipe.rotation.set(0, Math.PI / 2, 0);
  T.pipe.position.set(-3.1, 0, 1.3);
  T.flame.visible = false; T.flameLight.intensity = 0;
  T.match.visible = true;
  T.matchParent.add(T.match); T.match.position.copy(T.matchHome); T.match.scale.copy(T.matchS0); T.match.quaternion.copy(T.matchQ0);
}
export const tableLayout = {
  flameY: () => T.wick.y + 0.2,
  pipePlaced: () => ({ x: T.wick.x, y: T.wick.y + 0.2 - T.pipeR, z: T.wick.z + 1.3 + 2.8 })
};
export async function lightCandle() {
  // lift the match, bring it to the wick, then light the flame
  scene.attach(T.match);
  const s0 = T.match.scale.clone();
  const from = T.match.position.clone();
  const to = new THREE.Vector3(T.wick.x - 0.35, T.wick.y - 0.05, T.wick.z + 0.05);
  const lift = from.clone().add(new THREE.Vector3(0, 1.2, 0.2));
  await tween(700, k => { T.match.position.lerpVectors(from, lift, k); });
  const q0 = T.match.quaternion.clone(), qz = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  await tween(800, k => { T.match.position.lerpVectors(lift, to, k); qz.setFromAxisAngle(zAxis, -0.35 * k); T.match.quaternion.copy(q0).premultiply(qz); });
  T.flame.visible = true;
  await tween(500, k => { T.flameLight.intensity = 14 * k; });
  await tween(500, k => { T.match.position.y = to.y - k * 0.3; T.match.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - k)); });
  T.match.visible = false;
}
export async function placePipe() {
  const p = T.pipe, tgt = tableLayout.pipePlaced();
  const a = { x: p.position.x, y: p.position.y, z: p.position.z, r: p.rotation.y };
  await tween(1300, k => {
    p.position.set(a.x + (tgt.x - a.x) * k, a.y + (tgt.y - a.y) * k + Math.sin(Math.PI * k) * 0.8, a.z + (tgt.z - a.z) * k);
    p.rotation.y = a.r * (1 - k);
  });
}
export async function bendPipe() { await tween(1300, k => T.setBend(k * 1.15)); }
export function pipeView() {
  const p = tableLayout.pipePlaced();
  return { pos: [p.x, p.y + T.pipeR, p.z + 2.8 + 0.25], target: [T.wick.x, T.wick.y + 0.2, T.wick.z] };
}

/* ---------- experiment ---------- */
export const X = { beamY: 0, lensZ: 0, zs: [5, 8, 11], screenZ: 14.4, offsets: [0, 0, 0], sliders: [] };
let beamMesh, beamGlow, screenSpot, lastBeamLen = 0;
function buildExperiment(ltsl, torchScene) {
  const g = groups.exp;
  const HOLE_Y = 2.071;                      // hole centre height above the stand base (measured from the model)
  X.beamY = HOLE_Y;

  // base board
  const boardMesh = find(ltsl, 'Cube002').clone();
  boardMesh.material = boardMesh.material.clone();
  boardMesh.material.map = null; boardMesh.material.color.set(0x2b2b2e); boardMesh.material.needsUpdate = true;
  const board = normalize(boardMesh, 1);
  const bs = board.userData.size;
  board.scale.set(4.4 / bs.x, 1, 16.4 / bs.z);
  board.position.set(0, -bs.y, 8.0);           // top surface at y = 0
  g.add(board);

  // torch stand + torch
  const holder = normalize(find(ltsl, 'torch_holder002').clone(), 1);
  holder.position.set(0, 0, 1.4); g.add(holder);
  const ts = 0.85, torch = torchScene.clone();
  const tg = new THREE.Group(); tg.add(torch); tg.scale.setScalar(ts);
  tg.position.set(0, HOLE_Y, 1.4 + 0.45 * ts);
  g.add(tg);
  X.lensZ = 1.4 + 0.45 * ts + 1.2 * ts;
  X.torchGroup = tg;

  // cardboards: static (base + pole) and sliding (clip + card)
  X.zs.forEach((z, i) => {
    const asm = new THREE.Group();
    const staticPart = parts(ltsl, ['Cube001', 'cardboard_stand']);
    const slide = parts(ltsl, ['cardboard_holder', 'cardboard']);
    slide.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
    asm.add(staticPart, slide);
    const n = normalize(asm, 1);
    n.position.set(0, 0, z);
    tag(slide, 'card' + i);
    slide.userData.index = i;
    // slide's own coordinate frame is the assembly's frame – wrap so moving it only changes y
    g.add(n);
    X.sliders.push({ group: slide, root: n, z });
  });

  // screen + wedge stand
  const sc = 0.62;
  const screen = normalize(find(ltsl, 'Cube003').clone(), sc);
  screen.position.set(0, 0, X.screenZ); g.add(screen);
  const stand = normalize(find(ltsl, 'Cube').clone(), sc);
  stand.position.set(0, 0, X.screenZ + 0.25 + 0.013); g.add(stand);

  // beam
  beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffe94a, transparent: true, opacity: 0.95 }));
  beamMesh.position.set(0, HOLE_Y, X.lensZ);
  g.add(beamMesh);
  beamGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  beamGlow.scale.set(0.7, 0.7, 1); g.add(beamGlow);
  screenSpot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  screenSpot.position.set(0, HOLE_Y, X.screenZ - 0.02); screenSpot.visible = false; g.add(screenSpot);
  X.sliderMats = X.sliders.map(s => { const m = []; s.group.traverse(o => { if (o.isMesh) m.push(o.material); }); return m; });
  setOffsets([0, 0, 0]);
  beamMesh.visible = false; beamGlow.visible = false; screenSpot.visible = false;
  X.torchOn = false;
}
export function setOffsets(o) {
  X.offsets = o.slice();
  X.sliders.forEach((s, i) => { s.group.position.y = o[i]; });
  updateBeam();
}
export function setTorchOn(on) {
  X.torchOn = !!on;
  beamMesh.visible = !!on;
  beamGlow.visible = !!on;
  if (!on) { screenSpot.visible = false; }
  else updateBeam();
}
export const aligned = i => Math.abs(X.offsets[i]) <= W.BEAM_TOL;
export const allAligned = () => X.offsets.every((_, i) => aligned(i));
export function updateBeam() {
  if (!X.torchOn) { beamMesh.visible = false; beamGlow.visible = false; screenSpot.visible = false; return false; }
  let end = X.screenZ - 0.015, reaches = true;
  for (let i = 0; i < X.zs.length; i++) if (!aligned(i)) { end = X.zs[i] - 0.03; reaches = false; break; }
  const len = Math.max(0.05, end - X.lensZ);
  beamMesh.scale.z = len; beamGlow.position.set(0, X.beamY, end);
  beamMesh.visible = true; beamGlow.visible = true;
  screenSpot.visible = reaches;
  beamGlow.scale.setScalar(reaches ? 1.1 : 0.55);
  X.reaches = reaches; lastBeamLen = len;
  return reaches;
}
function highlightSlider(i, on) {
  (X.sliderMats[i] || []).forEach(m => { if (m.emissive) { m.emissive.setHex(on ? 0x2fa860 : 0x000000); m.emissiveIntensity = on ? 0.9 : 0; } });
}
export function expView(kind) {
  if (kind === 'side') return { pos: [-12.5, 3.2, 7.6], target: [0, 1.8, 7.6] };
  return { pos: [-9.2, 6.8, 1.2], target: [0, 1.4, 8.2] };
}

/* ---------- pointer arrow ---------- */
let arrow;
function buildArrow() {
  arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 16).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x1fd6ec, depthTest: false, transparent: true }));
  arrow.renderOrder = 10; arrow.visible = false; scene.add(arrow);
}
let arrowBase = new THREE.Vector3();
export function arrowAt(v) { if (!v) { arrow.visible = false; return; } arrowBase.copy(v); arrow.visible = true; }
export function worldPosOf(obj, dy = 0) {
  const b = box(obj); const c = b.getCenter(new THREE.Vector3()); c.y = b.max.y + dy; return c;
}

/* ---------- scenes ---------- */
export function showScene(name) {
  Object.entries(groups).forEach(([k, g]) => { g.visible = k === name; });
  pickables = []; arrowAt(null);
  setFov(name === 'intro' ? 40 : 45);
}
export function setPickables(list) { pickables = list || []; }
export function waitPick() { return new Promise(res => { onPick = res; }); }
export function clearWaiters() { onPick = null; onDragEnd = null; }
export function onDrag(cb) { onDragEnd = cb; }
export const groupsOf = groups;

/* ---------- input ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setNdc(e, canvas) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pickAt() {
  if (!pickables.length) return null;
  const hits = ray.intersectObjects(pickables, true);
  for (const h of hits) { let o = h.object; while (o) { if (o.userData && o.userData.pick) return { id: o.userData.pick, obj: o, point: h.point }; o = o.parent; } }
  return null;
}
function bindInput(canvas) {
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    setNdc(e, canvas); down = { x: e.clientX, y: e.clientY };
    const p = pickAt();
    if (p && /^card\d$/.test(p.id) && controls.enabled !== undefined) {
      const idx = +p.id.slice(4);
      const root = X.sliders[idx].root, plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
      // drag plane: vertical plane through the card, facing along x (cards are seen from the side, moves along y)
      const wp = new THREE.Vector3(); root.getWorldPosition(wp); plane.constant = -wp.x;
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      drag = { idx, plane, grab: hit.y - X.offsets[idx], moved: false };
      controls.enabled = false; canvas.setPointerCapture(e.pointerId); highlightSlider(idx, true);
    }
  });
  canvas.addEventListener('pointermove', e => {
    setNdc(e, canvas);
    if (drag) {
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(drag.plane, hit)) {
        const v = Math.max(-W.DRAG_LIMIT, Math.min(W.DRAG_LIMIT, hit.y - drag.grab));
        const o = X.offsets.slice(); o[drag.idx] = v; setOffsets(o); drag.moved = true;
      }
      return;
    }
    const p = pickAt();
    const obj = p ? p.obj : null;
    canvas.style.cursor = obj ? 'pointer' : '';
    if (obj !== hoverObj) {
      if (hoverObj && /^card\d$/.test(hoverObj.userData.pick)) highlightSlider(hoverObj.userData.index, false);
      hoverObj = obj;
      if (obj && /^card\d$/.test(obj.userData.pick)) highlightSlider(obj.userData.index, true);
    }
  });
  const end = e => {
    if (drag) {
      const d = drag; drag = null; controls.enabled = userCanOrbit;
      // snap close-but-not-perfect positions to the aligned height
      if (Math.abs(X.offsets[d.idx]) <= W.SNAP) { const o = X.offsets.slice(); o[d.idx] = 0; setOffsets(o); }
      highlightSlider(d.idx, false);
      if (onDragEnd) onDragEnd(d.idx);
      return;
    }
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 6) return;
    setNdc(e, canvas);
    const p = pickAt();
    if (p && onPick && !/^card\d$/.test(p.id)) { const cb = onPick; onPick = null; cb(p.id); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

/* ---------- frame loop ---------- */
function frame() {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  stepTweens();
  if (groups.intro.visible && introTorch) {
    introTorch.rotation.y = Math.sin(t * 0.45) * 1.15 + 0.6;
    introTorch.rotation.x = Math.sin(t * 0.3) * 0.25;
    introTorch.rotation.z = Math.sin(t * 0.37) * 0.45;
    introTorch.position.y = Math.sin(t * 0.8) * 0.15;
  }
  if (T.flame && T.flame.visible) {
    const f = 1 + Math.sin(t * 17) * 0.06 + Math.sin(t * 29) * 0.04;
    T.flame.scale.set(1 / f, f, 1 / f);
  }
  if (arrow && arrow.visible) arrow.position.set(arrowBase.x, arrowBase.y + 0.55 + Math.sin(t * 5) * 0.12, arrowBase.z);
  controls.update();
  renderer.render(scene, camera);
}

export function setCamera(pos, target) {
  camera.position.set(...pos); controls.target.set(...target); camera.lookAt(...target); controls.update();
}
