// The 3D world: real NASA terrain, the walk-in Habitat with its stations, the base outside,
// and a 1.8 m astronaut you can walk around. 1 unit = 1 metre everywhere.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { gameReady } from './ui.js';
import { readSiteMaps } from './nasa.js';

const GRID = 512;              // terrain samples per side
const POST = 5;                // metres between samples (LOLA 5 m/px)
const SPAN = (GRID - 1) * POST;
const PAD_HALF = 50;           // the ground under the base is flattened out to here...
const PAD_BLEND = 40;          // ...then eases back to the real terrain over this distance
const CREW_HEIGHT = 1.8;
const CREW_RADIUS = 0.3;
const GRAVITY = 1.62;          // Moon gravity, m/s2
const WALK = 2.5, RUN = 5, JUMP = 2.6;
const USE_RANGE = 2.4;         // how close you must be to use something with E
const SUN_FULL = 3;

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // gravity is applied by hand in tick()
const loader = new GLTFLoader();

const MODULE_FILES = ['Solar', 'Battery', 'Digger', 'OxygenMaker', 'IceDrill', 'Antenna', 'CargoLander'];
const [heightBuf, habGltf, maps, ...moduleGltfs] = await Promise.all([
  fetch('terrain/ridge_heights.f32').then(r => { if (!r.ok) throw new Error('terrain'); return r.arrayBuffer(); }),
  loader.loadAsync('models/Habitat.glb'),
  readSiteMaps(),
  ...MODULE_FILES.map(f => loader.loadAsync(`models/${f}.glb`)),
]);
const models = Object.fromEntries(MODULE_FILES.map((f, i) => [f, moduleGltfs[i].scene]));
const heights = new Float32Array(heightBuf);
const toWorld = i => (i - (GRID - 1) / 2) * POST;
const toIndex = w => w / POST + (GRID - 1) / 2;

// The base goes on gentle ground that NASA's maps say gets the most sunlight and the best view
// of Earth (for radio). Steep patches are skipped; the chosen pad is then smoothed flat.
function findSite() {
  const win = Math.ceil(PAD_HALF * 2 / POST), reach = Math.round(500 / POST);
  const mid = GRID / 2 - win / 2 | 0;
  let best = { score: -Infinity };
  for (let r = mid - reach; r <= mid + reach; r += 4) {
    for (let c = mid - reach; c <= mid + reach; c += 4) {
      let lo = Infinity, hi = -Infinity, sum = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
        const h = heights[(r + j) * GRID + c + i];
        lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h;
      }
      const range = hi - lo;
      if (range > 15) continue;
      const here = maps.sample(r + win / 2, c + win / 2);
      const score = here.sun + 0.5 * here.earth - 0.01 * range;
      if (score > best.score) best = { score, range, x: toWorld(c + win / 2), z: toWorld(r + win / 2), y: sum / (win * win), col: c + win / 2, row: r + win / 2 };
    }
  }
  return best;
}
const site = findSite();
for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
  const d = Math.max(Math.abs(toWorld(c) - site.x), Math.abs(toWorld(r) - site.z));
  const t = THREE.MathUtils.smoothstep(d, PAD_HALF, PAD_HALF + PAD_BLEND);
  heights[r * GRID + c] = THREE.MathUtils.lerp(site.y, heights[r * GRID + c], t);
}
// What NASA's maps say about this spot, and where the nearest shadowed (icy) ground is.
const siteData = maps.sample(site.row, site.col);
const icePixel = maps.nearestShadow(site.row, site.col, 24);

function groundAt(x, z) {
  const c = THREE.MathUtils.clamp(toIndex(x), 0, GRID - 1.001), r = THREE.MathUtils.clamp(toIndex(z), 0, GRID - 1.001);
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
  const h = (rr, cc) => heights[rr * GRID + cc];
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(h(r0, c0), h(r0, c0 + 1), fc),
    THREE.MathUtils.lerp(h(r0 + 1, c0), h(r0 + 1, c0 + 1), fc), fr);
}

// --- Scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000004);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 8000);

const hemi = new THREE.HemisphereLight(0x8fa6cc, 0x3a3a40, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e8, SUN_FULL);
const SUN_DIR = new THREE.Vector3(0.75, 0.3, 0.45).normalize(); // low sun, as at the south pole
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 800 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const starPos = [];
for (let i = 0; i < 3000; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(6000);
  if (v.y > -500) starPos.push(v.x, v.y, v.z);
}
scene.add(new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, depthWrite: false }),
));

// The Earth hangs low in the sky to the north (the base is at the south pole).
const earth = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 16), new THREE.MeshBasicMaterial({ color: 0x2e96f5 }));
const earthDir = new THREE.Vector3(-0.85, 0.12, -0.5).normalize();
scene.add(earth);

// Regolith grain, baked into a tile so the ground has a sense of size up close.
function regolithTexture() {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7d7d80';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40000; i++) {
    const v = 95 + Math.random() * 60 | 0, s = 1 + Math.random() * 2;
    ctx.fillStyle = `rgba(${v},${v},${v + 2},.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  for (let i = 0; i < 300; i++) {
    const v = 60 + Math.random() * 110 | 0, x = Math.random() * size, y = Math.random() * size, r = 2 + Math.random() * 5;
    ctx.fillStyle = `rgba(${v},${v},${v},.7)`;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(SPAN / 6, SPAN / 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const terrainGeo = new THREE.PlaneGeometry(SPAN, SPAN, GRID - 1, GRID - 1).rotateX(-Math.PI / 2);
const posAttr = terrainGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) posAttr.setY(i, heights[i]);
terrainGeo.computeVertexNormals();
// Permanently shadowed ground (from NASA's PSR map) gets a frosty blue tint.
const tint = new Float32Array(posAttr.count * 3);
for (let i = 0; i < posAttr.count; i++) {
  const r = Math.floor(i / GRID), c = i % GRID, ice = maps.psrAt(r, c);
  tint.set([1 - 0.35 * ice, 1 - 0.2 * ice, 1 + 0.1 * ice], i * 3);
}
terrainGeo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ map: regolithTexture(), roughness: 1, vertexColors: true }));
terrain.receiveShadow = true;
scene.add(terrain);

// Rapier wants the matrix column by column: each column is one x, going down z.
const fieldHeights = new Float32Array(GRID * GRID);
for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) fieldHeights[c * GRID + r] = heights[r * GRID + c];
world.createCollider(RAPIER.ColliderDesc.heightfield(GRID - 1, GRID - 1, fieldHeights, { x: SPAN, y: 1, z: SPAN }));

// --- Habitat ---
const habitat = habGltf.scene;
habitat.position.set(site.x, site.y, site.z);
scene.add(habitat);
const roofMeshes = [], colNodes = [], stationNodes = {};
habitat.traverse(o => {
  if (o.name.startsWith('COL_')) { colNodes.push(o); o.visible = false; return; }
  if (o.name.startsWith('ROOF_')) roofMeshes.push(o);
  const m = o.name.match(/^STATION_([A-Za-z]+)$/);
  if (m) stationNodes[m[1]] = o;
  if (o.isMesh && !o.parent.name.startsWith('COL_')) o.castShadow = o.receiveShadow = !o.material.transparent;
});
habitat.updateMatrixWorld(true);
const inLights = [-4.6, -1.4, 1.8].map(x => {
  const l = new THREE.PointLight(0xfff4dd, 1, 0, 1.6);
  l.position.set(x, 6.3, 0);
  habitat.add(l);
  return l;
});

function addBox(node) {
  const b = new THREE.Box3().setFromObject(node, true);
  if (b.isEmpty()) return null;
  const half = b.getSize(new THREE.Vector3()).multiplyScalar(0.5), mid = b.getCenter(new THREE.Vector3());
  return world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(mid.x, mid.y, mid.z));
}
for (const node of colNodes) addBox(node);

// Rapier's autostep stalls on the 0.49 m steps, so an invisible ramp lies across their outer
// corners and the astronaut walks up that. The steps run from the landing toward +Z.
(function addStepRamp() {
  const box = name => new THREE.Box3().setFromObject(colNodes.find(n => n.name === name), true);
  const landing = box('COL_Landing'), first = box('COL_Step1');
  const run = first.max.z - first.min.z, rise = landing.max.y - first.max.y;
  const angle = Math.atan2(rise, run), thick = 0.1;
  const length = (landing.max.y - site.y + 0.5) / Math.sin(angle);
  const down = new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle));
  const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
  const mid = new THREE.Vector3((first.min.x + first.max.x) / 2, landing.max.y, landing.max.z)
    .addScaledVector(down, length / 2).addScaledVector(normal, -thick);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
  world.createCollider(RAPIER.ColliderDesc.cuboid((first.max.x - first.min.x) / 2, thick, length / 2)
    .setTranslation(mid.x, mid.y, mid.z).setRotation(q));
})();

const deckY = (() => {
  const b = new THREE.Box3().setFromObject(colNodes.find(n => n.name === 'COL_HullBase'), true);
  return b.max.y;
})();
const hull = new THREE.Box3().setFromObject(colNodes.find(n => n.name === 'COL_Ceiling'), true);
const airlockX = new THREE.Box3().setFromObject(colNodes.find(n => n.name === 'COL_FrontWallTop'), true).min.x;
hull.expandByObject(colNodes.find(n => n.name === 'COL_AirlockBase'));

// --- Stations: each gets its own copy of its materials (to glow) and a floating label ---
const STATION_INFO = {
  Power: { label: 'Power', icon: 'bolt' },
  LifeSupport: { label: 'Life Support', icon: 'wind' },
  Comms: { label: 'Comms', icon: 'radio' },
  Food: { label: 'Galley', icon: 'leaf' },
  MapTable: { label: 'Robot Map', icon: 'map' },
  Shelter: { label: 'Storm Shelter', icon: 'shield' },
  Airlock: { label: 'Airlock', icon: 'door' },
};
const stations = {};
const pickables = [];
for (const [id, node] of Object.entries(stationNodes)) {
  if (!STATION_INFO[id]) continue;
  const stand = habitat.getObjectByName(`STATION_${id}_Stand`);
  const mats = [];
  node.traverse(o => {
    if (o.isMesh && !o.name.endsWith('_Stand')) {
      o.material = o.material.clone();
      mats.push(o.material);
      o.userData.station = id;
      pickables.push(o);
    }
  });
  const pos = stand.getWorldPosition(new THREE.Vector3());
  const marker = labelSprite(STATION_INFO[id].label, STATION_INFO[id].icon);
  marker.position.copy(pos).add(new THREE.Vector3(0, 2.6, 0));
  marker.userData.station = id;
  scene.add(marker);
  pickables.push(marker);
  stations[id] = { id, ...STATION_INFO[id], stand: pos, mats, marker, glow: 0 };
}

// --- Labels drawn on a canvas: a line icon plus text, in the Space Apps colours ---
function iconPath(ctx, name, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const p = new Path2D({
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    wind: 'M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.3A2.5 2.5 0 1 1 19.5 12H2',
    radio: 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.2-6',
    map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    door: 'M3 21h18M5 21V3h14v18M14 12h.01',
    rock: 'M3 17l4-9 5 2 4-5 5 12z',
    wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z',
  }[name] ?? '');
  ctx.stroke(p);
  ctx.restore();
}

function labelSprite(text, icon, color = '#2E96F5') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07173F';
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 60); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#EAFE07';
  iconPath(ctx, icon, 34, 32, 64);
  ctx.fillStyle = '#fff';
  ctx.font = '900 54px "Fira Sans", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 120, 68, 370);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// --- The base outside ---
const L = (dx, dz) => new THREE.Vector3(site.x + dx, groundAt(site.x + dx, site.z + dz), site.z + dz);
function place(name, at, rotY = 0) {
  const model = name === 'Solar' ? models.Solar.clone(true) : models[name];
  model.position.copy(at);
  model.rotation.y = rotY;
  model.traverse(o => {
    if (o.name.startsWith('COL_')) o.visible = false;
    else if (o.isMesh) o.castShadow = o.receiveShadow = !o.material.transparent;
  });
  scene.add(model);
  model.updateMatrixWorld(true);
  model.traverse(o => { if (o.name.startsWith('COL_') && o.isMesh) addBox(o); });
  return model;
}
const panels = [-12, -4, 4].map((dx, i) => {
  const model = place('Solar', L(dx, -16));
  model.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
  const spark = new THREE.PointLight(0xe43700, 0, 12, 1.5);
  spark.position.set(0, 3, 0);
  model.add(spark);
  const label = labelSprite(`Fix panel ${i + 1}`, 'wrench', '#E43700');
  label.position.copy(model.position).add(new THREE.Vector3(0, 4.5, 3));
  label.visible = false;
  scene.add(label);
  return { model, spark, label, at: model.position.clone().add(new THREE.Vector3(0, 0, 4.2)) };
});
place('Battery', L(12, -14));
place('OxygenMaker', L(-16, 9), Math.PI / 2);
place('Antenna', L(-18, -3));
place('CargoLander', L(20, 18), -0.4);
const dock = L(14, 6);
const robot = place('Digger', dock.clone());
const digSpot = L(34, -12);

// The ice drill sits at the nearest ground NASA's map says never sees sunlight.
const iceSpot = icePixel
  ? new THREE.Vector3(toWorld(icePixel.col), 0, toWorld(icePixel.row))
  : L(-60, 40);
iceSpot.y = groundAt(iceSpot.x, iceSpot.z);
const iceDistance = Math.round(Math.hypot(iceSpot.x - site.x, iceSpot.z - site.z));
place('IceDrill', iceSpot);
const iceLabel = labelSprite('Crater ice', 'rock', '#2E96F5');
iceLabel.position.copy(iceSpot).add(new THREE.Vector3(0, 9, 0));
iceLabel.scale.multiplyScalar(4);
scene.add(iceLabel);

// Rock samples to collect on a moonwalk.
const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8f7f, emissive: 0xeafe07, emissiveIntensity: 0.25, roughness: 0.9 });
const samples = [[24, 22], [-28, -30], [40, -32]].map(([dx, dz], i) => {
  const at = L(dx, dz);
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
  mesh.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
  mesh.castShadow = true;
  scene.add(mesh);
  const label = labelSprite('Rock sample', 'rock', '#EAFE07');
  label.position.copy(at).add(new THREE.Vector3(0, 2, 0));
  scene.add(label);
  return { id: `rock${i}`, mesh, label, at };
});

// --- Astronaut ---
const crew = new THREE.Group();
const suit = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(CREW_RADIUS, CREW_HEIGHT - 2 * CREW_RADIUS, 6, 16), suit);
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0xe43700, roughness: 0.3 }));
visor.position.set(0, 0.58, 0.25);
const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.2), new THREE.MeshStandardMaterial({ color: 0x0042a6, roughness: 0.6 }));
pack.position.set(0, 0.2, -0.33);
crew.add(body, visor, pack);
crew.traverse(o => { o.castShadow = true; });
scene.add(crew);

const outsideSpot = () => new THREE.Vector3(site.x + 11, site.y + CREW_HEIGHT / 2 + 0.1, site.z + 6);
const standSpot = id => stations[id].stand.clone().add(new THREE.Vector3(0, CREW_HEIGHT / 2 + 0.1, 0));
const insideSpot = () => standSpot('Airlock').add(new THREE.Vector3(-2, 0, 0));
const startSpot = () => standSpot('MapTable');

const start = outsideSpot();
const crewBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
const crewCollider = world.createCollider(RAPIER.ColliderDesc.capsule(CREW_HEIGHT / 2 - CREW_RADIUS, CREW_RADIUS), crewBody);
const controller = world.createCharacterController(0.02);
controller.setUp({ x: 0, y: 1, z: 0 });
controller.setMaxSlopeClimbAngle(50 * Math.PI / 180);
controller.setMinSlopeSlideAngle(55 * Math.PI / 180);
controller.enableSnapToGround(0.5);
controller.setApplyImpulsesToDynamicBodies(false);

// --- Input ---
let state = 'off'; // 'off' behind a full-screen menu, 'paused' behind a menu or panel, or 'play'
let sim = null, hooks = null, speed = 1;
const keys = new Set();
const KEYMAP = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
addEventListener('keydown', e => {
  if (state !== 'play' || hooks?.busy()) return;
  if (e.target.closest?.('button')) { if (e.code === 'Space' || e.code === 'Enter') return; }
  const code = KEYMAP[e.code] || e.code;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (!e.repeat) {
    if (code === 'KeyE') useNearest();
    if (code === 'KeyF') hooks?.toggleSpeed();
  }
  keys.add(code);
});
addEventListener('keyup', e => keys.delete(KEYMAP[e.code] || e.code));
addEventListener('blur', () => keys.clear());

let yaw = Math.PI / 2, pitch = 0.2, camDist = 7;
const canvas = renderer.domElement;
let down = null;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); down = { x: e.clientX, y: e.clientY, moved: 0 }; });
canvas.addEventListener('pointermove', e => {
  if (canvas.hasPointerCapture(e.pointerId)) {
    if (down) down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    yaw -= e.movementX * 0.005;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.005, -0.6, 1.3);
  } else hover(e);
});
canvas.addEventListener('pointerup', e => {
  if (down && down.moved < 6 && state === 'play') click(e);
  down = null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  camDist = THREE.MathUtils.clamp(camDist * Math.exp(e.deltaY * 0.001), 2, 60);
}, { passive: false });
function fitWindow() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', fitWindow);

// Clicking a station (its label or the machine itself) walks you over and opens it.
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const visible = pickables.filter(o => o.isSprite ? o.visible : true);
  const hit = raycaster.intersectObjects(visible, false).find(h => !h.object.isSprite || h.object.visible);
  return hit?.object.userData.station ?? null;
}
let hovered = null;
function hover(e) {
  if (state !== 'play' || !isInside(crewBody.translation())) { hovered = null; canvas.style.cursor = ''; return; }
  hovered = pick(e);
  canvas.style.cursor = hovered ? 'pointer' : '';
}
let walkTo = null;
function click(e) {
  if (!isInside(crewBody.translation())) return;
  const id = pick(e);
  if (id) goToStation(id);
}
function goToStation(id) {
  walkTo = { id, target: stations[id].stand.clone(), since: 0 };
}

// --- Loop ---
let vy = 0, grounded = false;
const camRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const head = new THREE.Vector3(), camDir = new THREE.Vector3();

function teleport(p) {
  crewBody.setTranslation(p, true);
  crewBody.setNextKinematicTranslation(p);
  vy = 0;
}

function isInside(p) {
  return p.x > hull.min.x && p.x < hull.max.x && p.z > hull.min.z && p.z < hull.max.z && p.y > deckY - 0.3;
}
function whereIs(p) {
  if (!isInside(p)) return 'outside';
  return p.x < stations.Shelter.stand.x + 1.7 ? 'shelter' : 'inside';
}

// What's close enough to use with E, and what it does.
function nearestUsable() {
  const p = crewBody.translation();
  const here = new THREE.Vector3(p.x, p.y - CREW_HEIGHT / 2, p.z);
  let best = null;
  const consider = (dist, item) => { if (dist < USE_RANGE && (!best || dist < best.dist)) best = { dist, ...item }; };
  if (isInside(p)) {
    for (const s of Object.values(stations)) consider(here.distanceTo(s.stand), { kind: 'station', id: s.id, label: `use ${s.label}` });
  } else if (sim) {
    panels.forEach((pn, i) => { if (!sim.panels[i]) consider(Math.hypot(here.x - pn.at.x, here.z - pn.at.z), { kind: 'panel', i, label: `fix solar panel ${i + 1}` }); });
    samples.forEach(s => { if (!sim.samples.has(s.id)) consider(Math.hypot(here.x - s.at.x, here.z - s.at.z), { kind: 'sample', id: s.id, label: 'pick up the rock sample' }); });
  }
  return best;
}
function useNearest() {
  const it = nearestUsable();
  if (!it || !sim) return;
  if (it.kind === 'station') openStation(it.id);
  if (it.kind === 'panel') hooks?.notice(sim.repairPanelByHand(it.i));
  if (it.kind === 'sample') sim.collectSample(it.id);
}
function openStation(id) {
  walkTo = null;
  keys.clear();
  hooks?.openStation(id);
}

function tick(dt) {
  let fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const speedWalk = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
  const p = crewBody.translation();
  if (fwd || side) walkTo = null;
  if (walkTo) {
    walkTo.since += dt;
    const dx = walkTo.target.x - p.x, dz = walkTo.target.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { openStation(walkTo.id); mx = mz = 0; }
    else if (walkTo.since > 4) { teleport(standSpot(walkTo.id)); openStation(walkTo.id); mx = mz = 0; }
    else { mx = dx; mz = dz; }
  }
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx *= speedWalk / len; mz *= speedWalk / len; }

  if (grounded && keys.has('Space')) vy = JUMP;
  vy -= GRAVITY * dt;
  const want = { x: mx * dt, y: vy * dt, z: mz * dt };
  controller.computeColliderMovement(crewCollider, want);
  const got = controller.computedMovement();
  grounded = controller.computedGrounded();
  if (grounded && vy < 0) vy = 0;
  if (vy > 0 && got.y < want.y - 1e-4) vy = 0;

  const limit = SPAN / 2 - 2;
  crewBody.setNextKinematicTranslation({
    x: THREE.MathUtils.clamp(p.x + got.x, -limit, limit),
    y: p.y + got.y,
    z: THREE.MathUtils.clamp(p.z + got.z, -limit, limit),
  });
  world.timestep = dt;
  world.step();

  const now = crewBody.translation();
  if (now.y < groundAt(now.x, now.z) - 3) teleport(outsideSpot()); // fell through a seam in the ground
  crew.position.set(now.x, now.y, now.z);
  if (len > 0) crew.rotation.y = Math.atan2(mx, mz);

  const inside = isInside(now);
  const inHull = inside && now.x < airlockX; // the airlock tube has its own roof, so it uses the normal camera
  // Cutaway: inside, the roof fades away and the camera looks down from above.
  roofMeshes.forEach(m => { m.visible = !inside; });
  Object.values(stations).forEach(s => {
    s.marker.visible = inside;
    const on = inside && (hovered === s.id || nearestUsable()?.id === s.id);
    s.glow += ((on ? 1 : 0) - s.glow) * Math.min(1, dt * 8);
    s.mats.forEach(m => { m.emissive?.setRGB(0.05 * s.glow, 0.26 * s.glow, 0.55 * s.glow); });
  });

  head.set(now.x, now.y + 0.6, now.z);
  const viewPitch = inHull ? Math.max(pitch, 0.95) : pitch;
  camDir.set(Math.sin(yaw) * Math.cos(viewPitch), Math.sin(viewPitch), Math.cos(yaw) * Math.cos(viewPitch));
  if (inHull) {
    camera.position.copy(head).addScaledVector(camDir, Math.max(camDist, 9));
  } else {
    camRay.origin = head;
    camRay.dir = camDir;
    const want = inside ? Math.min(camDist, 4) : camDist;
    const hit = world.castRay(camRay, want + 0.3, true, undefined, undefined, crewCollider);
    const d = hit ? Math.max(hit.timeOfImpact - 0.3, 0.2) : want;
    camera.position.copy(head).addScaledVector(camDir, d);
  }
  camera.lookAt(head);

  sun.target.position.copy(head);
  sun.position.copy(head).addScaledVector(SUN_DIR, 400);
  earth.position.copy(camera.position).addScaledVector(earthDir, 5000);
}

// Things in the world that follow the game rules: daylight, broken panels, the robot.
let robotPhase = 0;
function syncWorld(dt) {
  if (!sim) return;
  const light = sim.sunlight;
  sun.intensity = SUN_FULL * light;
  hemi.intensity = 0.25 + 0.45 * light;
  earth.visible = sim.earthUp;
  inLights.forEach(l => { l.intensity = sim.share < 0.8 ? 0.3 + 0.4 * Math.random() * sim.share : 1; });
  panels.forEach((pn, i) => {
    const broken = !sim.panels[i];
    pn.spark.intensity = broken ? 4 + 4 * Math.random() : 0;
    pn.label.visible = broken;
    pn.model.rotation.z = broken ? 0.12 : 0;
  });
  samples.forEach(s => { const got = sim.samples.has(s.id); s.mesh.visible = s.label.visible = !got; s.mesh.rotation.y += dt; });

  // The robot drives out to its job and back. Parked = at the dock.
  const task = sim.robotWorking ? sim.robot.task : 'idle';
  const goal = task === 'dig' ? digSpot : task === 'ice' ? iceSpot : task === 'repair' && sim.robot.target >= 0 ? panels[sim.robot.target].at : dock;
  const r = robot.position;
  const dx = goal.x - r.x, dz = goal.z - r.z, d = Math.hypot(dx, dz);
  const step = Math.min(d, (task === 'ice' ? 18 : 6) * dt);
  if (d > 0.5) {
    r.x += dx / d * step; r.z += dz / d * step;
    robot.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
  } else if (task !== 'idle') {
    robotPhase += dt * 4;
    robot.rotation.y += Math.sin(robotPhase) * dt * 0.6; // busy wiggle while working
  }
  r.y = groundAt(r.x, r.z);
}

// Slow computers (school Chromebooks) get simpler graphics: no shadows and fewer pixels.
// Add ?low to the address to force it.
let low = false, frames = 0, slowSince = performance.now();
function lowGraphics() {
  if (low) return;
  low = true;
  renderer.shadowMap.enabled = false;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  renderer.setPixelRatio(1);
  fitWindow();
}
if (new URLSearchParams(location.search).has('low')) lowGraphics();

let last = performance.now();
renderer.setAnimationLoop(t => {
  const dt = Math.min((t - last) / 1000, 1 / 15);
  last = t;
  if (state === 'play' && !low) {
    frames++;
    if (t - slowSince > 4000) {
      if (frames / ((t - slowSince) / 1000) < 24) lowGraphics();
      frames = 0; slowSince = t;
    }
  }
  if (state === 'off') return;
  if (state === 'play') {
    tick(dt);
    if (sim && !sim.over) {
      const p = crewBody.translation();
      sim.where = whereIs(p);
      sim.tick(dt * speed);
      // Out of suit air: the base computer guides you back in, and it costs you.
      if (sim.where === 'outside' && sim.suit <= 0) {
        teleport(insideSpot());
        sim.air = Math.max(0, sim.air - 10);
        sim.dose += 3;
        sim.suit = 5;
        sim.say('Suit air ran out! You made it back to the airlock, but it cost life support air.', 'bad');
      }
    }
    syncWorld(dt);
    hooks?.frame(nearestUsable());
  }
  renderer.render(scene, camera);
});

await document.fonts.ready;

gameReady({
  site: { ...siteData, iceDistance, maps, worldX: site.x, worldZ: site.z, ice: iceSpot, robot: () => robot.position },
  // Starts inside the Habitat, by the airlock.
  enter(newSim, newHooks) {
    sim = newSim;
    hooks = newHooks;
    speed = 1;
    fitWindow();
    teleport(startSpot());
    robot.position.copy(dock);
    yaw = Math.PI / 2;
    pitch = 1;
    camDist = 9;
    grounded = false;
    walkTo = null;
    state = 'play';
  },
  setSpeed(s) { speed = s; },
  goOutside() { teleport(outsideSpot()); yaw = Math.PI / 2; pitch = 0.25; camDist = 7; state = 'play'; },
  goInside() { teleport(insideSpot()); pitch = 1; state = 'play'; },
  goToStation,
  pause() { state = 'paused'; keys.clear(); walkTo = null; },
  resume() { state = 'play'; },
  stop() { state = 'off'; keys.clear(); sim = null; hooks = null; },
  // A still of the base for the start screen. Reading the canvas right after drawing keeps it filled.
  picture() {
    const spot = outsideSpot();
    crew.position.set(site.x + 9, groundAt(site.x + 9, site.z - 9) + CREW_HEIGHT / 2, site.z - 9);
    crew.rotation.y = 2.2;
    renderer.setSize(800, 800, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    camera.position.set(site.x + 24, site.y + 9, site.z - 30);
    camera.lookAt(site.x - 2, site.y + 3, site.z - 6);
    sun.target.position.set(site.x, site.y, site.z);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 400);
    earth.position.copy(camera.position).addScaledVector(earthDir, 5000);
    renderer.render(scene, camera);
    const still = renderer.domElement.toDataURL('image/jpeg', 0.85);
    fitWindow();
    return still;
  },
});

// For scripted checks from the browser console.
window.demo = { goTo: id => goToStation(id), scene, tick, world, teleport, site, crewBody, insideSpot, outsideSpot, stations, isInside, whereIs, get sim() { return sim; }, iceSpot, iceDistance, siteData, camera, renderer };
