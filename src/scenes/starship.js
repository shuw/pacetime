import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { G, mesh } from "../geo.js";
import { mat, shared } from "../shaders.js";
import { kmh, retardedTime, world } from "../relativity.js";
import { neon } from "../earth.js";
import { sfx } from "../audio.js";
import { formatTime, humanTime } from "../hud.js";
import { buildCabin, clockFace, jellyGeometry, SEAT, WALK } from "./starship-cabin.js";

// Light at its real speed, and a real trip: from orbit above Earth to
// Proxima Centauri and back.
const C = 299792458;
const TAU = Math.PI * 2;
const LY = 9.4607e15, AU = 1.496e11, YEAR = 31557600;
const D = 4.2465 * LY; // to Proxima Centauri
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const HOME = v3(0, 0, 0); // the ship's dock at Halo Station
const STATION = v3(0, 10, 120); // the station's hub, beside the dock
const BUOY = v3(0, 0, -D); // the Far Buoy, in orbit by Proxima b
const STOP_OUT = v3(0, 0, -D + 320); // where we stop, with the buoy just ahead
const BODIES = {
  earth: { at: v3(0, -6.771e6, 0), r: 6.371e6 },
  moon: { at: v3(-0.55, 0.3, -0.78).normalize().multiplyScalar(3.844e8), r: 1.737e6 },
  sun: { at: v3(0.8, 0.25, -0.5).normalize().multiplyScalar(AU), r: 6.957e8, light: 1, color: [1.3, 1.25, 1.2] },
  proxima: { at: v3(-4.5e9, 1.6e9, -5.6e9).add(BUOY), r: 1.07e8, light: 0.0017, color: [1.5, 0.78, 0.5] },
  proximaB: { at: v3(2.2e7, -0.6e7, -1.6e7).add(BUOY), r: 7.2e6 },
  alphaA: { at: v3(1.25e15, 0.9e15, 1.1e15).add(BUOY), r: 8.5e8, light: 1.5, color: [1.3, 1.25, 1.15] },
  alphaB: { at: v3(1.25e15 + 3.4e12, 0.9e15, 1.1e15).add(BUOY), r: 6.0e8, light: 0.5, color: [1.4, 1.1, 0.8] },
};
const CARDS = [
  "One year without you! The greenhouse tree has its first blossoms.",
  "Year two: we taught the space jellies to wave. Mostly.",
  "Three years! The whale had a calf. We named it Little c.",
  "Year four. Pip's cousin Pop says beep boop.",
  "Five years! We repainted the ring. Still pink.",
  "Year six. The tree is taller than its dome now.",
  "Seven years. We keep a light on for you.",
  "Year eight. Our telescope says you're on your way. The cake is in the freezer.",
  "Nine years! The cake is getting freezer burn.",
  "Ten years. Seriously, where are you?",
];

// Things light-years away can't be drawn where they are: the numbers are far
// too big for the graphics card. Each is drawn on a scaled-down copy instead,
// nearer but smaller by the same factor, so it's in exactly the same
// direction at exactly the same size. The bending of light at speed scales
// the same way, so what you see is unchanged.
const NEAR = 2e4;
const squeeze = (d) => (d < NEAR ? d : NEAR * (1 + Math.log(d / NEAR)));
function place(obj, at, eye, scale = 1) {
  const rel = at.clone().sub(eye), d = rel.length(), k = d > 0 ? squeeze(d) / d : 1;
  obj.position.copy(eye).addScaledVector(rel, k);
  obj.scale.setScalar(scale * k);
  return d;
}

// Smooth noise, for painting planets.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
function fbm(x, y, z, octaves = 5) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < octaves; i++) { sum += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return sum;
}
function paintedSphere(segments, paint, opts = {}) {
  const g = new THREE.SphereGeometry(1, segments, segments / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    paint(v.fromBufferAttribute(p, i), c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, mat({ color: "#ffffff", vertexColors: true, ir: 0.5, uv: 0.3, ...opts }));
}
const C_ = (s) => new THREE.Color(s);
const earthPaint = (() => {
  const deep = C_("#0f377d"), shallow = C_("#2a78c8"), green = C_("#3f8a45"), forest = C_("#28603a"), sand = C_("#c2a46a"), ice = C_("#f2f6ff"), white = C_("#ffffff");
  return (v, c) => {
    const n = fbm(v.x * 1.8 + 3, v.y * 1.8, v.z * 1.8) + 0.12 * (fbm(v.x * 7, v.y * 7, v.z * 7) - 0.5);
    const lat = Math.abs(v.y);
    if (lat > 0.86 - 0.08 * n) c.copy(ice);
    else if (n > 0.53) c.copy(lat < 0.35 && n < 0.58 ? sand : green).lerp(forest, THREE.MathUtils.smoothstep(n, 0.56, 0.7));
    else c.copy(deep).lerp(shallow, THREE.MathUtils.smoothstep(n, 0.4, 0.53));
    const cloud = fbm(v.x * 3.2 + 9, v.y * 3.2 + 2, v.z * 3.2);
    if (cloud > 0.55) c.lerp(white, Math.min(1, (cloud - 0.55) * 5) * 0.9);
  };
})();
const moonPaint = (v, c) => {
  const n = fbm(v.x * 3 + 1, v.y * 3, v.z * 3), maria = fbm(v.x * 1.2 + 5, v.y * 1.2, v.z * 1.2);
  const k = 0.55 + 0.3 * (n - 0.5) - (maria > 0.55 ? 0.18 : 0);
  c.setRGB(k, k, k * 1.02);
};
const proxBPaint = (() => {
  const rust = C_("#6e3424"), ochre = C_("#c27a4a"), frost = C_("#f4e6ee"), sea = C_("#2a3a5a");
  return (v, c) => {
    const n = fbm(v.x * 2.2 + 7, v.y * 2.2, v.z * 2.2);
    c.copy(rust).lerp(ochre, THREE.MathUtils.smoothstep(n, 0.35, 0.65));
    if (n < 0.36) c.lerp(sea, 0.7);
    if (Math.abs(v.y) > 0.8 - 0.1 * n) c.copy(frost);
  };
})();

// A soft glowing disc: a star's halo, or the dot a far-off planet makes.
function glowDisc(color, intensity = 1, ir = 0.6, uv = 0.8) {
  const ring = new THREE.RingGeometry(0.0001, 1, 40, 8);
  const p = ring.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getY(i));
    const k = Math.pow(Math.max(0, 1 - d), 2.4) + 0.6 * Math.pow(Math.max(0, 1 - d * 3), 2);
    col.set([k, k, k], i * 3);
  }
  ring.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(ring, mat({ color, vertexColors: true, additive: true, emissive: intensity, ir, uv, doubleSided: true, depthWrite: false }));
  m.renderOrder = 1;
  return m;
}

// Neon lettering as a single mesh, centred on `at`, readable from +z
// (facing 1) or from -z (facing -1).
function sign(text, { size, color, width, at, facing = 1 }) {
  const g = neon(text, { size, color, width });
  g.updateMatrixWorld(true);
  const geos = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    const q = o.geometry.toNonIndexed().applyMatrix4(o.matrixWorld);
    for (const n of Object.keys(q.attributes)) if (n !== "position" && n !== "normal") q.deleteAttribute(n);
    geos.push(q);
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), g.glow);
  m.position.set(at[0] - (facing * g.textWidth) / 2, at[1], at[2]);
  if (facing < 0) m.rotation.y = Math.PI;
  return m;
}

// A soft, glowing cloud of gas far beyond the stars.
function nebula(r, color) {
  const ring = new THREE.RingGeometry(0.0001, r, 48, 6);
  const p = ring.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getY(i)) / r;
    const k = (1 - d) ** 2 * (0.7 + 0.3 * Math.sin(i * 1.7));
    col.set([k, k, k], i * 3);
  }
  ring.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(ring, mat({ color, vertexColors: true, additive: true, emissive: 1, ir: 0.4, uv: 0.8, doubleSided: true, depthWrite: false, unique: true }));
}

// Halo Station: a candy-striped ring that turns slowly round a hub, a big
// clock on the front, and a greenhouse with a tree that grows on station time.
// Built around the ship's dock.
function buildStation() {
  const st = new THREE.Group();
  st.userData.dynamic = true;
  const ring = new THREE.Group();
  ring.position.copy(STATION);
  st.add(ring);
  for (let i = 0; i < 16; i++) ring.add(mesh(new THREE.TorusGeometry(52, 4, 14, 10, TAU / 16), mat({ color: i % 2 ? "#ff8fd8" : "#f4f1ea", ir: 0.5, uv: 0.3 }), { rot: [0, 0, (i * TAU) / 16] }));
  ring.add(mesh(new THREE.TorusGeometry(48, 0.6, 8, 128), mat({ color: "#5fe1ff", emissive: 1, ir: 0.6, uv: 1.2 })));
  const windows = mat({ color: "#ffe2a8", emissive: 1, ir: 0.8, uv: 0.4 });
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU;
    ring.add(mesh(G.box, windows, { pos: [Math.cos(a) * 52, Math.sin(a) * 52, -4.1], rot: [0, 0, a], scale: [0.8, 1.6, 0.2] }));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ring.add(mesh(G.cyl, mat({ color: "#c9a0ff", emissive: 0.7, ir: 0.6, uv: 1 }), { pos: [Math.cos(a) * 30, Math.sin(a) * 30, 0], rot: [0, 0, a - Math.PI / 2], scale: [0.9, 36, 0.9] }));
  }
  // The hub, with a glowing belt and a beacon on top.
  st.add(mesh(new THREE.SphereGeometry(13, 48, 32), mat({ color: "#e8ecf8", ir: 0.4, uv: 0.3 }), { pos: STATION.toArray() }));
  st.add(mesh(new THREE.TorusGeometry(13.1, 0.8, 8, 64), mat({ color: "#5ce1c6", emissive: 0.9, ir: 0.5, uv: 1 }), { pos: STATION.toArray(), rot: [Math.PI / 2, 0, 0] }));
  st.add(mesh(G.cyl, mat({ color: "#c9d0ea" }), { pos: [STATION.x, STATION.y + 17, STATION.z], scale: [0.3, 8, 0.3] }));
  const beacon = mat({ color: "#ff5a4a", emissive: 1, ir: 1.2, uv: 0.4, unique: true });
  st.add(mesh(G.sphere, beacon, { pos: [STATION.x, STATION.y + 21.5, STATION.z], scale: 1.1 }));
  // The docking arm runs under the ship from the hub, lit by chasing lights.
  const z0 = 4, z1 = STATION.z - 12;
  st.add(mesh(G.box, mat({ color: "#3a3f6a", ir: 0.3 }), { pos: [0, -2.4, (z0 + z1) / 2], scale: [1.4, 1.0, z1 - z0] }));
  st.add(mesh(G.box, mat({ color: "#3a3f6a", ir: 0.3 }), { pos: [0, -1.7, 2], scale: [0.8, 0.9, 4] }));
  const dockMats = [0, 1, 2].map(() => mat({ color: "#ffd166", emissive: 1, ir: 0.8, uv: 0.4, unique: true }));
  for (let z = z0 + 2, i = 0; z < z1; z += 4, i++) for (const sx of [-1, 1]) st.add(mesh(G.sphere, dockMats[i % 3], { pos: [sx * 0.8, -1.85, z], scale: 0.22 }));
  const clock = clockFace(9, { rim: "#ff8fd8" });
  clock.position.set(STATION.x, STATION.y + 2, STATION.z - 13.2);
  st.add(clock);
  st.add(sign("HALO STATION", { size: 1.4, color: "#ff8fd8", width: 0.32, at: [STATION.x, STATION.y + 26, STATION.z - 4], facing: -1 }));
  st.add(sign("STATION TIME", { size: 0.7, color: "#ffd166", width: 0.18, at: [STATION.x, STATION.y + 12.5, STATION.z - 13], facing: -1 }));
  st.add(sign("SPEED LIMIT C", { size: 2.2, color: "#ff5a4a", width: 0.5, at: [0, 34, -280], facing: 1 }));
  st.add(sign("WELCOME HOME", { size: 2.2, color: "#5ce1c6", width: 0.5, at: [0, 34, -520], facing: -1 }));
  // The greenhouse.
  const gh = v3(-20, 2, STATION.z - 6);
  st.add(mesh(G.cyl, mat({ color: "#3a3f6a" }), { pos: [gh.x / 2 - 2, gh.y + 3, gh.z + 3], rot: [0, 0, Math.PI / 2], scale: [0.8, Math.abs(gh.x) - 6, 0.8] }));
  st.add(mesh(new THREE.CylinderGeometry(6.4, 6.4, 1, 40), mat({ color: "#5ce1c6", emissive: 0.4, ir: 0.4 }), { pos: [gh.x, gh.y - 0.5, gh.z] }));
  const dome = mesh(new THREE.SphereGeometry(6.2, 40, 20, 0, TAU, 0, Math.PI / 2), mat({ color: "#bfe6ff", opacity: 0.12, ir: 0.1, uv: 0.3, depthWrite: false, doubleSided: true }), { pos: gh.toArray() });
  dome.renderOrder = 4;
  st.add(dome);
  const tree = new THREE.Group();
  tree.position.copy(gh);
  tree.add(mesh(G.cyl, mat({ color: "#7a4a2a", ir: 0.4 }), { pos: [0, 1.4, 0], scale: [0.35, 2.8, 0.35] }));
  const leaf = mat({ color: "#52c46a", ir: 0.6, uv: 0.3 });
  for (const [x, y, z, r] of [[0, 3.6, 0, 1.6], [1.1, 3.1, 0.4, 1.1], [-1.0, 3.2, -0.3, 1.2], [0.2, 4.6, 0.3, 1.0]]) tree.add(mesh(G.sphere, leaf, { pos: [x, y, z], scale: r }));
  const blossoms = new THREE.Group();
  const blossom = mat({ color: "#ff8fd8", emissive: 0.4, ir: 0.6, uv: 0.6 });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    blossoms.add(mesh(G.sphere, blossom, { pos: [Math.cos(a) * 1.6, 3 + (i % 4) * 0.5, Math.sin(a) * 1.6], scale: 0.22 }));
  }
  tree.add(blossoms);
  st.add(tree);
  // Little shuttles buzzing round the station.
  const shuttles = ["#ffd166", "#5ce1c6", "#ff8f5c"].map((c, i) => {
    const s = new THREE.Group();
    s.add(mesh(new THREE.CapsuleGeometry(0.9, 2.2, 4, 12), mat({ color: "#f4f1ea", ir: 0.4 }), { rot: [Math.PI / 2, 0, 0] }));
    s.add(mesh(G.sphere, mat({ color: c, emissive: 1, ir: 1, uv: 0.6 }), { pos: [0, 0, 1.9], scale: 0.6 }));
    s.add(mesh(G.sphere, mat({ color: "#7fe8ff", emissive: 0.6 }), { pos: [0, 0.5, -0.8], scale: 0.55 }));
    st.add(s);
    return { s, r: 70 + i * 14, w: 0.05 + i * 0.012, tilt: 0.3 + i * 0.4, phase: i * 2 };
  });
  st.traverse((o) => o.isMesh && (o.userData.dynamic = true));
  return { group: st, ring, clock, tree, blossoms, beacon, dockMats, shuttles, treeAt: gh.clone().add(v3(0, 3, 0)) };
}

// A space whale, just because.
function buildWhale(size = 1) {
  const w = new THREE.Group();
  const body = mat({ color: "#5f86ec", emissive: 0.18, ir: 0.5, uv: 0.4 });
  w.add(mesh(G.sphere, body, { scale: [16, 14, 46] }));
  w.add(mesh(G.sphere, mat({ color: "#cfe0ff", emissive: 0.2, ir: 0.5, uv: 0.4 }), { pos: [0, -5, -4], scale: [13, 9, 38] }));
  for (const sx of [-1, 1]) {
    w.add(mesh(G.sphere, mat({ color: "#ffffff" }), { pos: [sx * 13.5, 2, -30], scale: 2.4 }));
    w.add(mesh(G.sphere, mat({ color: "#111111" }), { pos: [sx * 14.6, 2.2, -31], scale: 1.2 }));
    w.add(mesh(G.box, body, { pos: [sx * 18, -6, -10], rot: [0.3, sx * 0.4, sx * 0.7], scale: [16, 1.6, 7] }));
  }
  const spots = mat({ color: "#7fe8ff", emissive: 1, ir: 0.6, uv: 1.2 });
  for (let i = 0; i < 18; i++) w.add(mesh(G.sphere, spots, { pos: [Math.sin(i * 1.7) * 9, 9 + Math.cos(i) * 2, -30 + i * 3.4], scale: 0.9 + (i % 3) * 0.4 }));
  const tail = new THREE.Group();
  tail.position.set(0, 0, 44);
  tail.add(mesh(G.sphere, body, { pos: [0, 0, 8], scale: [6, 5, 14] }));
  tail.add(mesh(G.box, body, { pos: [0, 0, 22], scale: [34, 1.5, 9] }));
  w.add(tail);
  w.tail = tail;
  w.scale.setScalar(size);
  w.traverse((o) => o.isMesh && (o.userData.dynamic = true));
  return w;
}

// The Far Buoy: a crystal lighthouse with sweeping beams, built around itself.
function buildBuoy() {
  const b = new THREE.Group();
  b.userData.dynamic = true;
  const crystal = mat({ color: "#bff4ff", emissive: 0.85, ir: 0.8, uv: 1.4, unique: true });
  b.add(mesh(new THREE.OctahedronGeometry(1, 0), crystal, { scale: [7, 28, 7] }));
  for (const [rot, c] of [[[0, 0, 0], "#ffd166"], [[0, Math.PI / 2, 0], "#ff8fd8"], [[Math.PI / 2, 0, 0], "#5fe1ff"]]) b.add(mesh(new THREE.TorusGeometry(36, 1.4, 12, 96), mat({ color: c, emissive: 0.9, ir: 1, uv: 0.8 }), { rot }));
  const beams = new THREE.Group();
  for (const dir of [1, -1]) {
    const g = new THREE.ConeGeometry(30, 600, 32, 1, true);
    g.translate(0, -300, 0);
    beams.add(mesh(g, mat({ color: "#fff1c4", additive: true, emissive: 0.12, ir: 0.2, uv: 0.3, doubleSided: true, depthWrite: false }), { rot: [0, 0, (dir * Math.PI) / 2] }));
  }
  beams.position.y = 18;
  b.add(beams);
  b.add(sign("FAR BUOY", { size: 4, color: "#ffd166", width: 0.9, at: [0, 52, 0], facing: 1 }));
  b.add(sign("PROXIMA CENTAURI", { size: 1.6, color: "#ff8fd8", width: 0.4, at: [0, 42, 0], facing: 1 }));
  b.traverse((o) => o.isMesh && (o.userData.dynamic = true));
  return { group: b, crystal, beams };
}

const dist = (m) => {
  if (m < 1e4) return `${Math.round(m)} m`;
  if (m < 1e9) return `${Math.round(m / 1000).toLocaleString("en-US")} km`;
  if (m < 0.05 * LY) return `${(m / AU).toFixed(m < 10 * AU ? 2 : 0)} AU`;
  return `${(m / LY).toFixed(3)} light-years`;
};

export default {
  id: "starship",
  title: "Starship",
  tag: "the twin paradox",
  blurb: "Light at its real speed, and a real trip: take the Pacer from orbit above Earth to Proxima Centauri, 4.24 light-years away, and back. A few minutes pass for you. More than eight years pass at home.",

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const base = new THREE.Vector3(); // universe position of the local origin
    const local = (u) => u.clone().sub(base);
    const start = Date.now(); // the Earth date when you set off
    const dateAt = (t) => new Date(start + t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    const station = buildStation();
    group.add(station.group);
    const buoy = buildBuoy();
    group.add(buoy.group);

    // Jellies and a whale drift about near the station.
    const jellies = [];
    const jellyColors = ["#ff8fd8", "#7fe8ff", "#c9a0ff", "#ffd166", "#7dffb0"];
    for (let i = 0; i < 14; i++) {
      const r = 4 + ((i * 37) % 10), c = jellyColors[i % 5];
      const g = jellyGeometry(r, c);
      const j = new THREE.Group();
      j.add(mesh(g.bell, mat({ color: c, emissive: 0.85, ir: 0.6, uv: 1.2, opacity: 0.8 })));
      j.add(mesh(g.tentacles, mat({ color: c, emissive: 0.6, ir: 0.6, uv: 1.2 })));
      const a = i * 2.39, rr = 90 + (i % 5) * 45;
      const at = v3(Math.cos(a) * rr, Math.sin(a * 1.7) * 60, -150 + Math.sin(a) * rr - (i % 3) * 120);
      if (Math.abs(at.x) < 40 && Math.abs(at.y) < 40) at.x += 60 * Math.sign(at.x || 1);
      j.position.copy(at);
      j.traverse((o) => o.isMesh && (o.userData.dynamic = true));
      station.group.add(j);
      jellies.push({ j, at, tilt: (i % 2 ? 1 : -1) * 0.2, phase: i * 1.3 });
    }
    const WHALE_AT = v3(-230, 40, -520);
    const whale = buildWhale(1.5), calf = buildWhale(0.6);
    station.group.add(whale, calf);

    // The planets and stars.
    const bodies = [];
    const addBody = (key, m, glow, opts = {}) => {
      const b = { ...BODIES[key], key, mesh: m, glow, ...opts };
      group.add(m);
      if (glow) group.add(glow);
      [m, glow].forEach((o) => o && (o.userData.dynamic = true));
      bodies.push(b);
      return b;
    };
    const earth = paintedSphere(256, earthPaint);
    earth.rotation.set(1.15, 0.6, 0.3); // so the station orbits over oceans and continents, not the pole
    {
      const air = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 64), mat({ color: "#6fb0ff", additive: true, emissive: 0.3, ir: 0.2, uv: 0.8, depthWrite: false, unique: true }));
      air.material.side = THREE.BackSide;
      earth.add(air);
    }
    addBody("earth", earth, glowDisc("#7fb6ff", 1.2), { dot: 0.004, dotMax: 2e13 });
    addBody("moon", paintedSphere(96, moonPaint), glowDisc("#d8d8e0", 0.8), { dot: 0.003, dotMax: 2e11 });
    addBody("sun", new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat({ color: "#fff4e0", emissive: 1.4, ir: 1.2, uv: 1 })), glowDisc("#fff1d0", 1.4, 1, 1), { halo: 6, dot: 0.007 });
    addBody("proxima", new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat({ color: "#ff7a4a", emissive: 1.3, ir: 1.6, uv: 0.2 })), glowDisc("#ff6a3a", 1.3, 1.4, 0.2), { halo: 7, dot: 0.004 });
    addBody("proximaB", paintedSphere(160, proxBPaint), glowDisc("#e0906a", 0.9), { dot: 0.003, dotMax: 2e11 });
    addBody("alphaA", new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat({ color: "#fff1c8", emissive: 1.4, ir: 1, uv: 1 })), glowDisc("#fff1c8", 1.5, 1, 1), { halo: 6, dot: 0.0065 });
    addBody("alphaB", new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat({ color: "#ffd2a0", emissive: 1.3, ir: 1.2, uv: 0.6 })), glowDisc("#ffd2a0", 1.3, 1.2, 0.6), { halo: 6, dot: 0.005 });

    // Glowing clouds of gas, so far off they never get any closer.
    const backdrop = new THREE.Group();
    backdrop.userData.dynamic = true;
    const nebulae = [];
    for (const [pos, r, c] of [
      [[-30000, 8000, -60000], 14000, "#5a2a8a"], [[38000, -5000, -45000], 11000, "#1f5a7a"], [[-45000, -9000, 10000], 12000, "#7a2a4a"],
      [[20000, 15000, 40000], 13000, "#3a2a7a"], [[5000, -20000, -90000], 18000, "#2a6a5a"], [[-12000, 20000, -25000], 9000, "#8a4a2a"],
    ]) {
      const n = nebula(r, c);
      n.position.set(...pos);
      n.lookAt(0, 0, 0);
      nebulae.push(n);
      backdrop.add(n);
    }
    group.add(backdrop);

    // The ship, and you aboard it.
    const cabin = buildCabin();
    group.add(cabin.group);
    const ship = {
      pos: new THREE.Vector3(0, 0, 0), heading: 0, eta: 0, maxEta: 15.8, accel: [0.4, 1.2], helm: false,
      local: new THREE.Vector3(0, 0, 2.6), seat: SEAT, walk: WALK,
      colliders: [
        { x: SEAT[0], z: SEAT[1], r: 0.4 }, { x: 1.25, z: SEAT[1] + 0.15, r: 0.4 }, { x: 0, z: 0.9, r: 0.5 },
        { x: 1.5, z: -1.6, r: 0.4 }, { x: -1.6, z: -2.6, r: 0.4 }, { x: -1.6, z: -1.7, r: 0.4 }, { x: -1.6, z: -0.8, r: 0.4 },
        { x: 0, z: 5.2, r: 0.45 }, { x: 1.7, z: 2.6, r: 0.15 }, { x: -1.45, z: 3.9, r: 0.3 },
      ],
    };
    const universe = () => ship.pos.clone().add(base);
    const fromHome = () => universe().distanceTo(HOME);
    const toBuoy = () => universe().distanceTo(BUOY);

    let reachedBuoy = false, home = false, leftAt = null, cardsIn = 0, approaching = false;
    // Where Pip is flying us: the buoy, then home.
    const target = () => (!reachedBuoy ? STOP_OUT : !home ? HOME : null);
    const toTarget = () => { const t = target(); return t ? t.clone().sub(universe()) : null; };
    const forward = () => v3(-Math.sin(ship.heading), 0, -Math.cos(ship.heading));
    const ahead = (to) => !!to && forward().dot(to) > 0;
    // The fastest we can go and still stop in r metres, braking at 1.4 a second
    // in rapidity: the glide path Pip follows on the way in.
    const glide = (r) => 2 * Math.asinh(Math.sqrt((1.4 * r) / (2 * C)));
    const bearingError = (to) => {
      const want = Math.atan2(-to.x, -to.z);
      return ((((want - ship.heading + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    };
    // Pip holds the throttle until we're pointing the right way.
    ship.canThrust = () => { const to = toTarget(); return !to || Math.abs(bearingError(to)) < 0.3; };

    const goals = [
      { text: "Walk to the front seat, take the helm (E) and press W: Pip points us at Proxima Centauri", done: false },
      { text: "Pass 99.99% of light speed and look up through the dome: the stars crowd ahead", done: false },
      { text: "Leave the helm (E) at full speed and walk to the back bubble: aboard, nothing is strange", done: false },
      { text: "Arrive at the Far Buoy by Proxima b, 4.24 light-years from home", done: false },
      { text: "Fly home (W) and watch years of cards from the crew pour in", done: false },
      { text: "Back home, find the greenhouse tree and the whales: years have passed here", done: false },
    ];
    const milestones = [
      [() => player.beta > 0.5, () => "Pip: Half the speed of light already! And it hardly shows yet."],
      [() => player.gamma > 1000, () => `Pip: Our clock now runs a thousand times slower than Earth's. Each of our seconds is ${humanTime(player.gamma)} at home.`],
      [() => ship.eta >= ship.maxEta - 0.01, () => `Pip: Full speed! Each of our seconds is ${humanTime(player.gamma)} back home. See that tiny bright dot dead ahead? That's every star in the sky, squeezed together.`],
    ];
    let milestone = 0;
    let note = "Pip: Welcome aboard the Pacer! Out here light goes at its real speed, about a billion km/h, so to see anything strange we'll have to go very fast. Walk up to the front seat and press E.";

    return {
      group,
      ship,
      fixedC: true,
      noMap: true,
      spawn: [0, 2.6, 0],
      far: 2e6,
      env: {
        night: 1, space: 1, sunDisk: 0, sun: BODIES.sun.at.toArray(), sunColor: BODIES.sun.color, sky: [0.06, 0.055, 0.1], ground: [0, 0, 0],
        fog: "#000000", fogRange: [1e7, 2e7], skyTop: "#000000", skyHorizon: "#000000",
      },
      post: { bloom: { strength: 0.6, radius: 0.45, threshold: 0.7 } },
      goals,
      tips: [
        "Light here moves at its real speed, 1.08 billion km/h. To see anything strange, you have to go very, very fast.",
        "At the helm, W sets off: Pip points the ship at where we're going. Shift pushes harder, S slows down, and Pip brakes on the way in so we stop right at the buoy, or home.",
        "At full speed one second for you is about 42 days at home, so 4.24 light-years takes under a minute of your time.",
        "On the way out, hardly any news from home catches up with you. On the way back you fly into eight years of it at once.",
      ],
      get note() { return note; },
      nav: { fromHome, toBuoy, cards: () => cardsIn },
      readouts() {
        return [
          ["from Earth", dist(fromHome())],
          ["to Proxima", dist(toBuoy())],
          ["ship clock", formatTime(player.tau, " s")],
          ["Earth, as you see it", dateAt(retardedTime(player.eye, local(HOME)))],
          ["Earth, right now", dateAt(world.t)],
          ["light speed", kmh(world.c)],
        ];
      },
      action() {
        const d = Math.hypot(ship.local.x - SEAT[0], ship.local.z - SEAT[1]);
        if (ship.helm) {
          return {
            label: "Get up from the helm",
            run: () => {
              ship.helm = false;
              ship.local.set(SEAT[0], 0, SEAT[1] + 1.1);
              sfx.alight();
            },
          };
        }
        if (d < 1.6) {
          return {
            label: "Take the helm",
            run: () => {
              ship.helm = true;
              player.yaw = ship.heading;
              player.pitch = 0;
              sfx.board();
              if (!goals[0].done) toast("W to set off (Pip points us the right way), Shift to push harder, S to slow down. E to get up and walk around: the ship keeps going.", 9);
            },
          };
        }
        return null;
      },
      // Moves everything back under you in whole kilometres, so numbers stay small.
      rebase(p) {
        const sx = Math.abs(ship.pos.x) > 1500 ? -Math.round(ship.pos.x / 1000) * 1000 : 0;
        const sz = Math.abs(ship.pos.z) > 1500 ? -Math.round(ship.pos.z / 1000) * 1000 : 0;
        if (!sx && !sz) return 0;
        ship.pos.x += sx; ship.pos.z += sz;
        p.pos.x += sx; p.pos.z += sz;
        base.x -= sx; base.z -= sz;
        return { x: sx, z: sz };
      },
      update({ eye, camera, dTau }) {
        // Keep the ship on course toward wherever we're going, and come to
        // rest once we're there.
        const to = toTarget();
        if (to && (ship.throttle || ship.eta > 0.01)) {
          const turn = THREE.MathUtils.clamp(bearingError(to), -1.2 * dTau, 1.2 * dTau);
          ship.heading += turn;
          player.yaw += turn;
        }
        // On the way in, Pip brakes along the glide path, and settles us exactly
        // on the spot (at these speeds even the last moment covers kilometres).
        if (to && ship.eta > 0 && !ship.throttle) {
          const r = to.length();
          if (ahead(to) && ship.eta > glide(r)) {
            if (!approaching) note = reachedBuoy ? "Pip: Home dead ahead. Braking!" : "Pip: Proxima dead ahead. Braking!";
            approaching = true;
            ship.eta = glide(r);
          }
          if (approaching && (!ahead(to) || C * Math.sinh(ship.eta) * dTau >= r)) {
            ship.pos.copy(local(target()));
            ship.eta = 0;
          }
        }
        const u = universe();

        cabin.group.position.copy(ship.pos);
        cabin.group.rotation.y = ship.heading;
        cabin.update({ t: player.tau, dt: dTau, ship, player, progress: -u.z / D, seen: `HOME SEEN ${dateAt(retardedTime(eye, local(HOME)))}` });

        // Everything out there, drawn where its light says it is.
        place(station.group, local(HOME), eye);
        place(buoy.group, local(BUOY), eye);
        backdrop.position.copy(eye);
        // Faint clouds of gas behind us would be blown up across the whole view
        // at speed: let them fade, as the real redshift would.
        const fade = THREE.MathUtils.clamp(1 - Math.log10(player.gamma) / 2, 0, 1);
        for (const n of nebulae) n.material.uniforms.uSpec.value.z = fade;
        backdrop.visible = fade > 0;
        let brightest = bodies[0], flux = 0;
        for (const b of bodies) {
          const d = place(b.mesh, local(b.at), eye, b.r);
          const ang = b.r / d;
          if (b.glow) {
            const size = b.halo ? Math.max(b.halo * ang, b.dot) : ang < b.dot && d < (b.dotMax ?? Infinity) ? b.dot : 0;
            b.glow.visible = size > 0;
            b.glow.position.copy(b.mesh.position);
            b.glow.quaternion.copy(camera.quaternion);
            b.glow.scale.setScalar(size * squeeze(d));
          }
          if (b.light && b.light / (d * d) > flux) { flux = b.light / (d * d); brightest = b; }
        }
        // Lit by whichever star is brightest from here.
        shared.uSun.value.copy(local(brightest.at)).sub(eye).normalize();
        shared.uSunColor.value.setRGB(...brightest.color);

        const seen = (v) => retardedTime(eye, local(v));
        const ts = seen(STATION);
        station.clock.show(ts);
        station.ring.rotation.z = ts * 0.04;
        station.beacon.uniforms.uSpec.value.z = (((ts % 1.5) + 1.5) % 1.5) < 0.2 ? 1 : 0.15;
        station.dockMats.forEach((m, i) => (m.uniforms.uSpec.value.z = ((Math.floor(ts * 4) % 3) + 3) % 3 === i ? 1 : 0.15));
        for (const s of station.shuttles) {
          const a = s.phase + ts * s.w;
          s.s.position.set(STATION.x + Math.cos(a) * s.r, STATION.y + Math.sin(a) * s.r * Math.sin(s.tilt), STATION.z + Math.sin(a) * s.r * Math.cos(s.tilt));
          s.s.rotation.set(0, -a, 0);
        }
        const tt = seen(station.treeAt);
        const grow = THREE.MathUtils.smoothstep(tt, 0, 6 * YEAR);
        station.tree.scale.setScalar(0.3 + 0.95 * grow);
        station.blossoms.visible = tt > YEAR;
        for (const { j, at, tilt, phase } of jellies) {
          const tj = seen(at);
          const p = Math.sin((tj + phase) * 1.3);
          j.scale.set(1 + 0.12 * p, 1 - 0.14 * p, 1 + 0.12 * p);
          j.position.y = at.y + Math.sin((tj + phase) * 0.3) * 6;
          // From the second year on, they wave.
          j.rotation.z = tilt + (tj > 2 * YEAR ? Math.sin((tj + phase) * 2.2) * 0.45 : 0);
        }
        {
          const tw = seen(WHALE_AT), a = tw * 0.012;
          whale.position.set(WHALE_AT.x + Math.cos(a) * 160, WHALE_AT.y + Math.sin(tw * 0.2) * 6, WHALE_AT.z + Math.sin(a) * 160);
          whale.rotation.y = -a + Math.PI;
          whale.tail.rotation.x = Math.sin(tw * 0.9) * 0.3;
          // From the third year, a calf swims alongside.
          calf.visible = tw > 3 * YEAR;
          const b = a - 0.25;
          calf.position.set(WHALE_AT.x + Math.cos(b) * 130, WHALE_AT.y - 18 + Math.sin(tw * 0.3) * 4, WHALE_AT.z + Math.sin(b) * 130);
          calf.rotation.y = -b + Math.PI;
          calf.tail.rotation.x = Math.sin(tw * 1.4) * 0.35;
        }
        const tb = seen(BUOY);
        buoy.beams.rotation.y = tb * 0.6;
        buoy.crystal.uniforms.uSpec.value.z = 0.6 + 0.4 * Math.sin(tb * 2);

        // A card from home every Earth year: it reaches us when its light does.
        if (leftAt) {
          const k = cardsIn + 1, sent = leftAt.t + k * YEAR;
          if (k <= CARDS.length && fromHome() <= C * (world.t - sent)) {
            cardsIn = k;
            note = `Card from home, sent ${dateAt(sent)}: ${CARDS[k - 1]}`;
            sfx.goal();
          }
        }

        // Goals and Pip's remarks.
        if (!goals[0].done && fromHome() > 1000) {
          goals[0].done = true;
          leftAt = { tau: player.tau, t: world.t };
          note = "Pip: We're off! Earth's clock and ours agree, for now. Let's see how long that lasts.";
        }
        while (milestone < milestones.length && milestones[milestone][0]()) note = milestones[milestone++][1]();
        if (!goals[1].done && player.omb < 1e-4) {
          goals[1].done = true;
          note = "Pip: Look up through the dome! The stars have crowded together ahead of us, and behind us it's gone dark.";
        }
        if (!goals[2].done && !ship.helm && player.gamma > 1000 && ship.local.z > 4.0) {
          goals[2].done = true;
          note = "Pip: Hundreds of millions of km every second, and the jelly hasn't noticed. In here nothing is strange: only the view gives it away.";
        }
        if (!reachedBuoy && u.distanceTo(STOP_OUT) < 2000 && ship.eta < 1e-3) {
          reachedBuoy = goals[3].done = true;
          approaching = false;
          note = `Pip: Proxima Centauri! ${humanTime(player.tau - leftAt.tau)} on our clock, ${humanTime(world.t - leftAt.t)} back home. Earth's light here is 4 years old, so we see it as it was just after we left. Press W to go home.`;
          sfx.ui();
        }
        if (reachedBuoy && !home && u.distanceTo(HOME) < 2000 && ship.eta < 1e-3) {
          home = goals[4].done = true;
          const away = world.t - leftAt.t, mine = player.tau - leftAt.tau;
          note = `Pip: Home! The station says we were gone ${humanTime(away)}. Our clock says ${humanTime(mine)}. The crew are ${humanTime(away - mine)} older than when we left, and we're not.`;
          sfx.ui();
        }
        if (home && !goals[5].done && grow > 0.85) goals[5].done = true;
      },
    };
  },
};
