// The Moon on the mission menu: a low-poly globe in the same flat-colour style as the base, shaped
// and coloured from NASA's maps of the real Moon, with a flag for each mission. It always turns
// about its own axis, the line through its poles, at one steady speed. A dashed line marks that
// axis. Dragging tips the whole Moon, axis and all, to show another side. Picking a mission turns
// its flag to face you and moves the camera in. Pressing Play dives the camera down to the flag
// before the mission starts.
//
// The maps are from NASA's CGI Moon Kit (Scientific Visualization Studio, svs.gsfc.nasa.gov/4720),
// made from Lunar Reconnaissance Orbiter data. Both are whole-Moon maps with 0 degrees longitude
// (the middle of the side that faces Earth) in the middle of the picture:
//  * public/moon/lroc_color_poles_1k.jpg: how bright the ground is, from the LROC camera.
//  * public/moon/ldem_3_8bit.jpg: how high the ground is, from the LOLA laser altimeter.
//
// Each flag stands where its mission is really flown from. Every mission so far is flown from the
// same base on Connecting Ridge, 16 km from the south pole, so their flags are planted side by
// side on that spot and lean apart like a bunch of flowers, so each can be seen and clicked.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const TILT = -66 * DEG;        // tips the south pole toward the camera, since that is where the base is
const SPIN = 0.1;              // radians a second about its own axis while nothing is picked
const SLOP = 6;                // pixels the pointer may wander and still count as a click
const HOME = new THREE.Vector3(0, 0.05, 4.7);   // where the camera rests: far enough back that no flag is cut off
const REACH = 1.34;            // how far the flags and the axis line stick out, in Moon radii from the middle
// How finely the globe is cut up: 60 is fine enough for the real seas and big craters to show.
// Shaping it runs through every corner in JavaScript (about 220,000 at 60), so small computers
// (4 cores or fewer, like most school Chromebooks) and ?low get 40 (about 100,000) to start faster.
const small = new URLSearchParams(location.search).has('low') || (navigator.hardwareConcurrency || 8) <= 4;
const DETAIL = small ? 40 : 60;
const RELIEF = 5;              // real heights are stretched this many times, or the Moon would look like a smooth ball
const MOON_KM = 1737.4;        // the radius the height map is measured from
const HEIGHT_KM = [-9.17, 10.79];   // the heights that black and white stand for in ldem_3_8bit.jpg (fitted against NASA's ldem_4.tif, which is in km)
const MAP_W = 512, MAP_H = 256;     // the maps are shrunk to this, so one pixel is a bit smaller than one face
const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// A point on the globe from latitude and longitude in degrees, east positive. y is up, so the south
// pole is -y. East is -z, so that seen from outside with north up, east is to the right as on the
// real Moon (and not its mirror image).
const onGlobe = (lat, lon, r = 1) => new THREE.Vector3(
  r * Math.cos(lat * DEG) * Math.cos(lon * DEG), r * Math.sin(lat * DEG), -r * Math.cos(lat * DEG) * Math.sin(lon * DEG));

// The blue crater near the base. It is our own marker laid over the real ground, and not from the
// maps: it stands in for the permanently shadowed craters where the ice is. It is where Cabeus is,
// the crater NASA's LCROSS mission found water ice in (2009), drawn about four times Cabeus's real
// size so it can be seen from this far away, and clear of the flags at the pole.
const ICE = { at: onGlobe(-84.9, 324.5), size: 3.5 * DEG };
// How much the blue crater moves the ground at `d` crater radii from its middle: a bowl with a raised rim.
const iceBowl = d => (d < 1 ? -0.035 * ICE.size * 6 * (1 - d * d) : d < 1.3 ? 0.012 * ICE.size * 6 * (1 - (d - 1) / 0.3) : 0);

// The same "random" numbers every time, so the Moon looks the same on every visit.
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

// Reads NASA's two maps: { height } in km above the mean radius and { bright } from 0 to 1.
async function loadMaps() {
  const read = async (url, value) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = MAP_W; cv.height = MAP_H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
    const rgba = ctx.getImageData(0, 0, MAP_W, MAP_H).data, out = new Float32Array(MAP_W * MAP_H);
    for (let i = 0; i < out.length; i++) out[i] = value(rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255);
    return out;
  };
  const [height, bright] = await Promise.all([
    read('moon/ldem_3_8bit.jpg', r => HEIGHT_KM[0] + r * (HEIGHT_KM[1] - HEIGHT_KM[0])),
    read('moon/lroc_color_poles_1k.jpg', (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b),
  ]);
  return { height, bright };
}

// The map's value in the direction `v` (a unit vector), blended from the four nearest pixels.
// The map joins up with itself round the back of the Moon.
function mapAt(map, v) {
  const x = (Math.atan2(-v.z, v.x) / (2 * Math.PI) + 0.5) * MAP_W - 0.5;
  const y = THREE.MathUtils.clamp((0.5 - Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) / Math.PI) * MAP_H - 0.5, 0, MAP_H - 1);
  const x0 = Math.floor(x), y0 = Math.min(MAP_H - 2, Math.floor(y)), fx = x - x0, fy = y - y0;
  const px = (col, row) => map[row * MAP_W + (col + MAP_W) % MAP_W];
  return (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy;
}

// How far the ground is from the middle of the globe in the direction `v`, in Moon radii.
const groundAt = (maps, v) => 1 + (maps ? mapAt(maps.height, v) / MOON_KM * RELIEF : 0) + iceBowl(v.angleTo(ICE.at) / ICE.size);

// Shapes and colours the globe. Without the maps (before they arrive, or if they can't be loaded)
// it is a plain ball with the blue crater.
function shapeMoon(geo, maps) {
  const rand = seeded(26);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  // Push each corner in or out to the real height there, and dig the blue crater. Corners shared by several faces move the
  // same way, so the surface stays closed.
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    v.multiplyScalar(groundAt(maps, v));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // One flat colour per face, from how bright the real ground is at the middle of the face. Only
  // the brightness is taken from the map; the colours are the game's own blue-greys.
  const colors = geo.attributes.color.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c3 = new THREE.Vector3();
  const light = new THREE.Color(0xd9dee8), sea = new THREE.Color(0x737d95), ray = new THREE.Color(0xf4f6fa), ice = new THREE.Color(0x4f79c9), col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c3.fromBufferAttribute(pos, i + 2);
    v.copy(a).add(b).add(c3).normalize();
    col.copy(light);
    if (maps) {
      const shade = mapAt(maps.bright, v);
      col.copy(sea).lerp(light, THREE.MathUtils.smoothstep(shade, 0.36, 0.58));   // dark seas up to pale highlands
      col.lerp(ray, THREE.MathUtils.smoothstep(shade, 0.68, 0.82));               // the fresh, bright craters and their rays
    }
    const d = v.angleTo(ICE.at) / ICE.size;
    if (d < 0.8) col.lerp(ice, 0.85);
    else if (d >= 1 && d < 1.25) col.lerp(light, 0.6).offsetHSL(0, 0, 0.03);   // its pale rim
    col.offsetHSL(0, 0, (rand() - 0.5) * 0.02);   // a little variety from face to face
    for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (i + k) * 3);
  }
  pos.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

function buildMoon() {
  const geo = new THREE.IcosahedronGeometry(1, DETAIL);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  shapeMoon(geo, null);
  const moon = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  // A dark shell just behind the surface draws the outline.
  const outline = new THREE.Mesh(new THREE.IcosahedronGeometry(1.035, 5), new THREE.MeshBasicMaterial({ color: 0x07173f, side: THREE.BackSide }));
  moon.add(outline);
  // The axis the Moon turns on: a dashed line out of each pole. It is fixed to the Moon, so it
  // tips with it when the Moon is dragged.
  // It is faint, so it reads as a guide line and not as one of the flags. A thin dark rim keeps
  // it from vanishing on the pale ground.
  const dash = new THREE.CylinderGeometry(0.007, 0.007, 0.07, 6), edge = new THREE.CylinderGeometry(0.0115, 0.0115, 0.079, 6);
  const white = new THREE.MeshBasicMaterial({ color: 0xf2f6fc, transparent: true, opacity: 0.5, depthWrite: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x07173f, side: THREE.BackSide, transparent: true, opacity: 0.22, depthWrite: false });
  for (const end of [1, -1]) for (let y = 1.07; y < 1.3; y += 0.11) {
    const piece = new THREE.Mesh(dash, white), rim = new THREE.Mesh(edge, dark);
    piece.position.y = end * y;
    rim.renderOrder = 1; piece.renderOrder = 2;
    piece.add(rim);
    moon.add(piece);
  }
  moon.userData.axis = [[white, 0.5], [dark, 0.22]];   // the line's two paints and how see-through each is, so it can be faded
  return moon;
}

function numberSprite(n) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#07173F'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(48, 48, 40, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 54px "Chakra Petch", system-ui, sans-serif'; // the game's heading font (Fira Sans is never loaded here) ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 48, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(0.075, 0.075, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// Flags that share a spot are planted in a small ring round it. On the whole-Moon view they lean
// outward, or they would hide each other. When a mission is picked the camera goes in close: the
// flags shrink to fit the closer view (CLOSE.size) and stand up straight, and the Moon turns under
// them until they stand in a row across the picture, the picked one at the right-hand end with
// its cloth clear of the others (CLOSE.turn).
const FAN = { out: 1.5 * DEG, lean: 40 * DEG };   // how far from the spot each foot is, and how far each flag leans from far away
// Picked: how far the camera stands from the spot (Moon radii), how big the flags are, where the
// dive ends, and where the picked flag stands round the spot, measured from the camera's side.
const CLOSE = { back: 0.34, size: 0.24, dive: 0.08, turn: 60 * DEG };

// fan: null for a flag on its own, or { turn } in radians: which way round the shared spot this one stands and leans.
function buildFlag(place, number, fan = null) {
  const flag = new THREE.Group();
  const spot = onGlobe(place.lat, place.lon).normalize(), up = spot.clone(), lean = new THREE.Group();
  if (fan) {
    // Two directions along the ground at the spot, then this flag's own direction between them.
    const ref = Math.abs(spot.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = ref.addScaledVector(spot, -ref.dot(spot)).normalize(), t2 = new THREE.Vector3().crossVectors(spot, t1);
    const away = t1.multiplyScalar(Math.cos(fan.turn)).addScaledVector(t2, Math.sin(fan.turn));
    up.multiplyScalar(Math.cos(FAN.out)).addScaledVector(away, Math.sin(FAN.out)).normalize();
    // Lean away from the spot: a turn about the line along the ground that is square to `away`.
    const hinge = new THREE.Vector3().crossVectors(up, away).normalize();
    hinge.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)));
    lean.quaternion.setFromAxisAngle(hinge, FAN.lean);
    lean.userData.hinge = hinge;   // kept, so the lean can be eased away when the camera comes in close
    lean.userData.away = away.clone().addScaledVector(up, -away.dot(up)).normalize();   // from the shared spot to this foot, along the ground
  }
  // Where this spot sits when it faces the camera: a little below the middle of the picture.
  const face = new THREE.Vector3(0, up.y, Math.sqrt(1 - up.y * up.y)).applyAxisAngle(new THREE.Vector3(1, 0, 0), TILT);
  flag.position.copy(up).multiplyScalar(0.985);   // moved onto the real ground once the maps arrive
  flag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 6), new THREE.MeshBasicMaterial({ color: 0xf2f6fc }));
  pole.position.y = 0.1;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.11, 0.035), new THREE.Vector2(0, 0.07)]);
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x2e96f5, side: THREE.DoubleSide }));
  cloth.position.set(0.007, 0.125, 0);
  // A ring on the ground marks the spot. It lights up for the picked mission.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0xeafe07, side: THREE.DoubleSide, transparent: true, opacity: 0, depthTest: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.renderOrder = 4;
  const badge = numberSprite(number);
  badge.position.y = 0.26;
  // An unseen ball round the flag makes it easier to click or tap. On a leaning flag it is smaller
  // and nearer the top, where the flags are furthest apart, so each has its own.
  const reach = new THREE.Mesh(new THREE.SphereGeometry(fan ? 0.1 : 0.11, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  reach.position.y = fan ? 0.2 : 0.1;
  // The pole and cloth turn on the spot to keep the cloth facing whoever is looking.
  const mast = new THREE.Group();
  mast.add(pole, cloth);
  lean.add(mast, badge, reach);
  flag.add(lean, ring);
  return { flag, lean, mast, cloth, ring, badge, reach, up, face };
}

// missions: [{ id, place: { lat, lon } }]. onPick(id) is called when a flag is clicked, and
// onPick(null) when the Moon is clicked away from the flags while one is picked.
export function createMoonMenu(canvas, missions, onPick) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 50);
  scene.add(new THREE.HemisphereLight(0xc9d8f2, 0x0b1c49, 1.1));
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.4);
  sun.position.set(-3, 2.2, 3.5);
  scene.add(sun);

  const moon = buildMoon();
  moon.rotation.x = TILT;
  scene.add(moon);
  // Missions flown from the same place share a spot: their flags stand round it, evenly spaced.
  const sameSpot = m => missions.filter(o => o.place.lat === m.place.lat && o.place.lon === m.place.lon);
  const flags = Object.fromEntries(missions.map((m, i) => {
    const group = sameSpot(m);
    const made = buildFlag(m.place, i + 1, group.length > 1 ? { turn: (group.indexOf(m) / group.length + 0.25) * 2 * Math.PI } : null);
    made.reach.userData.id = m.id;
    moon.add(made.flag);
    return [m.id, made];
  }));
  // When NASA's maps arrive the plain ball takes the real Moon's shape and colours, and each flag
  // moves to stand on the ground there. If they can't be loaded the plain ball stays.
  loadMaps().then(maps => {
    shapeMoon(moon.geometry, maps);
    for (const f of Object.values(flags)) f.flag.position.copy(f.up).multiplyScalar(groundAt(maps, f.up) - 0.015);
  }).catch(() => {});

  let picked = null;        // mission id whose flag faces the camera
  let near = 0;             // 0 = the whole-Moon view, up to 1 = in close on the picked flag
  let locked = new Set();   // missions that can't be played yet: their flags are grey
  let diving = 0;           // 0 = not diving, up to 1 = at the surface
  let diveDone = null;
  let running = false, last = 0;
  const look = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3(), spot = new THREE.Vector3(), out = new THREE.Vector3();
  const wantUp = new THREE.Vector3(), side = new THREE.Vector3(), seen = new THREE.Vector3(), TOWARD = new THREE.Vector3(0, 0.45, 1).normalize();
  camera.position.copy(HOME);

  // Dragging turns the whole Moon by hand, so any side can be brought round. When it is let go it
  // carries on turning about its own axis, wherever that now points.
  let drag = null;          // { id, x, y, far } while a finger or the mouse holds the Moon
  let dragged = false;      // the last press moved far enough to be a drag, not a click
  const down = { x: 0, y: 0 };   // where the last press began
  const step = new THREE.Vector3(), turnBy = new THREE.Quaternion(), NONE = new THREE.Quaternion();
  const turn = (about, angle) => { moon.quaternion.premultiply(turnBy.setFromAxisAngle(about, angle)).normalize(); };

  function paint() {
    for (const [id, f] of Object.entries(flags)) {
      const on = id === picked, shut = locked.has(id);
      f.cloth.material.color.setHex(on ? 0xeafe07 : shut ? 0x8fa3c8 : 0x2e96f5);
      f.want = on ? 1.35 : picked ? 0.85 : 1;   // its size next to the others; frame() eases to it
      f.ring.material.opacity = on ? 1 : 0;
      f.badge.material.opacity = picked && !on ? 0.55 : 1;
    }
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const ease = still ? 1 : 1 - Math.exp(-dt * 4.5);
    if (picked) {
      // Turn the short way round until the flag faces the camera, then hold it there.
      seen.copy(flags[picked].up).applyQuaternion(moon.quaternion);
      moon.quaternion.premultiply(turnBy.setFromUnitVectors(seen, flags[picked].face).slerp(NONE, 1 - ease)).normalize();
      moon.updateMatrixWorld(true);
      flags[picked].flag.getWorldPosition(spot);
      out.copy(spot).normalize();
      // Close in low and from the side, with the ground at the bottom of the picture, so the
      // flag stands upright against the sky. The dive goes almost down to the ground.
      const back = THREE.MathUtils.lerp(CLOSE.back, CLOSE.dive, diving);
      side.copy(TOWARD).addScaledVector(out, -TOWARD.dot(out)).normalize();
      // Flags that share the spot: turn the Moon about the flag until they stand in a row across
      // the picture. `step` is where the picked flag should be round the spot: toward the camera
      // and to its right.
      const away = flags[picked].lean.userData.away;
      if (away) {
        seen.copy(away).applyQuaternion(moon.quaternion).addScaledVector(out, -seen.dot(out)).normalize();
        step.crossVectors(out, side).multiplyScalar(Math.sin(CLOSE.turn)).addScaledVector(side, Math.cos(CLOSE.turn)).normalize();
        moon.quaternion.premultiply(turnBy.setFromUnitVectors(seen, step).slerp(NONE, 1 - ease)).normalize();
        moon.updateMatrixWorld(true);
        flags[picked].flag.getWorldPosition(spot);
      }
      wantPos.copy(side).addScaledVector(out, 0.5).normalize().multiplyScalar(back).add(spot);
      wantLook.copy(spot).addScaledVector(out, 0.035);
      wantUp.copy(out);
      flags[picked].ring.scale.setScalar(1 + 0.12 * Math.sin(now / 260));
    } else {
      // West to east about its own poles, the way the real Moon turns, and never faster or slower.
      if (!drag && !still) moon.rotateY(SPIN * dt);
      wantPos.copy(HOME);
      wantLook.set(0, 0, 0);
      wantUp.set(0, 1, 0);
    }
    camera.position.lerp(wantPos, ease);
    look.lerp(wantLook, ease);
    camera.up.lerp(wantUp, ease).normalize();
    camera.lookAt(look);
    // In close the flags are small and upright; from far away they are full size and lean apart.
    near += ((picked ? 1 : 0) - near) * ease;
    // Up close the axis line would be a thick bar behind the flags, so it fades out on the way in.
    for (const [paint, full] of moon.userData.axis) paint.opacity = full * (1 - near);
    for (const f of Object.values(flags)) {
      f.size = (f.size ?? 1) + ((f.want ?? 1) - (f.size ?? 1)) * ease;
      f.flag.scale.setScalar(f.size * THREE.MathUtils.lerp(1, CLOSE.size, near));
      if (f.lean.userData.hinge) f.lean.quaternion.setFromAxisAngle(f.lean.userData.hinge, FAN.lean * (1 - near));
    }
    // Turn each flag's cloth to face the camera.
    for (const f of Object.values(flags)) {
      f.lean.worldToLocal(seen.copy(camera.position));
      f.mast.rotation.y = Math.atan2(seen.x, seen.z);
    }
    if (diveDone) {
      diving = Math.min(1, diving + dt / 0.9);
      if (diving >= 1 || still) { const done = diveDone; diveDone = null; done(); }
    }
    renderer.render(scene, camera);
  }

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On a tall, narrow canvas pull back so the whole Moon still fits.
    camera.fov = camera.aspect < 1 ? 32 / camera.aspect : 32;
    camera.updateProjectionMatrix();
    // On a wide canvas the Moon sits to the right of the middle, away from the mission boxes,
    // but never so far that a flag on its edge would be cut off.
    const radius = h / 2 / Math.tan(camera.fov * DEG / 2) / HOME.length();
    const shift = Math.round(Math.max(0, Math.min(w * 0.1, w / 2 - REACH * radius)));
    if (shift) camera.setViewOffset(w, h, -shift, 0, w, h); else camera.clearViewOffset();
  }
  new ResizeObserver(fit).observe(canvas);

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function flagAt(e) {
    const box = canvas.getBoundingClientRect();
    mouse.set((e.clientX - box.left) / box.width * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    // The Moon is in the list too, so a flag round the back can't be clicked through it.
    return ray.intersectObjects([moon, ...Object.values(flags).map(f => f.reach)], false)[0]?.object.userData.id ?? null;
  }
  // A click on a flag picks it. A click anywhere else while zoomed in goes back to the whole Moon.
  canvas.addEventListener('click', e => {
    if (dragged || Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) return;
    const id = flagAt(e);
    if (!diveDone && (id || picked)) onPick(id);
  });

  // Dragging turns the whole Moon under the pointer, like a globe on a desk. It only works on the
  // whole-Moon view: once a mission is picked the camera stays on its flag.
  canvas.addEventListener('pointerdown', e => {
    dragged = false;
    down.x = e.clientX; down.y = e.clientY;
    if (picked || diveDone || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, far: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) { canvas.style.cursor = flagAt(e) ? 'pointer' : picked ? 'default' : ''; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.far += Math.hypot(dx, dy);
    if (drag.far > SLOP) { dragged = true; canvas.style.cursor = 'grabbing'; }
    // How many pixels wide the Moon's radius is, so the ground under the pointer keeps up with it.
    const radius = canvas.clientHeight / 2 / Math.tan(camera.fov * DEG / 2) / camera.position.length();
    const angle = Math.hypot(dx, dy) / radius;
    if (angle > 0) {
      // Sideways movement turns it about the camera's up, up-and-down movement about its right.
      step.set(dy, dx, 0).normalize().applyQuaternion(camera.quaternion);
      turn(step, angle);
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  function letGo(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    canvas.style.cursor = '';
  }
  canvas.addEventListener('pointerup', letGo);
  canvas.addEventListener('pointercancel', letGo);

  paint();
  return {
    start() { if (running) return; running = true; diving = 0; diveDone = null; fit(); last = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
    // Which flag to face and move in on. null lets the Moon turn freely again.
    pick(id) { picked = id && flags[id] ? id : null; diving = 0; paint(); },
    setLocked(ids) { locked = new Set(ids); paint(); },
    // Flies the camera down to the flag. Resolves when it gets there.
    dive(id) {
      this.pick(id);
      if (!picked || !running) return Promise.resolve();
      return new Promise(done => { diveDone = done; });
    },
    get picked() { return picked; },
    // For scripted checks: which mission's flag is under a point of the page.
    flagAt: (x, y) => flagAt({ clientX: x, clientY: y }),
  };
}
