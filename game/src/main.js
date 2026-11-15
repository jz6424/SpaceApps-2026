// The 3D world: real NASA terrain, the walk-in Habitat with its stations, the base outside,
// and a 1.8 m astronaut you can walk around. 1 unit = 1 metre everywhere.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { gameReady } from './ui.js';
import { readSiteMaps } from './nasa.js';
import { isTouch, setupTouch } from './touch.js';

const GRID = 512;              // terrain samples per side
const POST = 5;                // metres between samples (LOLA 5 m/px)
const SPAN = (GRID - 1) * POST;
const PAD_HALF = 50;           // the ground under the base is flattened out to here...
const PAD_BLEND = 40;          // ...then eases back to the real terrain over this distance
const CREW_HEIGHT = 1.8;
const CREW_RADIUS = 0.26;
const SKIN = 0.04; // the gap the controller keeps from walls and floors, so it slides along them instead of snagging
const GRAVITY = 1.62;          // Moon gravity, m/s2
const WALK = 2.5, RUN = 5, JUMP = 2.6;
const USE_RANGE = 2.4;         // how close you must be to use something with E
const SUN_FULL = 3;

await RAPIER.init();
// The labels are drawn on canvases, so their typeface has to be loaded before the first one is drawn.
await document.fonts.load('600 40px "Chakra Petch"').catch(() => {});
const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // gravity is applied by hand in tick()
const loader = new GLTFLoader();

const MODULE_FILES = ['Solar', 'Battery', 'Digger', 'OxygenMaker', 'IceDrill', 'Antenna', 'CargoLander'];
const [heightBuf, habGltf, maps, crewGltf, ...moduleGltfs] = await Promise.all([
  fetch('terrain/ridge_heights.f32').then(r => { if (!r.ok) throw new Error('terrain'); return r.arrayBuffer(); }),
  loader.loadAsync('models/Habitat.glb'),
  readSiteMaps(),
  loader.loadAsync('models/Astronaut.glb'),
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
// Two choices here decide most of the game's speed:
//  - A plain depth buffer. The logarithmic one stops the graphics card from skipping hidden
//    pixels, which more than halved the frame rate. A plain one is exact to a few millimetres
//    near the base and well under a metre at the far hills, which is all this scene needs.
//  - Edge smoothing only on ordinary screens. A Retina-class screen already draws four pixels for
//    every point, so smoothing on top of that costs a lot and shows very little.
const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2, logarithmicDepthBuffer: false, preserveDrawingBuffer: false });
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
// The stars twinkle: each one brightens and dims on its own slow beat, so the sky never pulses
// all at once. About a third hardly change at all, like steady stars.
const starCount = starPos.length / 3, starBeat = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const steady = Math.random() < 0.35;
  starBeat.set([Math.random() * 6.283, 0.6 + Math.random() * 2.2, steady ? 0.12 : 0.4 + Math.random() * 0.45], i * 3);
}
const starSky = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, size: { value: 1.6 * renderer.getPixelRatio() } },
  vertexShader: `
    attribute vec3 beat; // phase, speed, how deep the twinkle goes
    uniform float time, size;
    varying float glow;
    void main() {
      glow = 1.0 - beat.z * (0.5 + 0.5 * sin(time * beat.y + beat.x));
      gl_PointSize = size * (0.75 + 0.45 * glow);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying float glow;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(1.0), glow * smoothstep(0.5, 0.2, d));
    }`,
  transparent: true, depthWrite: false,
});
scene.add(new THREE.Points(
  new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    .setAttribute('beat', new THREE.BufferAttribute(starBeat, 3)),
  starSky,
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
  if (o.name.startsWith('ROOF_')) { roofMeshes.push(o); if (o.isMesh) o.material = o.material.clone(); }
  const m = o.name.match(/^STATION_([A-Za-z]+)$/);
  if (m) stationNodes[m[1]] = o;
  if (o.isMesh && !o.parent.name.startsWith('COL_')) o.castShadow = o.receiveShadow = !o.material.transparent;
});
habitat.updateMatrixWorld(true);
// The Habitat's white paint is close to pure white, which looks like it glows under any light. A
// slightly greyer white keeps it reading as white while letting light and shade show on it.
habitat.traverse(o => { if (o.isMesh && o.material?.name === 'M_White') o.material.color.multiplyScalar(0.84); });
// The cabin lamps, and one in the airlock. In the cutaway view the roof is not drawn but still
// casts its shadow, so the cabin is lit by these, not by the Sun pouring in through a missing roof.
// Their reach ends at the hull, so at night the inside of the base is bright and the ground
// around it stays dark.
const LAMP = 6.5;        // cabin light strength (four lamps; kept low so the white walls don't glow)
const LAMP_ECO = 0.3;    // Eco dims the lamps to this share
const inLights = [-5.6, -2.2, 1.2, 5.1].map(x => {
  const l = new THREE.PointLight(0xfff4dd, LAMP, 6.5, 1.2);
  l.position.set(x, 5.2, 0);
  habitat.add(l);
  return l;
});

// Every solid box is also remembered here, so walking to a station can plan a way round them.
const navBoxes = [];
function boxCollider(mid, half) {
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(mid.x, mid.y, mid.z));
  navBoxes.push({ collider, x0: mid.x - half.x, x1: mid.x + half.x, y0: mid.y - half.y, y1: mid.y + half.y, z0: mid.z - half.z, z1: mid.z + half.z });
  return collider;
}
function addBox(node) {
  const b = new THREE.Box3().setFromObject(node, true);
  if (b.isEmpty()) return null;
  return boxCollider(b.getCenter(new THREE.Vector3()), b.getSize(new THREE.Vector3()).multiplyScalar(0.5));
}
const colliderOf = {};
for (const node of colNodes) colliderOf[node.name] = addBox(node);
// In the cutaway view the roof isn't drawn, so the camera may look in from above: its line of
// sight ignores the cabin ceiling. When it is high enough to see over the cabin walls it ignores
// them too (that is the overhead view); lower down they pull it in close, like any wall. The
// airlock tube keeps its roof, so its walls always count.
const CABIN_SHELL = ['COL_WallNorth', 'COL_WallSouth', 'COL_WallBack', 'COL_FrontWallNorth', 'COL_FrontWallSouth', 'COL_FrontWallTop', 'COL_DoorHead', 'COL_DoorNorth', 'COL_DoorSouth'];
const cutawayIgnore = new Set([colliderOf.COL_Ceiling?.handle]);
const overheadIgnore = new Set([colliderOf.COL_Ceiling?.handle, ...CABIN_SHELL.map(n => colliderOf[n]?.handle)]);

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
hull.expandByObject(colNodes.find(n => n.name === 'COL_AirlockBase'));

// --- Stations: each gets its own copy of its materials (to glow) and a floating label ---
// --- Callouts: names floating over things you can use ---
// Drawn as page elements on top of the 3D view, not as pictures inside it, so the text is as sharp
// as the rest of the screen at any distance. A white dot sits on the thing itself, a thin line
// leads up and away, and the name is at the end of the line. Each callout fades with the
// astronaut's distance from it: full near, faint (or gone) far away, and full again when pointed at.
const calloutLayer = document.createElement('div');
calloutLayer.id = 'callouts';
renderer.domElement.after(calloutLayer); // under the HUD and the menus, over the 3D view
const callouts = [];
// near/far: metres from the astronaut where it starts to fade and where it is gone.
// faint: how visible it stays beyond far (0, gone, for all of them now). station: the station it opens when clicked.
function makeCallout(text, { color = '#FFFFFF', near = 6, far = 14, faint = 0.2, station = null } = {}) {
  const el = document.createElement('div');
  el.className = 'callout';
  el.style.display = 'none'; // until placeCallouts() finds it on screen
  el.style.setProperty('--co', color);
  el.innerHTML = `<i class="co-dot"></i><svg class="co-line" viewBox="0 0 40 28" aria-hidden="true"><path d="M3 25 21 7h19"/></svg>`;
  const name = document.createElement(station ? 'button' : 'span');
  name.className = 'co-name';
  name.textContent = text;
  if (station) {
    name.tabIndex = -1; // the stations have keys (E) and the mouse; this keeps Space for jumping
    name.addEventListener('pointerenter', () => { if (state === 'play') hovered = station; });
    name.addEventListener('pointerleave', () => { if (hovered === station) hovered = null; });
    name.addEventListener('click', () => { name.blur(); if (state === 'play' && isInside(crewBody.translation())) goToStation(station); });
  }
  el.append(name);
  calloutLayer.append(el);
  const c = { el, name, position: new THREE.Vector3(), visible: true, near, far, faint, on: 0, shown: false };
  callouts.push(c);
  return c;
}
const toScreen = new THREE.Vector3();
function placeCallouts() {
  camera.updateMatrixWorld();
  const me = crewBody.translation(), w = innerWidth, h = innerHeight;
  for (const c of callouts) {
    let show = c.visible;
    if (show) {
      toScreen.copy(c.position).project(camera);
      show = toScreen.z < 1 && toScreen.x > -1.3 && toScreen.x < 1.1 && toScreen.y > -1.1 && toScreen.y < 1.3;
    }
    if (show !== c.shown) { c.el.style.display = show ? '' : 'none'; c.shown = show; }
    if (!show) continue;
    const away = Math.hypot(c.position.x - me.x, c.position.y - me.y, c.position.z - me.z);
    // Steadily clearer with every step closer: a straight line from gone (at far) to full (at near).
    const fade = 1 - (1 - c.faint) * THREE.MathUtils.clamp((away - c.near) / (c.far - c.near), 0, 1);
    const size = THREE.MathUtils.clamp(9 / camera.position.distanceTo(c.position), 0.78, 1.08) * (1 + 0.12 * c.on);
    c.el.style.opacity = Math.max(fade, c.on).toFixed(2);
    c.el.style.transform = `translate(${((toScreen.x + 1) / 2 * w).toFixed(1)}px, ${((1 - toScreen.y) / 2 * h).toFixed(1)}px) scale(${size.toFixed(3)})`;
    if (c.fadeOut !== (fade < 0.05 && c.on < 0.05)) { c.fadeOut = !c.fadeOut; c.el.classList.toggle('gone', c.fadeOut); } // nothing to click when faded out
  }
}

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
  // The callout's dot goes on the machine: the middle of it, most of the way up.
  const body = new THREE.Box3();
  node.traverse(o => { if (o.isMesh && !o.name.endsWith('_Stand')) body.expandByObject(o); });
  const dot = body.isEmpty() ? pos.clone().add(new THREE.Vector3(0, 1.4, 0))
    : new THREE.Vector3((body.min.x + body.max.x) / 2, Math.min(body.min.y + (body.max.y - body.min.y) * 0.8, pos.y + 2.2), (body.min.z + body.max.z) / 2);
  const marker = makeCallout(STATION_INFO[id].label, { near: 2.5, far: 10, faint: 0, station: id });
  marker.position.copy(dot);
  stations[id] = { id, ...STATION_INFO[id], stand: pos, mats, marker, glow: 0 };
}

// --- Storm Shelter zone: a soft blue floor glow showing where the protection applies.
// Same rule as whereIs(): from the back wall up to 1.7 m past the shelter's stand point.
const shelterZone = (() => {
  const x0 = hull.min.x, x1 = stations.Shelter.stand.x + 1.7, z0 = hull.min.z, z1 = hull.max.z;
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshBasicMaterial({ color: 0x2E96F5, transparent: true, opacity: 0.3, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(x1 - x0, z1 - z0)),
    new THREE.LineBasicMaterial({ color: 0x2E96F5, transparent: true, opacity: 0.9 }));
  edge.rotation.x = -Math.PI / 2;
  group.add(fill, edge);
  group.position.set((x0 + x1) / 2, deckY + 0.05, (z0 + z1) / 2);
  group.renderOrder = 5;
  scene.add(group);
  return { group, fill, edge };
})();

// A floating tag in the 3D scene, used for the airlock's status sign: a dark see-through plate with a sharp outline and
// two clipped corners, a line icon, spaced capitals, and a small pointer down to the thing it names.
// A soft shadow lifts it off the pale Habitat walls. Station tags have a white outline and a
// yellow icon; a coloured outline marks something special (red = broken, blue = ice).
function labelSprite(text, icon, color = '#FFFFFF') {
  const W = 512, H = 144;
  const canvas = document.createElement('canvas');
  canvas.width = W * 3; canvas.height = H * 3; // drawn at three times the size so it stays crisp up close
  const ctx = canvas.getContext('2d');
  ctx.scale(3, 3);
  const label = text.toUpperCase();
  ctx.font = '600 44px "Chakra Petch", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  const PAD = 28, textMax = W - 28 - 2 * PAD;
  const textW = Math.min(textMax, ctx.measureText(label).width);
  const boxW = PAD + textW + PAD, x0 = (W - boxW) / 2, x1 = x0 + boxW, y0 = 16, y1 = 108, cut = 20, mid = W / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1 - cut, y0); ctx.lineTo(x1, y0 + cut); ctx.lineTo(x1, y1);
  ctx.lineTo(mid + 14, y1); ctx.lineTo(mid, y1 + 18); ctx.lineTo(mid - 14, y1); // the pointer
  ctx.lineTo(x0 + cut, y1); ctx.lineTo(x0, y1 - cut);
  ctx.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
  ctx.fillStyle = 'rgba(7, 23, 63, .84)';
  ctx.fill();
  ctx.restore();
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, x0 + PAD, (y0 + y1) / 2 + 3, textMax);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.3, 2.3 * H / W, 1);
  sprite.userData.size = sprite.scale.clone(); // its resting size; it grows a little when pointed at
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
  const label = makeCallout(`Fix panel ${i + 1}`, { color: '#E43700', near: 6, far: 40, faint: 0 });
  label.position.copy(model.position).add(new THREE.Vector3(0, 3.2, 0));
  label.visible = false;
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
const iceLabel = makeCallout('Crater ice', { color: '#2E96F5', near: 20, far: 160, faint: 0 });
iceLabel.position.copy(iceSpot).add(new THREE.Vector3(0, 3, 0));

// Rock samples to collect on a moonwalk.
const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8f7f, emissive: 0xeafe07, emissiveIntensity: 0.25, roughness: 0.9 });
// Five in all: two a short walk from the steps, three further out.
const samples = [[12, 15], [17, -7], [24, 22], [-28, -30], [40, -32]].map(([dx, dz], i) => {
  const at = L(dx, dz);
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
  mesh.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
  mesh.castShadow = true;
  scene.add(mesh);
  const label = makeCallout('Rock sample', { color: '#EAFE07', near: 5, far: 35, faint: 0 });
  label.position.copy(at).add(new THREE.Vector3(0, 0.6, 0));
  return { id: `rock${i}`, mesh, label, at };
});

// --- Airlock: the tube between the cabin and the surface, with a door at each end ---
// The Habitat was drawn in design units (x toward the door, y to the north side, z up).
// These helpers take the same numbers as assets/blender/build_habitat.py.
const U = 1.8 / 5.5;       // metres per design unit
const DECK = 7.5;          // deck height, design units
const hab = (x, y, z) => new THREE.Vector3(site.x + x * U, site.y + z * U, site.z - y * U);
function solid(x0, x1, y0, y1, z0, z1) {
  const a = hab(x0, y0, z0), b = hab(x1, y1, z1);
  return boxCollider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
    { x: Math.abs(b.x - a.x) / 2, y: Math.abs(b.y - a.y) / 2, z: Math.abs(b.z - a.z) / 2 });
}
const paint = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });
const PAINT = { white: paint(0xeceef2), grey: paint(0x969ca6), dark: paint(0x3c4048), blue: paint(0x0042a6), red: paint(0xe43700), glass: paint(0x14285a, { roughness: 0.3 }), gold: paint(0xd6aa3c, { roughness: 0.35 }) };
function block(x0, x1, y0, y1, z0, z1, mat) {
  const a = hab(x0, y0, z0), b = hab(x1, y1, z1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

const DOOR_HALF = 2.2;                    // half the doorway width: each door is two leaves this wide
const INNER_X = 13.2, OUTER_X = 19.8;     // where the two doors stand: a wall inside the tube, the hatch on its end
const INNER_TALL = 8.4, OUTER_TALL = 8.95;
const HATCH_WIDE = 5.2, HATCH_SLIDE = 5.9; // the hatch is one slab that slides along the hull to open
const LOCK_LOOK = {                       // light colour and label for each state. Never colour alone.
  pressurized: { text: 'Pressurized', color: 0x2e96f5 },
  cycling: { text: 'Cycling...', color: 0xeafe07 },
  vacuum: { text: 'Vacuum', color: 0xe43700 },
};
for (const look of Object.values(LOCK_LOOK)) {
  look.map = labelSprite(look.text, 'door', `#${look.color.toString(16).padStart(6, '0')}`).material.map;
}

// A wall across the tube with a doorway in it, so the cabin keeps its air when the chamber is empty.
(function addBulkhead() {
  const r = 7.6 * U, cy = 13.5 * U, from = Math.asin((7.3 - 13.5) / 7.6);
  const wall = new THREE.Shape();
  wall.absarc(0, cy, r, from, Math.PI - from, false);
  wall.closePath();
  const way = new THREE.Path();
  way.moveTo(-DOOR_HALF * U, DECK * U); way.lineTo(DOOR_HALF * U, DECK * U);
  way.lineTo(DOOR_HALF * U, (DECK + INNER_TALL) * U); way.lineTo(-DOOR_HALF * U, (DECK + INNER_TALL) * U);
  way.closePath();
  wall.holes.push(way);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(wall, { depth: 0.3 * U, bevelEnabled: false }).rotateY(Math.PI / 2), PAINT.white);
  mesh.position.set(site.x + (INNER_X + 0.2) * U, site.y, site.z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  for (const s of [-1, 1]) {
    block(INNER_X + 0.15, INNER_X + 0.6, s * DOOR_HALF, s * (DOOR_HALF + 0.4), DECK, DECK + INNER_TALL, PAINT.grey);
    solid(INNER_X - 0.2, INNER_X + 0.6, Math.min(s * DOOR_HALF, s * 4.4), Math.max(s * DOOR_HALF, s * 4.4), DECK, DECK + 10);
    // The outer doorway is narrowed to match, with a fixed panel each side.
    block(18.75, 19.35, Math.min(s * DOOR_HALF, s * 3.05), Math.max(s * DOOR_HALF, s * 3.05), DECK, DECK + OUTER_TALL, PAINT.white);
    solid(18.6, 19.4, Math.min(s * DOOR_HALF, s * 3.05), Math.max(s * DOOR_HALF, s * 3.05), DECK, DECK + OUTER_TALL);
  }
  block(INNER_X + 0.15, INNER_X + 0.6, -DOOR_HALF - 0.4, DOOR_HALF + 0.4, DECK + INNER_TALL, DECK + INNER_TALL + 0.4, PAINT.grey);
  solid(INNER_X - 0.2, INNER_X + 0.6, -DOOR_HALF, DOOR_HALF, DECK + INNER_TALL, DECK + 10);
})();

// The inner door is two leaves that slide apart into the wall. Closed, it is solid.
// Every moving piece is { leaf, travel }: how far it slides north (design units) when open.
function makeDoor(which, x, tall, lamps) {
  const leaves = [1, -1].map(side => {
    const leaf = new THREE.Group();
    scene.add(leaf);
    const lo = Math.min(0, side * DOOR_HALF), hi = Math.max(0, side * DOOR_HALF);
    [
      block(x - 0.15, x + 0.15, lo, hi, DECK, DECK + tall, PAINT.white),
      block(x - 0.2, x + 0.2, lo, hi, DECK + 2.5, DECK + 3.2, PAINT.blue),
      block(x - 0.2, x + 0.2, Math.min(side * 0.5, side * 1.7), Math.max(side * 0.5, side * 1.7), DECK + 4.8, DECK + 6.6, PAINT.glass),
      block(x - 0.3, x + 0.3, Math.min(side * 0.15, side * 0.4), Math.max(side * 0.15, side * 0.4), DECK + 3.5, DECK + 4.5, PAINT.grey),
    ].forEach(mesh => { mesh.userData.door = which; pickables.push(mesh); leaf.attach(mesh); });
    return { leaf, travel: side * DOOR_HALF };
  });
  return finishDoor(which, x, tall, lamps, leaves, DOOR_HALF, 0.15);
}

// The outer door is the big white hatch on the end of the airlock: a round window, a red hub and
// a handle. Shut, it covers the doorway. Open, it sits against the hull beside it.
function makeHatch(which, x, tall, lamps) {
  const leaf = new THREE.Group();
  scene.add(leaf);
  const round = (radius, depth, mat, at) => {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * U, radius * U, depth * U, 16).rotateZ(Math.PI / 2), mat);
    disc.position.copy(hab(...at));
    disc.castShadow = true;
    scene.add(disc);
    return disc;
  };
  [
    block(x - 0.25, x + 0.25, -HATCH_WIDE / 2, HATCH_WIDE / 2, DECK + 0.1, DECK + 8.5, PAINT.white),
    round(1.1, 0.15, PAINT.glass, [x + 0.28, 0, DECK + 6]),
    round(1.1, 0.15, PAINT.glass, [x - 0.28, 0, DECK + 6]),
    round(0.65, 0.5, PAINT.red, [x + 0.45, 0, DECK + 3]),
    block(x + 0.6, x + 0.9, -1.2, 1.2, DECK + 2.8, DECK + 3.2, PAINT.red),
    block(x - 0.55, x - 0.25, -1.2, 1.2, DECK + 2.8, DECK + 3.2, PAINT.red),
  ].forEach(mesh => { mesh.userData.door = which; pickables.push(mesh); leaf.attach(mesh); });
  return finishDoor(which, x, tall, lamps, [{ leaf, travel: HATCH_SLIDE }], HATCH_WIDE / 2, 0.25);
}

function finishDoor(which, x, tall, lamps, leaves, half, thick) {
  // One lamp on each face of the door, and a label over it that says the same thing in words.
  const lampMat = paint(0x2e96f5, { emissive: 0x2e96f5, emissiveIntensity: 1.6 });
  for (const at of lamps) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lampMat);
    lamp.position.copy(hab(...at));
    scene.add(lamp);
  }
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: LOCK_LOOK.pressurized.map, depthTest: false, transparent: true }));
  label.scale.set(1.3, 0.325, 1);
  label.renderOrder = 10;
  label.position.copy(hab(x, 0, DECK + tall + 2.1));
  scene.add(label);
  // Seen from the cabin or the Moon the label hangs over the door. Seen from the chamber's ceiling
  // camera it sits beside the lamp instead.
  const labelSpots = { over: label.position.clone(), beside: hab(which === 'inner' ? x + 1 : 17.6, 0.9, DECK + 6.4) };
  return { which, leaves, lampMat, label, labelSpots, slide: 0, collider: solid(x - thick, x + thick, -half, half, DECK, DECK + tall), at: hab(x, 0, DECK) };
}
const doors = {
  // Lamps: above the door on the cabin and Moon sides, beside it inside the chamber (where the
  // camera looks down from the ceiling).
  inner: makeDoor('inner', INNER_X, INNER_TALL, [[INNER_X - 0.5, 0, DECK + INNER_TALL + 0.75], [INNER_X + 0.75, 2.45, DECK + 5.6]]),
  outer: makeHatch('outer', OUTER_X, OUTER_TALL, [[19.75, 0, DECK + OUTER_TALL + 0.75], [18.0, 2.6, DECK + 5.6]]),
};

// A bench for pulling boots on, and a rack with a spare helmet and suit.
block(16.9, 18.1, 3.0, 4.3, DECK + 1.2, DECK + 1.5, PAINT.white);
block(17.0, 17.25, 3.1, 4.2, DECK, DECK + 1.2, PAINT.grey);
block(17.75, 18.0, 3.1, 4.2, DECK, DECK + 1.2, PAINT.grey);
solid(16.9, 18.1, 3.0, 4.4, DECK, DECK + 1.5);
block(16.9, 18.1, -4.3, -3.3, DECK, DECK + 0.3, PAINT.dark);
block(17.4, 17.6, -4.3, -4.1, DECK, DECK + 6.4, PAINT.grey);
block(16.95, 18.05, -4.3, -4.1, DECK + 6.1, DECK + 6.4, PAINT.grey);
block(17.05, 17.95, -4.1, -3.4, DECK + 1.6, DECK + 3.9, PAINT.white);
block(17.03, 17.97, -4.12, -3.38, DECK + 2.6, DECK + 2.9, PAINT.red);
for (const [mat, radius, y] of [[PAINT.white, 0.95, -3.75], [PAINT.gold, 0.7, -3.35]]) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius * U, 12, 8), mat);
  ball.position.copy(hab(17.5, y, DECK + 5));
  ball.castShadow = true;
  scene.add(ball);
}
solid(16.9, 18.1, -4.4, -3.2, DECK, DECK + 6.4);

// The yellow railings on the landing and down the steps stop you walking off the edge.
solid(23.25, 23.55, -3.2, 3.2, DECK, DECK + 3.6);
for (let i = 0; i < 4; i++) {
  const y = -3.2 - 2.4 * i;
  solid(23.25, 23.55, y - 2.4, y, DECK - 1.5 * (i + 1), DECK + 3.6 - 1.84 * i);
}
solid(23.25, 23.55, -13.2, -12.8, 0, 3.6);

// Where the astronaut is, as the airlock rules see it.
function airlockZone(p) {
  const x = (p.x - site.x) / U, y = (site.z - p.z) / U;
  if (Math.abs(y) > 4.6 || p.y < deckY - 0.3 || x < INNER_X - 1.1 || x > OUTER_X + 1.1) return { inAirlock: false, doorway: null };
  const doorway = Math.abs(x - INNER_X) < 1.1 ? 'inner' : Math.abs(x - OUTER_X) < 1.1 ? 'outer' : null;
  return { inAirlock: x > INNER_X && x < OUTER_X, doorway };
}

// Doors ease open and shut over about 0.6 s of real time, whatever the game speed.
function syncAirlock(dt, snap = false) {
  const lock = sim?.airlock ?? { inner: true, outer: false };
  const look = LOCK_LOOK[sim?.airlockStatus ?? 'pressurized'];
  const p = crewBody.translation(), zone = airlockZone(p), inside = isInside(p);
  for (const door of Object.values(doors)) {
    const goal = lock[door.which] ? 1 : 0;
    door.slide = snap ? goal : THREE.MathUtils.clamp(door.slide + Math.sign(goal - door.slide) * dt / 0.6, 0, 1);
    const eased = THREE.MathUtils.smootherstep(door.slide, 0, 1);
    for (const { leaf, travel } of door.leaves) leaf.position.z = -eased * travel * U;
    door.collider.setEnabled(!(goal === 1 && door.slide > 0.7));
    door.lampMat.color.setHex(look.color);
    door.lampMat.emissive.setHex(look.color);
    door.label.material.map = look.map;
    // Each label shows on the sides of its door you can stand on.
    door.label.visible = door.which === 'inner' ? inside : zone.inAirlock || zone.doorway === 'outer' || !inside;
    door.label.position.copy(zone.inAirlock ? door.labelSpots.beside : door.labelSpots.over);
    door.label.scale.set(zone.inAirlock ? 0.72 : 1.3, zone.inAirlock ? 0.18 : 0.325, 1);
  }
}

// --- Finding a way round the furniture ---
// The deck is cut into small squares. A square is blocked when a solid box at body height comes
// within an astronaut's width of it. A* finds the shortest run of free squares, then the corners
// that are not needed are dropped so the walk is a few straight legs.
const NAV = { cell: 0.12, reach: CREW_RADIUS + 0.1 };
NAV.x0 = site.x - 21.5 * U; NAV.z0 = site.z - 9.5 * U;
NAV.cols = Math.ceil((OUTER_X + 22) * U / NAV.cell); NAV.rows = Math.ceil(19 * U / NAV.cell);
function navGrid(throughDoors) {
  const { cell, reach, cols, rows, x0, z0 } = NAV, blocked = new Uint8Array(cols * rows);
  const doorColliders = Object.values(doors).map(d => d.collider);
  for (const b of navBoxes) {
    if (b.y1 < deckY + 0.15 || b.y0 > deckY + CREW_HEIGHT - 0.1) continue;   // under the deck or overhead
    if (!b.collider.isEnabled()) continue;                                    // an open door
    if (throughDoors && doorColliders.includes(b.collider)) continue;
    const c0 = Math.max(0, Math.ceil((b.x0 - reach - x0) / cell - 0.5)), c1 = Math.min(cols - 1, Math.floor((b.x1 + reach - x0) / cell - 0.5));
    const r0 = Math.max(0, Math.ceil((b.z0 - reach - z0) / cell - 0.5)), r1 = Math.min(rows - 1, Math.floor((b.z1 + reach - z0) / cell - 0.5));
    if (c1 < c0) continue;   // off the side of the grid (and a negative end would make fill() wrap round)
    for (let r = r0; r <= r1; r++) blocked.fill(1, r * cols + c0, r * cols + c1 + 1);
  }
  return blocked;
}
function findPath(from, to, throughDoors = false) {
  const { cell, cols, rows, x0, z0 } = NAV, blocked = navGrid(throughDoors);
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];
  // Standing against a counter counts as blocked, so start and end on the nearest free square.
  const nearest = pt => {
    const c = Math.round((pt.x - x0) / cell - 0.5), r = Math.round((pt.z - z0) / cell - 0.5);
    for (let ring = 0; ring < 8; ring++) {
      let best = null;
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring || !free(c + dc, r + dr)) continue;
        const d = dr * dr + dc * dc;
        if (!best || d < best.d) best = { c: c + dc, r: r + dr, d };
      }
      if (best) return best;
    }
    return null;
  };
  const a = nearest(from), b = nearest(to);
  if (!a || !b) return null;
  const start = a.r * cols + a.c, goal = b.r * cols + b.c;
  const cost = new Float32Array(cols * rows).fill(Infinity), came = new Int32Array(cols * rows).fill(-1);
  const guess = i => { const dc = Math.abs(i % cols - b.c), dr = Math.abs(Math.floor(i / cols) - b.r); return Math.max(dc, dr) + 0.414 * Math.min(dc, dr); };
  const open = [[guess(start), start]];
  cost[start] = 0;
  while (open.length) {
    let pickAt = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[pickAt][0]) pickAt = i;
    const [, at] = open.splice(pickAt, 1)[0];
    if (at === goal) break;
    const c = at % cols, r = Math.floor(at / cols);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc || !free(c + dc, r + dr)) continue;
      if (dr && dc && !(free(c + dc, r) && free(c, r + dr))) continue;   // no squeezing past a corner
      const next = (r + dr) * cols + c + dc, g = cost[at] + (dr && dc ? 1.414 : 1);
      if (g < cost[next]) { cost[next] = g; came[next] = at; open.push([g + guess(next), next]); }
    }
  }
  if (cost[goal] === Infinity) return null;
  const cells = [];
  for (let at = goal; at !== -1; at = came[at]) cells.unshift(at);
  const spot = i => ({ x: x0 + (i % cols + 0.5) * cell, z: z0 + (Math.floor(i / cols) + 0.5) * cell });
  const clear = (p, q) => {
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (cell / 2));
    for (let i = 1; i < steps; i++) {
      const x = p.x + (q.x - p.x) * i / steps, z = p.z + (q.z - p.z) * i / steps;
      if (!free(Math.floor((x - x0) / cell), Math.floor((z - z0) / cell))) return false;
    }
    return true;
  };
  // Keep only the corners: from each kept point, skip ahead to the furthest one in plain sight.
  const points = cells.map(spot), path = [];
  for (let i = 0; i < points.length - 1;) {
    let j = points.length - 1;
    while (j > i + 1 && !clear(points[i], points[j])) j--;
    path.push(points[j]);
    i = j;
  }
  // Finish on the exact spot. A station tucked in beside its furniture may not be on a free
  // square, so the last step can end against the furniture: close enough counts (see tick).
  path.push({ x: to.x, z: to.z });
  return path;
}

function useDoor(which) {
  if (!sim) return;
  const p = crewBody.translation(), at = doors[which].at;
  if (Math.hypot(p.x - at.x, p.z - at.z) > 3.5 || Math.abs(p.y - at.y) > 3) {
    if (!isInside(p)) return hooks?.notice('Walk up to the door first.');
    // Inside the Habitat: walk over to this side of the door, then use it.
    const side = p.x < at.x ? -1 : 1;
    return walkAlong({ x: at.x + side * 1.3 * U, z: at.z }, () => useDoorNow(which));
  }
  useDoorNow(which);
}
function useDoorNow(which) {
  if (!sim) return;
  const p = crewBody.translation();
  const zone = airlockZone(p);
  Object.assign(sim, zone);
  // From the Moon side the hatch always answers: if the cabin door is open, the airlock shuts it
  // and empties itself first, so nobody is left outside.
  if (which === 'outer' && !zone.inAirlock && !isInside(p) && !sim.airlock.cycle && sim.airlock.inner) return hooks?.notice(sim.airlockStart('out', true));
  hooks?.notice(sim.airlockDoor(which));
}

// --- Astronaut ---
// `crew` sits at the middle of the physics capsule. The model (assets/blender/build_astronaut.py)
// has its pivot at the feet and faces +Z, so it hangs half a body height below.
const crew = new THREE.Group();
const crewModel = crewGltf.scene;
crewModel.position.y = -CREW_HEIGHT / 2 - SKIN; // the feet on the ground, not on the controller's gap
crew.add(crewModel);
// The limbs move, so three.js can't tell from the rest pose when the mesh is off screen.
crew.traverse(o => { o.castShadow = true; o.frustumCulled = false; });
scene.add(crew);

// The skeleton's joints, and how each one sits at rest, for the body language added in tick().
const BONES = ['Hips', 'Spine', 'ArmL', 'ArmR', 'ForearmL', 'ForearmR', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'FootL', 'FootR'];
const bones = Object.fromEntries(BONES.map(n => [n, crewModel.getObjectByName(n)]));
const rest = Object.fromEntries(BONES.map(n => [n, bones[n].quaternion.clone()]));
const smoothed = Object.fromEntries(BONES.map(n => [n, bones[n].quaternion.clone()]));

// A light on the chest of the suit, switched with F. It points where the astronaut faces.
const torch = new THREE.SpotLight(0xfff1d6, 60, 26, 0.55, 0.6, 1.3);
torch.position.set(0, 1.18, 0.24);
torch.target.position.set(0, 0.2, 7);
torch.visible = false;
const torchLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3c4048, emissive: 0xfff1d6, emissiveIntensity: 0 }));
torchLamp.position.set(0.11, 1.2, 0.2);
// The helmet lamps give a faint glow after dark, just enough to see the astronaut and their feet.
const helmetGlow = new THREE.PointLight(0xfff1d6, 0, 4.5, 1.4);
helmetGlow.position.set(0, 1.9, 0.5);
crewModel.add(torch, torch.target, torchLamp, helmetGlow);
function setTorch(on) {
  torch.visible = on;
  torchLamp.material.emissiveIntensity = on ? 3 : 0;
}

// Idle, Walk and Run loop in place; tick() picks one from how the astronaut is moving. The run
// plays slower than the walk: in the Moon's low gravity a run is a long, floating lope.
const crewMixer = new THREE.AnimationMixer(crewModel);
const MOVE_RATE = { Idle: 1, Walk: 1.5, Run: 0.9 };
const moves = Object.fromEntries(crewGltf.animations.map(clip => [clip.name, crewMixer.clipAction(clip)]));
let move = 'Idle';
moves.Idle.play();
crewMixer.update(0);
function setMove(name) {
  if (name === move) return;
  moves[move].fadeOut(0.18);
  moves[name].reset().setEffectiveTimeScale(MOVE_RATE[name]).fadeIn(0.18).play();
  move = name;
}

// --- Tools held in the right hand (picked from the hotbar) ---
const TOOLS = {};
{
  const part = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const wrench = new THREE.Group();   // a handle with an open jaw
  wrench.add(part(0.04, 0.26, 0.04, PAINT.grey, 0, 0.1, 0), part(0.13, 0.05, 0.045, PAINT.gold, 0, 0.25, 0), part(0.04, 0.07, 0.045, PAINT.gold, -0.045, 0.3, 0), part(0.04, 0.07, 0.045, PAINT.gold, 0.045, 0.3, 0));
  const scoop = new THREE.Group();    // a handle with a small open box on the end
  scoop.add(part(0.035, 0.3, 0.035, PAINT.grey, 0, 0.12, 0), part(0.14, 0.02, 0.12, PAINT.blue, 0, 0.28, 0.02), part(0.14, 0.07, 0.02, PAINT.blue, 0, 0.31, -0.04), part(0.02, 0.07, 0.12, PAINT.blue, -0.07, 0.31, 0.02), part(0.02, 0.07, 0.12, PAINT.blue, 0.07, 0.31, 0.02));
  for (const [id, tool] of Object.entries({ wrench, scoop })) {
    tool.position.set(0, -0.27, 0.04);       // in the fist, at the end of the forearm
    tool.rotation.x = Math.PI / 2;           // pointing forward, out of the hand
    tool.visible = false;
    bones.ForearmR.add(tool);
    TOOLS[id] = tool;
  }
}
let holding = null;
function hold(id) {
  holding = TOOLS[id] ? id : null;
  for (const [key, tool] of Object.entries(TOOLS)) tool.visible = key === holding;
}

// --- Moon dust: small puffs kicked up by running feet and by landings ---
// With no air, dust on the Moon doesn't hang in a cloud: every grain flies in an arc and drops
// straight back, in the Moon's weak gravity. Each puff is a handful of grains that do just that.
const PUFFS = 12, GRAINS = 22;
const dustDot = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), shade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  shade.addColorStop(0, 'rgba(255,255,255,1)'); shade.addColorStop(0.5, 'rgba(255,255,255,.55)'); shade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = shade; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = Array.from({ length: PUFFS }, () => {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRAINS * 3), 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: dustDot, color: 0xc4c1ba, size: 0.3, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { points, speed: new Float32Array(GRAINS * 3), age: 0, life: 1, floor: 0 };
});
let nextPuff = 0;
// at: where the foot is. power: how hard it hit (about 0.3 for a running step, up to 1.5 for a
// hard landing). pushX/pushZ: which way the foot was moving, so a run throws dust backwards.
function kickDust(at, power, pushX = 0, pushZ = 0) {
  const puff = puffs[nextPuff++ % PUFFS], pos = puff.points.geometry.attributes.position;
  for (let i = 0; i < GRAINS; i++) {
    // Scattered around the foot, not on a ring, each grain with its own speed, so it reads as a cloud.
    const turn = Math.random() * Math.PI * 2, from = Math.random() * 0.22, out = (0.1 + Math.random() * 1.1) * power;
    pos.setXYZ(i, at.x + Math.cos(turn) * from, at.y + 0.03 + Math.random() * 0.06, at.z + Math.sin(turn) * from);
    puff.speed.set([Math.cos(turn) * out - pushX * 0.25, (0.2 + Math.random() * 0.95) * power, Math.sin(turn) * out - pushZ * 0.25], i * 3);
  }
  pos.needsUpdate = true;
  Object.assign(puff, { age: 0, life: 1.1 + power * 0.9, floor: at.y });
  puff.points.material.size = 0.24 + 0.16 * Math.min(1, power);
  puff.points.visible = true;
}
function driftDust(dt) {
  for (const puff of puffs) {
    if (!puff.points.visible) continue;
    puff.age += dt;
    if (puff.age >= puff.life) { puff.points.visible = false; continue; }
    const pos = puff.points.geometry.attributes.position, v = puff.speed;
    for (let i = 0; i < GRAINS; i++) {
      if (pos.getY(i) <= puff.floor && v[i * 3 + 1] < 0) continue; // this grain has landed
      v[i * 3 + 1] -= GRAVITY * dt;
      pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, Math.max(puff.floor, pos.getY(i) + v[i * 3 + 1] * dt), pos.getZ(i) + v[i * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
    puff.points.material.opacity = 0.42 * (1 - puff.age / puff.life) ** 1.3;
  }
}

// --- Body language, layered over the clips every frame ---
//   - the limbs follow the clip a touch late, which rounds off its corners (a softer, floatier run)
//   - a run leans forward and bounds
//   - in the air the arms drift out and circle slowly for balance and the knees go soft
//   - a held tool is carried in front of the body
const twist = new THREE.Quaternion(), aim = new THREE.Quaternion(), turnBy = new THREE.Euler(), footAt = new THREE.Vector3();
function bend(name, x, y, z, weight) {
  if (weight <= 0.001) return;
  aim.copy(rest[name]).multiply(twist.setFromEuler(turnBy.set(x, y, z)));
  bones[name].quaternion.slerp(aim, Math.min(1, weight));
}
let airTime = 0, air = 0, carry = 0, lope = 0, poseClock = 0, lastStep = 0, wasGrounded = true, fallSpeed = 0;
function bodyLanguage(dt, pace, outside) {
  const ease = rate => 1 - Math.exp(-rate * dt);
  poseClock += dt;
  // Follow the clip softly.
  const follow = ease(move === 'Idle' ? 30 : 20);
  for (const name of BONES) bones[name].quaternion.copy(smoothed[name].slerp(bones[name].quaternion, follow));

  const running = move === 'Run' && grounded;
  lope += ((running ? 1 : 0) - lope) * ease(5);
  carry += ((holding ? 1 : 0) - carry) * ease(8);
  airTime = grounded ? 0 : airTime + dt;
  air += ((airTime > 0.07 ? 1 : 0) - air) * ease(airTime > 0.07 ? 4.5 : 9);

  // Run: lean in and bound. The clip takes two steps per loop, so the body rises twice.
  const stride = moves.Run.time / moves.Run.getClip().duration; // 0 to 1 through the loop
  crewModel.position.y = -CREW_HEIGHT / 2 - SKIN + lope * 0.07 * Math.abs(Math.sin(stride * Math.PI * 2));
  bend('Spine', 0.2, 0, 0, lope * 0.8);

  // A tool in the right hand: elbow bent, forearm forward.
  bend('ArmR', -0.45, 0, -0.1, carry);
  bend('ForearmR', -1.05, 0, 0, carry);

  // In the air: arms out and slowly circling, like someone keeping their balance.
  const slow = Math.sin(poseClock * 2.0), slower = Math.sin(poseClock * 1.5 + 1.2);
  bend('ArmL', 0.3 * slower, 0, 1.2 + 0.3 * slow, air);
  bend('ArmR', -0.3 * slower, 0, -(1.2 - 0.3 * slow), air);
  bend('ForearmL', -0.3, 0, 0.25, air);
  bend('ForearmR', -0.3, 0, -0.25, air);
  bend('ThighL', -0.4, 0, 0.1, air * 0.85);
  bend('ShinL', 0.75, 0, 0, air * 0.85);
  bend('ThighR', 0.15, 0, -0.1, air * 0.85);
  bend('ShinR', 0.45, 0, 0, air * 0.85);
  bend('Spine', -0.08, 0, 0.06 * slow, air);

  // Dust, on open ground only: a small puff from each running step, a bigger one on landing.
  const feet = crew.position.y - CREW_HEIGHT / 2;
  if (outside && running) {
    const step = Math.floor(stride * 2);
    if (step !== lastStep) {
      bones[step ? 'FootL' : 'FootR'].getWorldPosition(footAt);
      footAt.y = feet;
      kickDust(footAt, 0.32, velX, velZ);
    }
    lastStep = step;
  }
  if (outside && grounded && !wasGrounded && fallSpeed > 0.9) {
    footAt.set(crew.position.x, feet, crew.position.z);
    kickDust(footAt, Math.min(1.5, 0.45 + fallSpeed * 0.3), velX * 0.5, velZ * 0.5);
  }
  if (!grounded) fallSpeed = Math.max(0, -vy);
  wasGrounded = grounded;
  driftDust(dt);
}

const outsideSpot = () => new THREE.Vector3(site.x + 11, site.y + CREW_HEIGHT / 2 + 0.1, site.z + 6);
const standSpot = id => stations[id].stand.clone().add(new THREE.Vector3(0, CREW_HEIGHT / 2 + 0.1, 0));
const insideSpot = () => standSpot('Airlock').add(new THREE.Vector3(-2, 0, 0));
const startSpot = () => standSpot('MapTable');

const start = outsideSpot();
const crewBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
const crewCollider = world.createCollider(RAPIER.ColliderDesc.capsule(CREW_HEIGHT / 2 - CREW_RADIUS, CREW_RADIUS), crewBody);
const controller = world.createCharacterController(SKIN);
controller.setUp({ x: 0, y: 1, z: 0 });
controller.setMaxSlopeClimbAngle(52 * Math.PI / 180);
controller.setMinSlopeSlideAngle(58 * Math.PI / 180);
controller.enableSnapToGround(0.5);
// Steps over small lips (a box edge, a seam in the ground) instead of stopping dead against them.
// The 0.49 m stairs are still taken by the ramp laid over them.
controller.enableAutostep(0.3, 0.12, false);
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
    if (code === 'KeyF') setTorch(!torch.visible);
    if (code === 'KeyT') hooks?.toggleSpeed();
    const slot = /^Digit([1-4])$/.exec(e.code);
    if (slot) hooks?.hotbar?.(Number(slot[1]) - 1);
  }
  keys.add(code);
});
addEventListener('keyup', e => keys.delete(KEYMAP[e.code] || e.code));
addEventListener('blur', () => keys.clear());

const DRAG_SPEED = 0.005; // radians the view turns per pixel of mouse drag
let yaw = Math.PI / 2, pitch = 0.2, camDist = 7;
// Zoom: the wheel (or a pinch) moves the camera in and out behind the astronaut, between CLOSEST
// and FARTHEST metres. Your zoom is kept wherever you go.
const CLOSEST = 3, FARTHEST = 18;
function zoomBy(factor) {
  camDist = Math.min(FARTHEST, Math.max(CLOSEST, camDist * factor));
}
const canvas = renderer.domElement;
let down = null;
// Fingers (phones and tablets): one finger drags the view, two pinch to zoom, a tap is a click.
// The browser doesn't report how far a finger moved between events the way it does for a mouse,
// so each finger's last position is kept here.
const fingers = new Map(); // pointer id -> { x, y, moved }
let pinch = 0;             // distance between two fingers at the last move, 0 when not pinching
function fingerMove(e) {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  const dx = e.clientX - f.x, dy = e.clientY - f.y;
  Object.assign(f, { x: e.clientX, y: e.clientY, moved: f.moved + Math.abs(dx) + Math.abs(dy) });
  if (fingers.size === 1) {
    yaw -= dx * DRAG_SPEED * 1.4;
    pitch = THREE.MathUtils.clamp(pitch + dy * DRAG_SPEED * 1.4, -0.6, 1.3);
  } else if (fingers.size === 2) {
    const [a, b] = [...fingers.values()], apart = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch && apart > 0) zoomBy(pinch / apart);
    pinch = apart;
  }
}
function fingerUp(e, tap) {
  const f = fingers.get(e.pointerId);
  fingers.delete(e.pointerId);
  pinch = 0;
  if (tap && f && f.moved < 12 && fingers.size === 0 && state === 'play') click(e);
}
canvas.addEventListener('pointercancel', e => { if (e.pointerType === 'touch') fingerUp(e, false); });

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 }); pinch = 0; return; }
  down = { x: e.clientX, y: e.clientY, moved: 0 };
  // Hide the cursor and let the mouse travel without hitting the screen edge while dragging.
  try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
});
// If the browser took the mouse back mid-drag (Esc), act like Esc was pressed so the pause menu opens.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && down) {
    down = null;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return fingerMove(e);
  if (canvas.hasPointerCapture(e.pointerId) || document.pointerLockElement === canvas) {
    if (down) down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    // Same turn per pixel sideways and up/down. Raise DRAG_SPEED to turn faster, lower it to turn slower.
    yaw -= e.movementX * DRAG_SPEED;
    pitch = THREE.MathUtils.clamp(pitch + e.movementY * DRAG_SPEED, -0.6, 1.3);
  } else hover(e);
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerType === 'touch') return fingerUp(e, true);
  const wasDown = down;
  down = null; // clear first so letting go doesn't look like Esc
  if (document.pointerLockElement) document.exitPointerLock();
  if (wasDown && wasDown.moved < 6 && state === 'play') click(e);
});
// Stop the right-click menu from popping up when a drag ends on the right button.
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomBy(Math.exp(e.deltaY * 0.001));
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
  const hit = raycaster.intersectObjects(pickables, false)[0];
  return hit?.object.userData ?? null; // { station } or { door }
}
let hovered = null;
function hover(e) {
  if (state !== 'play') { hovered = null; canvas.style.cursor = ''; return; }
  const what = pick(e);
  hovered = isInside(crewBody.translation()) ? what?.station ?? null : null;
  canvas.style.cursor = hovered || what?.door ? 'pointer' : '';
}
let walkTo = null;
function click(e) {
  const what = pick(e);
  if (what?.door) return useDoor(what.door);
  if (what?.station && isInside(crewBody.translation())) goToStation(what.station);
}
// Walk to a spot by a planned route, then do something there.
function walkAlong(target, arrive, hop = null) {
  const p = crewBody.translation();
  // A closed door on the only way there is not a dead end: plan through it and open it on arrival.
  const path = findPath(p, target) ?? findPath(p, target, true);
  const legs = path ? [p, ...path] : [p, target];
  const length = legs.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - legs[i].x, q.z - legs[i].z), 0);
  walkTo = { target, arrive, hop, path: path ?? [target], leg: 0, since: 0, stuck: 0, limit: length / WALK * 2 + 3, triedDoor: false };
}
function goToStation(id) {
  walkAlong(stations[id].stand, () => openStation(id), () => teleport(standSpot(id)));
}

// --- Loop ---
let vy = 0, grounded = false;
// Phones and tablets: the joystick's push, and whether the Jump button was just touched.
const stick = { x: 0, y: 0 };
let jumpAsked = false;
const touchPad = isTouch ? setupTouch({
  move: (x, y) => { stick.x = x; stick.y = y; },
  jump: () => { if (state === 'play' && !hooks?.busy()) jumpAsked = true; },
  use: () => { if (state === 'play' && !hooks?.busy()) useNearest(); },
  light: () => { if (state === 'play' && !hooks?.busy()) setTorch(!torch.visible); },
}) : null;
let camShown = 7; // how far the camera actually is: pulled in at once by walls, eased back out
let camY = 0, camFloor = 0; // the height the camera follows (smoothed), and the ground height before a jump
// The astronaut eases into a walk and swings round to face the way they are going, instead of
// snapping. Higher numbers are snappier, lower ones are floatier.
const ACCEL = 18;      // how quickly the walking speed catches up with the keys (90% in about 0.13 s)
const BRAKE = 22;      // how quickly they stop when you let go
const TURN = 13;       // how quickly the body turns to face its direction
const TURN_MAX = 12;
const AIR_STEER = 9;   // how quickly the keys turn you in mid-air (a little gentler than on the ground)
let airCap = WALK;     // the fastest you may go in the air: your speed when you left the ground
const FOV = 60, FOV_RUN = 68; // the view widens a little while sprinting    // and the fastest it may spin, in radians a second, so big turns don't start with a jerk
let velX = 0, velZ = 0, facing = 0;
const camRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const head = new THREE.Vector3(), camDir = new THREE.Vector3();

function teleport(p) {
  crewBody.setTranslation(p, true);
  crewBody.setNextKinematicTranslation(p);
  vy = velX = velZ = 0;
  camY = camFloor = p.y; // the camera jumps with a teleport instead of drifting there
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
  // While the airlock is closing, pumping or opening, its panel and doors have nothing to offer.
  const cycling = !!sim?.airlockStep;
  if (isInside(p)) {
    // In the airlock with the air pumped out, its panel is the way back in, so the prompt says so.
    const back = sim?.airlock.pressure === 'vacuum';
    for (const s of Object.values(stations)) {
      if (cycling && s.id === 'Airlock') continue;
      consider(here.distanceTo(s.stand), { kind: 'station', id: s.id, label: s.id === 'Airlock' && back ? 'close the airlock and come back inside' : `use ${s.label}` });
    }
  } else if (sim) {
    panels.forEach((pn, i) => { if (!sim.panels[i]) consider(Math.hypot(here.x - pn.at.x, here.z - pn.at.z), { kind: 'panel', i, label: `fix solar panel ${i + 1}` }); });
    samples.forEach(s => { if (!sim.samples.has(s.id)) consider(Math.hypot(here.x - s.at.x, here.z - s.at.z), { kind: 'sample', id: s.id, label: 'pick up the rock sample' }); });
  }
  for (const door of Object.values(doors)) {
    // The open door is not offered: walking through it is the point.
    if (sim && !cycling && !sim.airlock[door.which]) consider(here.distanceTo(door.at) + 0.6, { kind: 'door', id: door.which, label: door.which === 'outer' ? 'open the hatch' : 'open the inner door' });
  }
  return best;
}
function useNearest() {
  const it = nearestUsable();
  if (!it || !sim) return;
  if (it.kind === 'station') openStation(it.id);
  if (it.kind === 'panel') { hooks?.useTool?.('wrench'); hooks?.notice(sim.repairPanelByHand(it.i)); }
  if (it.kind === 'sample') { hooks?.useTool?.('scoop'); sim.collectSample(it.id); }
  if (it.kind === 'door') useDoor(it.id);
}
function openStation(id) {
  walkTo = null;
  keys.clear();
  touchPad?.letGo();
  hooks?.openStation(id);
}

function tick(dt) {
  let fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  let speedWalk = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;
  // The on-screen joystick: a gentle push walks slowly, a full push runs.
  const lean = Math.hypot(stick.x, stick.y);
  if (lean > 0.15) {
    fwd = -stick.y / lean;
    side = stick.x / lean;
    speedWalk = lean > 0.9 ? RUN : WALK * Math.max(0.45, lean / 0.9);
  }
  let p = crewBody.translation();
  const steer = yaw;
  const fx = -Math.sin(steer), fz = -Math.cos(steer);
  let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
  if (fwd || side) walkTo = null;
  if (walkTo) {
    const w = walkTo;
    w.since += dt;
    // Head for the next corner of the route, moving on to the one after as each is reached.
    while (w.leg < w.path.length - 1 && Math.hypot(w.path[w.leg].x - p.x, w.path[w.leg].z - p.z) < 0.25) w.leg++;
    const next = w.path[w.leg];
    const d = Math.hypot(w.target.x - p.x, w.target.z - p.z);
    if (d < 0.2 || (d < 1.3 && w.leg === w.path.length - 1 && w.stuck > 0.3)) { walkTo = null; w.arrive(); mx = mz = 0; }
    else if (w.since > w.limit || w.stuck > 0.8) {
      // Held up. A closed door in the way gets one try at opening. After that, a station brings
      // the astronaut to it (reading the position again, or the move below would undo the hop);
      // anything else just stops.
      const door = Object.values(doors).find(dr => !sim?.airlock[dr.which] && Math.hypot(p.x - dr.at.x, p.z - dr.at.z) < 1.2);
      if (door && !w.triedDoor) { w.triedDoor = true; w.stuck = 0; w.limit += 4; useDoorNow(door.which); if (walkTo !== w) walkTo = w; mx = mz = 0; }
      else if (door || !w.hop) { walkTo = null; mx = mz = 0; }
      else { walkTo = null; w.hop(); p = crewBody.translation(); w.arrive(); mx = mz = 0; }
    } else { mx = next.x - p.x; mz = next.z - p.z; }
  }
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx *= speedWalk / len; mz *= speedWalk / len; }

  // Speed drifts toward what the keys ask for, so starts, stops and turns are curves. In the air
  // you can still steer any way you like, but you can't go faster than you were going when you
  // left the ground (and at least a walk): pressing Shift mid-air changes the view, not the speed.
  // Letting go of the keys mid-air keeps your drift; there is nothing to brake against.
  const ease = rate => 1 - Math.exp(-rate * dt);
  if (grounded) {
    const pull = ease(len > 0 ? ACCEL : BRAKE);
    velX += (mx - velX) * pull;
    velZ += (mz - velZ) * pull;
    airCap = Math.max(WALK, Math.hypot(velX, velZ));
  } else if (len > 0) {
    const pull = ease(AIR_STEER), unit = Math.hypot(mx, mz); // the keys' direction, whatever the speed asked for
    velX += (mx / unit * airCap - velX) * pull;
    velZ += (mz / unit * airCap - velZ) * pull;
  }
  // Sprinting (Shift, or the joystick pushed all the way) widens the view a little, in the air too.
  const sprinting = len > 0 && speedWalk === RUN;

  if (grounded && (keys.has('Space') || jumpAsked)) vy = JUMP;
  jumpAsked = false;
  vy -= GRAVITY * dt;
  const want = { x: velX * dt, y: vy * dt, z: velZ * dt };
  controller.computeColliderMovement(crewCollider, want);
  const got = controller.computedMovement();
  grounded = controller.computedGrounded();
  if (walkTo) walkTo.stuck = Math.hypot(got.x, got.z) < 0.3 * Math.hypot(want.x, want.z) ? walkTo.stuck + dt : 0;
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
  // The body turns toward the way it is actually moving, taking the short way round.
  const pace = Math.hypot(velX, velZ);
  if (pace > 0.15) {
    const turn = Math.atan2(velX, velZ) - facing;
    const step = Math.atan2(Math.sin(turn), Math.cos(turn)) * ease(TURN);
    facing += THREE.MathUtils.clamp(step, -TURN_MAX * dt, TURN_MAX * dt);
    crew.rotation.y = facing;
  }
  setMove(pace > (WALK + RUN) / 2 ? 'Run' : pace > 0.3 ? 'Walk' : 'Idle');
  crewMixer.update(dt);
  bodyLanguage(dt, pace, !isInside(now));

  const inside = isInside(now);
  const inLock = airlockZone(now).inAirlock;
  // Cutaway: inside, the roof fades away and the camera looks down from above.
  // Not drawn, but still there for the Sun: the roof keeps shading the cabin.
  roofMeshes.forEach(m => { if (m.material) { m.material.colorWrite = m.material.depthWrite = !inside; } else m.visible = !inside; });
  const closest = nearestUsable()?.id; // worked out once, not once per station
  Object.values(stations).forEach(s => {
    s.marker.visible = inside && !inLock; // from inside the airlock the cabin's labels would show through its walls
    const on = inside && (hovered === s.id || closest === s.id);
    s.glow += ((on ? 1 : 0) - s.glow) * Math.min(1, dt * 8);
    s.mats.forEach(m => { m.emissive?.setRGB(0.05 * s.glow, 0.26 * s.glow, 0.55 * s.glow); });
    s.marker.on = s.glow; // the callout you point at grows and stays fully visible
  });

  // One camera everywhere, inside, outside and in the airlock: it keeps your zoom and angle, and
  // only ever comes in closer when a wall is in the way, easing back out once the way is clear.
  // The camera's height is smoothed, and it rises only a third as far as a jump, so jumping or
  // running over bumps doesn't heave the whole view up and down.
  if (grounded) { camFloor = now.y; camY += (now.y - camY) * ease(14); }
  else camY += (camFloor + (now.y - camFloor) * 0.35 - camY) * ease(7);
  head.set(now.x, camY + 0.6, now.z);
  camDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  let camWant = camDist;
  if (camWant > 0) {
    camRay.origin = head;
    camRay.dir = camDir;
    const overWalls = head.y + camWant * Math.sin(pitch) > hull.max.y - 0.6;
    const ignore = inside && !inLock ? (overWalls ? overheadIgnore : cutawayIgnore) : null;
    const hit = world.castRay(camRay, camWant + 0.3, true, undefined, undefined, crewCollider, undefined, ignore && (c => !ignore.has(c.handle)));
    if (hit) camWant = Math.max(hit.timeOfImpact - 0.3, 0);
  }
  camShown = camWant < camShown ? camWant : camShown + (camWant - camShown) * ease(5);
  if (camShown < 0.7) {
    // Squeezed right up to the astronaut by a wall: look from the visor rather than from inside the suit.
    crew.visible = false;
    camera.position.copy(head).addScaledVector(camDir, -0.1);
    camera.lookAt(camera.position.x - camDir.x, camera.position.y - camDir.y, camera.position.z - camDir.z);
  } else {
    crew.visible = true;
    camera.position.copy(head).addScaledVector(camDir, camShown);
    camera.lookAt(head);
  }
  // The view eases a little wider while sprinting.
  const fov = camera.fov + ((sprinting ? FOV_RUN : FOV) - camera.fov) * ease(6);
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

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
  hemi.intensity = 0.07 + 0.63 * light;   // at night only starlight is left outside
  earth.visible = sim.earthUp;
  // Shelter glow: soft all the time, brighter and pulsing when a storm is coming or here.
  const stormOn = sim.stormNow || (sim.nextStorm?.warnedBy && !sim.nextStorm.started);
  const pulse = stormOn ? 0.5 + 0.5 * Math.sin(performance.now() / 250) : 0;
  shelterZone.fill.material.opacity = 0.3 + 0.25 * pulse;
  shelterZone.edge.material.opacity = 0.7 + 0.3 * pulse;
  // Eco turns the cabin lamps down, and a flat battery makes them flicker.
  const lamps = LAMP * (sim.ls === 'eco' ? LAMP_ECO : 1);
  helmetGlow.intensity = 2.5 * (1 - light);
  inLights.forEach(l => { l.intensity = lamps * (sim.share < 0.8 ? 0.3 + 0.4 * Math.random() * sim.share : 1); });
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
let low = false, frames = 0, slowSince = performance.now(), lastPlayed = -Infinity;
function lowGraphics() {
  if (low) return;
  low = true;
  document.documentElement.classList.add('low'); // the panels drop their blur too (see ui.css)
  renderer.shadowMap.enabled = false;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  renderer.setPixelRatio(1);
  fitWindow();
}
if (new URLSearchParams(location.search).has('low')) lowGraphics();

let frozen = false; // the guided tour can stop the clock while it explains things
let last = performance.now();
renderer.setAnimationLoop(t => {
  starSky.uniforms.time.value = t / 1000;
  starSky.uniforms.size.value = 1.6 * renderer.getPixelRatio();
  const dt = Math.min((t - last) / 1000, 1 / 15);
  last = t;
  if (state === 'play' && !low) {
    // Only time spent actually playing counts. After a menu, a pause or a hidden tab, start the
    // count again; otherwise that idle time looks like a very slow computer.
    if (t - lastPlayed > 500) { frames = 0; slowSince = t; }
    lastPlayed = t;
    frames++;
    if (t - slowSince > 3000) {
      // Too slow to feel smooth: draw a little less sharply, a step at a time, and only as far as
      // needed. Very slow (a school Chromebook): switch to simple graphics outright.
      const rate = frames / ((t - slowSince) / 1000);
      if (rate < 24) lowGraphics();
      else if (rate < 45 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); fitWindow(); }
      frames = 0; slowSince = t;
    }
  }
  calloutLayer.hidden = state === 'off';
  if (state === 'off') return;
  if (state === 'play') {
    tick(dt);
    if (sim && !sim.over) {
      const p = crewBody.translation();
      sim.where = whereIs(p);
      Object.assign(sim, airlockZone(p));
      if (!frozen) sim.tick(dt * speed);
      else sim.airlockTick(dt); // the airlock keeps working while the tour holds the clock, so nobody is shut in
      // Out of suit air: the base computer guides you back in, and it costs you.
      if (sim.where === 'outside' && sim.suit <= 0) {
        teleport(insideSpot());
        sim.airlockSet('pressurized');
        sim.air = Math.max(0, sim.air - 10);
        sim.dose += 3;
        sim.suit = 5;
        sim.say('Suit air ran out! You made it back to the airlock, but it cost life support air.', 'bad');
      }
    }
    syncWorld(dt);
    syncAirlock(dt);
    hooks?.frame(nearestUsable());
  }
  placeCallouts();
  renderer.render(scene, camera);
});

// --- Scrapbook stills ---
// One picture of each part of the base, taken from the live 3D world for the Scrapbook pages.
// Each entry says what to frame and where the camera stands:
//   box: what must fit in the picture.  from: the direction from it to the camera.
//   tight: under 1 moves the camera closer.  inside: lift the roof off, as in the cabin view.
//   crew: where the astronaut stands, and what they face (left out = out of the picture).
const boxOf = (...things) => things.reduce((box, o) => box.union(new THREE.Box3().setFromObject(o)), new THREE.Box3());
const boxAt = (mid, w, h) => new THREE.Box3().setFromCenterAndSize(mid, new THREE.Vector3(w, h, w));
// An outdoor module, with the astronaut standing next to it to show its size.
function moduleShot(model, from, tight = 0.92) {
  const box = boxOf(model), mid = box.getCenter(new THREE.Vector3());
  const view = new THREE.Vector3(from[0], 0, from[2]).normalize(), side = new THREE.Vector3(view.z, 0, -view.x);
  const gap = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 0.9;
  const stand = mid.clone().addScaledVector(side, gap).addScaledVector(view, 0.8);
  return { box: box.expandByPoint(stand), from, tight, crew: { at: stand, face: mid } };
}
// A station in the cabin: seen from above, from the far wall and the middle of the cabin, with
// the astronaut at the controls.
function stationShot(id, tight = 0.95) {
  const s = stations[id], away = s.marker.position.z < site.z ? 1 : -1, inward = s.stand.x < site.x ? 1 : -1;
  const mid = s.stand.clone().lerp(s.marker.position, 0.5).setY(deckY + 1);
  return { box: boxAt(mid, 3.4, 2.2), from: [0.4 * inward, 1, 0.5 * away], tight, inside: true, crew: { at: s.stand, face: s.marker.position } };
}
const SHOTS = {
  Habitat: () => ({ box: boxOf(habitat), from: [0.8, 0.3, 0.75], tight: 0.72, crew: { at: outsideSpot(), face: habitat.position } }),
  HabitatBack: () => ({ box: boxOf(habitat), from: [-0.55, 0.3, 0.95], tight: 0.72 }),
  Solar: () => moduleShot(panels[2].model, [1, 0.16, 0.7], 1.05),
  Battery: () => moduleShot(models.Battery, [0.8, 0.35, 0.7]),
  OxygenMaker: () => moduleShot(models.OxygenMaker, [0.9, 0.35, 0.5]),
  Antenna: () => moduleShot(models.Antenna, [0.6, 0.25, 0.85]),
  CargoLander: () => moduleShot(models.CargoLander, [0.85, 0.3, 0.6]),
  IceDrill: () => moduleShot(models.IceDrill, [0.7, 0.25, 0.8]),
  Digger: () => moduleShot(robot, [0.75, 0.4, 0.7], 1),
  Crew: () => {
    const at = L(2, 20).add(new THREE.Vector3(0, 0.1, 0)), face = at.clone().add(new THREE.Vector3(0.9, 0, 1));
    return { box: boxAt(at.clone().add(new THREE.Vector3(0, 1, 0)), 2.6, 2.6), from: [0.75, 0.12, 1], tight: 0.9, crew: { at, face } };
  },
  Airlock: () => ({ box: boxAt(doors.outer.at.clone().add(new THREE.Vector3(0.6, 0.2, 1.2)), 5.5, 4.2), from: [0.9, 0.3, 0.75], tight: 0.9 }),
  LifeSupport: () => stationShot('LifeSupport'),
  Food: () => stationShot('Food'),
  Shelter: () => stationShot('Shelter', 1.1),
};
function snapshot(name) {
  if (state !== 'off' || !SHOTS[name]) return null;   // only between missions, when nothing else is using the view
  const shot = SHOTS[name]();
  // The world as it looks on a clear day, with nothing left over from the last mission.
  sun.intensity = SUN_FULL;
  hemi.intensity = 0.7;
  earth.visible = true;
  inLights.forEach(l => { l.intensity = LAMP; });
  panels.forEach(pn => { pn.spark.intensity = 0; pn.model.rotation.z = 0; });
  robot.position.copy(dock);
  robot.rotation.y = 0;
  syncAirlock(0, true);
  // Labels float over the game, not over a photo. They and the roof go back the way they were.
  const labels = [];
  scene.traverse(o => { if (o.isSprite && o.visible) { labels.push(o); o.visible = false; } });
  const roofWas = roofMeshes.map(m => m.visible);
  roofMeshes.forEach(m => { m.visible = !shot.inside; });
  const crewWas = { at: crew.position.clone(), turn: crew.rotation.y, seen: crew.visible };
  crew.visible = !!shot.crew;
  if (shot.crew) {
    const { at, face } = shot.crew;
    crew.position.set(at.x, at.y + CREW_HEIGHT / 2, at.z);
    crew.rotation.y = Math.atan2(face.x - at.x, face.z - at.z);
  }

  const mid = shot.box.getCenter(new THREE.Vector3()), radius = shot.box.getSize(new THREE.Vector3()).length() / 2;
  const fov = 36, ratio = renderer.getPixelRatio();
  camera.fov = fov;
  camera.aspect = 4 / 3;
  camera.updateProjectionMatrix();
  camera.position.copy(mid).addScaledVector(new THREE.Vector3(...shot.from).normalize(), radius / Math.sin(fov / 2 * Math.PI / 180) * (shot.tight ?? 1));
  if (!shot.inside) camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + 1.2);
  camera.lookAt(mid);
  sun.target.position.copy(mid);
  sun.position.copy(mid).addScaledVector(SUN_DIR, 400);
  earth.position.copy(camera.position).addScaledVector(earthDir, 5000);
  renderer.setPixelRatio(1);
  renderer.setSize(960, 720, false);
  renderer.render(scene, camera);
  const still = renderer.domElement.toDataURL('image/jpeg', 0.82);

  labels.forEach(o => { o.visible = true; });
  roofMeshes.forEach((m, i) => { m.visible = roofWas[i]; });
  crew.position.copy(crewWas.at);
  crew.rotation.y = crewWas.turn;
  crew.visible = crewWas.seen;
  camera.fov = 60;
  renderer.setPixelRatio(ratio);
  fitWindow();
  return still;
}

await document.fonts.ready;

gameReady({
  site: { ...siteData, iceDistance, maps, worldX: site.x, worldZ: site.z, ice: iceSpot, robot: () => robot.position },
  // Starts inside the Habitat, by the airlock.
  enter(newSim, newHooks) {
    sim = newSim;
    hooks = newHooks;
    speed = 1;
    setTorch(false);
    fitWindow();
    teleport(startSpot());
    facing = crew.rotation.y;
    robot.position.copy(dock);
    yaw = Math.PI / 2;
    pitch = 1;
    camDist = camShown = 9;
    grounded = false;
    walkTo = null;
    hold(null);
    syncAirlock(0, true);
    frozen = false;
    state = 'play';
  },
  setSpeed(s) { speed = s; },
  hold, // which tool is in the astronaut's hand: 'wrench', 'scoop' or null
  freeze(on) { frozen = on; },
  // Where a station's floating label is on the screen (null if it is behind the camera).
  stationScreen(id) {
    const s = stations[id];
    if (!s) return null;
    // The middle of the name, as drawn on the page.
    if (!s.marker.shown) return null;
    const r = s.marker.name.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  // Shortcut for scripted checks: skips the airlock and leaves it open to the Moon.
  goOutside() { teleport(outsideSpot()); sim?.airlockSet('vacuum'); syncAirlock(0, true); yaw = Math.PI / 2; pitch = 0.25; camDist = 7; state = 'play'; },
  // The "Back to the airlock" button: puts you between the doors and starts the trip in.
  goInside() {
    teleport(standSpot('Airlock'));
    if (sim) { Object.assign(sim, { inAirlock: true, doorway: null }); hooks?.notice(sim.airlockStart('in')); }
    camShown = camDist;
    state = 'play';
  },
  goToStation,
  pause() { state = 'paused'; keys.clear(); touchPad?.letGo(); walkTo = null; },
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
  // A still of one part of the base for a Scrapbook page: a key of SHOTS above.
  snapshot,
});

// For scripted checks from the browser console.
window.demo = { snapshot, samples, torch, setTorch, inLights, goTo: id => goToStation(id), findPath, navGrid, NAV, get walking() { return walkTo; }, doors, useDoor, airlockZone, hab, standSpot, keys, scene, tick, world, teleport, site, crewBody, insideSpot, outsideSpot, stations, isInside, whereIs, get sim() { return sim; }, iceSpot, iceDistance, siteData, camera, renderer };
