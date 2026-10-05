import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mat } from "../shaders.js";
import { personGeometry } from "../people.js";
import { clockFace, neon } from "../earth.js";
import { formatBeta, formatTime } from "../format.js";
import { world } from "../relativity.js";

// The Pacer, inside: a capsule with a glass dome over the bridge and a glass
// bubble at the back, built in the ship's own frame (nose toward -z, floor at
// y = 0). Everything aboard is at rest around you, so it's drawn as-is.

export const R = 2.4, CY = 1.0, Z0 = -4, Z1 = 4.5; // hull radius, axis height, where the domes start
export const SEAT = [0, -4.75];
const HW = Math.sqrt(R * R - CY * CY); // half the floor's width
const THETA_FLOOR = Math.acos(CY / R); // where the hull meets the floor, measured round from the bottom
export const WALK = [[-1.35, -5.9, 1.35, Z0], [-1.85, Z0, 1.85, Z1], [-1.35, Z1, 1.35, 5.6]];

const LIGHT = new THREE.Vector3(0.35, 1, 0.3).normalize();
const M = (pos = [0, 0, 0], rot = [0, 0, 0], s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));

// Bake soft shading into vertex colours (lit from above, a little glow from
// below), so flat-lit cabin parts still read as solid and rounded.
function paint(geo, color, m = new THREE.Matrix4(), { inside = false, flat = false, panel = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const n = g.attributes.normal, p = g.attributes.position, c = new THREE.Color(color), out = new Float32Array(n.count * 3);
  const s = inside ? -1 : 1;
  // Panel coordinates, in panels: floor plates laid flat, hull panels round the hull.
  const pan = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (panel === "floor") pan.set([x / 0.62, z / 0.62, 1], i * 3);
    else if (panel === "hull") pan.set([(Math.atan2(x, y - CY) * R) / 0.95, z / 1.15, 2], i * 3);
  }
  g.setAttribute("aPanel", new THREE.BufferAttribute(pan, 3));
  for (let i = 0; i < n.count; i++) {
    const d = s * (n.getX(i) * LIGHT.x + n.getY(i) * LIGHT.y + n.getZ(i) * LIGHT.z);
    let k = flat ? 1 : 0.6 + 0.4 * Math.max(0, d) + 0.1 * Math.max(0, -s * n.getY(i));
    if (inside) k *= 0.75 + 0.12 * p.getY(i);
    out.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(out, 3));
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "color", "aPanel"].includes(name)) g.deleteAttribute(name);
  return g;
}

// A distance for the panel: light-years far out, kilometres nearer in.
function distance(m) {
  const LY = 9.4607e15;
  if (m >= 0.01 * LY) return `${(m / LY).toFixed(m < LY ? 3 : 2)} LY`;
  if (m >= 1e12) return `${(m / 1e12).toLocaleString("en-US", { maximumFractionDigits: m < 1e13 ? 1 : 0 })} BILLION KM`;
  if (m >= 1e9) return `${(m / 1e9).toLocaleString("en-US", { maximumFractionDigits: m < 1e10 ? 1 : 0 })} MILLION KM`;
  if (m >= 1e4) return `${Math.round(m / 1e3).toLocaleString("en-US")} KM`;
  return `${Math.round(m)} M`;
}

const BOX = new THREE.BoxGeometry(1, 1, 1), BALL = new THREE.SphereGeometry(1, 24, 16), CYL = new THREE.CylinderGeometry(1, 1, 1, 24);

// A panel of glowing text, redrawn from a canvas when the numbers change.
function holoPanel(w, h, px = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = Math.round((px * h) / w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const ctx = canvas.getContext("2d");
  m.draw = (fn) => { ctx.clearRect(0, 0, canvas.width, canvas.height); fn(ctx, canvas.width, canvas.height); tex.needsUpdate = true; };
  return m;
}
const holo = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });


// A whimsical jellyfish: a soft glowing bell with trailing tentacles.
export function jellyGeometry(r, color) {
  const c = new THREE.Color(color);
  const bell = new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.CylinderGeometry(r * 0.03, r * 0.012, r * (1.3 + (i % 3) * 0.4), 5, 6);
    t.translate(0, -r * (0.65 + (i % 3) * 0.2), 0);
    // A gentle wave down its length.
    const p = t.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + Math.sin(p.getY(k) / r * 4 + i) * r * 0.08);
    t.translate(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6);
    tentacles.push(t.toNonIndexed());
  }
  const tg = mergeGeometries(tentacles.map((g) => { for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal") g.deleteAttribute(n); return g; }), false);
  return { bell, tentacles: tg, color: c };
}

export function buildCabin() {
  const ship = new THREE.Group();
  ship.userData.dynamic = true;
  const solid = new Map(), glow = []; // solid parts, grouped by surface
  const S = (geo, color, m, o = {}) => {
    const k = o.surface ?? "paint";
    if (!solid.has(k)) solid.set(k, []);
    solid.get(k).push(paint(geo, color, m, o));
  };
  const Gl = (geo, color, m) => glow.push(paint(geo, color, m, { flat: true }));
  const WALL = "#40407a", SPINE = "#26264e", FLOOR = "#16142e", WHITE = "#b9bdd6", CUSHION = "#e0804a";

  // The floor: a long stadium shape, rounded at both domes.
  {
    const s = new THREE.Shape();
    s.moveTo(-HW, -Z0);
    s.lineTo(-HW, -Z1);
    s.absarc(0, -Z1, HW, Math.PI, 2 * Math.PI, false);
    s.lineTo(HW, -Z0);
    s.absarc(0, -Z0, HW, 0, Math.PI, false);
    const g = new THREE.ShapeGeometry(s, 32);
    g.rotateX(-Math.PI / 2);
    S(g, FLOOR, M([0, 0.001, 0]), { panel: "floor", surface: "metal" });
    // Glowing lines: one down the middle, two along the walls.
    Gl(BOX, "#3d9ab8", M([0, 0.006, 0.3], [0, 0, 0], [0.03, 0.01, Z1 - Z0 + 3.8]));
    for (const sx of [-1, 1]) Gl(BOX, "#5a4ea8", M([sx * 1.95, 0.006, 0.25], [0, 0, 0], [0.02, 0.01, Z1 - Z0]));
    // Rings on the floor under the pilot's seat and the route table.
    for (const [z, r] of [[SEAT[1], 0.75], [0.9, 0.85]]) Gl(new THREE.TorusGeometry(r, 0.015, 4, 48), "#3d9ab8", M([0, 0.008, z], [Math.PI / 2, 0, 0]));
  }
  // The hull: lower walls and a ceiling spine, with long windows between.
  const band = (t0, t1, color, z0 = Z0, z1 = Z1) => {
    const g = new THREE.CylinderGeometry(R, R, z1 - z0, 48, 1, true, t0, t1 - t0);
    g.rotateX(Math.PI / 2);
    S(g, color, M([0, CY, (z0 + z1) / 2]), { inside: true, panel: "hull" });
  };
  const W0 = 1.55, W1 = 2.75, TAU = Math.PI * 2;
  band(THETA_FLOOR, W0, WALL);
  band(TAU - W0, TAU - THETA_FLOOR, WALL);
  band(W1, TAU - W1, SPINE);
  // Light panels along the spine.
  for (let z = -3.2; z <= 4; z += 1.8) Gl(BOX, "#8aa2c8", M([0, CY + R - 0.08, z], [0, 0, 0], [0.6, 0.02, 0.7]));
  // Glowing ribs round the hull, cyan and pink by turns: framing the domes and
  // a couple along the cabin.
  const arc = TAU - 2 * THETA_FLOOR;
  [Z0, -0.75, 2.25, Z1].forEach((z, i) => {
    Gl(new THREE.TorusGeometry(R - 0.03, 0.022, 6, 64, arc), i % 2 ? "#b8509a" : "#3aa6c4", M([0, CY, z], [0, 0, THETA_FLOOR - Math.PI / 2]));
  });

  // The bridge: an egg chair for the pilot, one for the co-pilot, and a
  // curved desk of glowing controls.
  for (const [x, z] of [SEAT, [1.25, SEAT[1] + 0.15]]) {
    S(CYL, "#3b3f66", M([x, 0.22, z], [0, 0, 0], [0.12, 0.44, 0.12]), { surface: "metal" });
    S(new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0.9, 1.9), WHITE, M([x, 0.85, z + 0.05], [-Math.PI / 2 - 0.25, 0, 0], [1, 1, 0.75]));
    S(CYL, CUSHION, M([x, 0.5, z], [0, 0, 0], [0.38, 0.1, 0.38]), { surface: "fabric" });
  }
  [-0.55, 0, 0.55].forEach((a) => {
    const x = SEAT[0] + Math.sin(a) * 1.05, z = SEAT[1] - Math.cos(a) * 1.05;
    S(BOX, "#33366a", M([x, 0.42, z], [0, -a, 0], [0.62, 0.84, 0.36]), { surface: "metal" });
    S(BOX, "#45498a", M([x, 0.86, z + Math.cos(a) * 0.02], [-0.3, -a, 0], [0.62, 0.04, 0.4]));
    Gl(BOX, "#2f8aa6", M([x, 0.885, z], [-0.3, -a, 0], [0.5, 0.01, 0.22]));
  });
  // Buttons, because every ship needs buttons.
  const buttons = ["#ff5a4a", "#ffd166", "#7dffb0", "#5fe1ff", "#ff8fd8"];
  for (let i = 0; i < 10; i++) {
    const a = -0.75 + i * 0.165;
    Gl(BALL, buttons[i % 5], M([Math.sin(a) * 1.2, 0.9, SEAT[1] - Math.cos(a) * 1.2], [0, 0, 0], 0.03));
  }
  // The lounge: a sofa with cushions on the left.
  S(BOX, "#3b3f66", M([-1.55, 0.22, -1.7], [0, 0, 0], [0.75, 0.44, 2.4]), { surface: "metal" });
  S(BOX, WHITE, M([-1.6, 0.5, -1.7], [0, 0, 0], [0.7, 0.14, 2.3]), { surface: "fabric" });
  S(BOX, WHITE, M([-1.88, 0.85, -1.7], [0, 0, -0.18], [0.16, 0.6, 2.3]), { surface: "fabric" });
  ["#ff8fd8", "#5ce1c6", "#ffd166"].forEach((c, i) => S(new THREE.SphereGeometry(0.22, 16, 10), c, M([-1.7, 0.7, -2.5 + i * 0.75], [0, 0.4 * i, 0.3], [0.9, 0.7, 0.4]), { surface: "fabric" }));
  // The aquarium on the right, the route table in the middle.
  S(CYL, "#ffb36b", M([1.5, 0.15, -1.6], [0, 0, 0], [0.42, 0.3, 0.42]));
  S(CYL, "#ffb36b", M([1.5, 1.68, -1.6], [0, 0, 0], [0.42, 0.06, 0.42]));
  S(CYL, "#3b3f66", M([0, 0.42, 0.9], [0, 0, 0], [0.32, 0.84, 0.32]), { surface: "metal" });
  S(CYL, "#45498a", M([0, 0.86, 0.9], [0, 0, 0], [0.6, 0.05, 0.6]));
  Gl(new THREE.TorusGeometry(0.6, 0.025, 6, 48), "#5fe1ff", M([0, 0.89, 0.9], [Math.PI / 2, 0, 0]));
  // A bench in the rear bubble, facing back.
  S(BOX, WHITE, M([0, 0.45, 5.2], [0, 0, 0], [1.6, 0.14, 0.55]), { surface: "fabric" });
  S(BOX, "#3b3f66", M([0, 0.2, 5.2], [0, 0, 0], [1.4, 0.4, 0.45]), { surface: "metal" });
  // A light clock on the right wall: two mirrors and a tube between.
  for (const y of [0.45, 2.35]) S(CYL, "#c9d6ff", M([1.7, y, 2.6], [0, 0, 0], [0.16, 0.04, 0.16]), { surface: "metal" });
  // A pot of glowing alien flowers at the back.
  S(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 16), "#ff8f5c", M([-1.45, 0.22, 3.9]), { surface: "plaster" });
  S(new THREE.SphereGeometry(0.3, 12, 8), "#3f9a5a", M([-1.45, 0.5, 3.9], [0, 0, 0], [1, 0.5, 1]), { surface: "grass" });
  // Outside: swept fins you can see from the side windows, and engines aft.
  {
    // A swept wing: wide at the hull, raked back to a narrow tip.
    const wing = new THREE.Shape([new THREE.Vector2(0, -1.4), new THREE.Vector2(2.2, 0.6), new THREE.Vector2(2.2, 1.3), new THREE.Vector2(0, 1.5)]);
    const geo = new THREE.ExtrudeGeometry(wing, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    geo.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) {
      S(geo, WHITE, M([sx * 2.15, 0.15, 3.2], [0, 0, sx * 0.12], [sx, 1, 1]));
      Gl(BOX, "#ff6fd8", M([sx * 4.33, 0.42, 4.15], [0, 0, sx * 0.12], [0.06, 0.08, 0.7]));
    }
  }
  for (const sx of [-1, 1]) {
    S(new THREE.CylinderGeometry(0.45, 0.55, 2.4, 20), "#d8dcef", M([sx * 2.35, 0.55, 5.0], [Math.PI / 2, 0, 0]), { surface: "metal" });
    Gl(new THREE.TorusGeometry(0.5, 0.05, 6, 32), "#5fe1ff", M([sx * 2.35, 0.55, 6.2]));
  }
  // A slim prow in front of the dome, with a glowing keel line.
  {
    const prow = new THREE.ConeGeometry(1.4, 4, 4, 1);
    prow.rotateX(-Math.PI / 2);
    prow.rotateZ(Math.PI / 4);
    S(prow, "#d8dcef", M([0, -0.15, Z0 - HW - 1.6], [0, 0, 0], [1, 0.25, 1]));
    Gl(BOX, "#ff8f5c", M([0, 0.07, Z0 - HW - 1.6], [0, 0, 0], [0.06, 0.03, 3.6]));
  }

  const add = (m, order = 2) => { m.layers.set(2); m.renderOrder = order; ship.add(m); return m; };
  // Lit by the cabin's own lamps: the ceiling panels, the glowing desk, the
  // aquarium and the route table.
  const lamps = [-3.2, -1.4, 0.4, 2.2, 4.0].map((z) => [0, CY + R - 0.2, z, 3.2, "#c4d2f4"]);
  lamps.push([SEAT[0], 1.0, SEAT[1] - 0.9, 1.5, "#3fb4d8"], [1.5, 1.0, -1.6, 1.6, "#ff8fd8"], [0, 1.0, 0.9, 1.3, "#5fe1ff"]);
  const eye = { value: new THREE.Vector3(0, 1.6, 0) }; // you, in the cabin's frame
  const finish = { paint: { rough: 0.3 }, metal: { rough: 0.35 }, fabric: {}, plaster: {}, grass: {} };
  for (const [surface, geos] of solid) {
    add(new THREE.Mesh(mergeGeometries(geos, false), mat({ color: "#ffffff", vertexColors: true, unlit: true, comoving: true, doubleSided: true, surface, ...finish[surface], vary: 0.04, interior: { lights: lamps, ambient: "#5c6290", eye } })));
  }
  add(new THREE.Mesh(mergeGeometries(glow, false), mat({ color: "#ffffff", vertexColors: true, emissive: 1, unlit: true, comoving: true })));

  // Glass: the long windows and the two domes.
  // Clear glass: a faint tint that doesn't light up with the stars outside.
  const glass = mat({ color: "#1c2a40", opacity: 0.08, ir: 0, uv: 0, comoving: true, unlit: true, depthWrite: false, doubleSided: true });
  for (const [t0, t1] of [[W0, W1], [TAU - W1, TAU - W0]]) {
    const g = new THREE.CylinderGeometry(R, R, Z1 - Z0, 48, 1, true, t0, t1 - t0);
    g.rotateX(Math.PI / 2);
    add(new THREE.Mesh(g, glass), 7).position.set(0, CY, (Z0 + Z1) / 2);
  }
  for (const [z, dir] of [[Z0, -1], [Z1, 1]]) {
    const g = new THREE.SphereGeometry(R, 48, 24, 0, TAU, 0, Math.PI / 2);
    g.rotateX(dir * Math.PI / 2);
    add(new THREE.Mesh(g, glass), 7).position.set(0, CY, z);
  }
  // Aquarium glass and water.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.36, 32, 1, true), mat({ color: "#7fe8ff", opacity: 0.18, ir: 0.2, uv: 0.4, comoving: true, depthWrite: false, doubleSided: true })), 6).position.set(1.5, 0.98, -1.6);

  // Things that move.
  // The co-pilot, who has seen it all before.
  const pal = add(new THREE.Mesh(personGeometry({ body: "#8338ec", belly: "#e8dcff", top: "antenna", topColor: "#5ce1c6", eyes: "round", cheeks: true, wide: 1 }, { scale: 0.72, pose: "ride" }), mat({ color: "#ffffff", vertexColors: true, unlit: true, comoving: true })), 3);
  pal.position.set(1.25, 0.56, SEAT[1] + 0.12);
  // A space jelly in the aquarium.
  const jg = jellyGeometry(0.16, "#ff8fd8");
  const jelly = new THREE.Group();
  const bell = new THREE.Mesh(jg.bell, mat({ color: "#ff8fd8", emissive: 0.8, unlit: true, comoving: true, opacity: 0.85 }));
  const tent = new THREE.Mesh(jg.tentacles, mat({ color: "#ffd1f0", emissive: 0.6, unlit: true, comoving: true }));
  for (const o of [bell, tent]) { o.layers.set(2); o.renderOrder = 5; jelly.add(o); }
  jelly.position.set(1.5, 1.1, -1.6);
  ship.add(jelly);
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = add(new THREE.Mesh(BALL, mat({ color: "#bff4ff", emissive: 0.6, unlit: true, comoving: true })), 5);
    b.scale.setScalar(0.015 + (i % 3) * 0.008);
    bubbles.push({ m: b, k: i / 6, x: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4 });
  }
  // The light clock's photon.
  const photon = add(new THREE.Mesh(BALL, mat({ color: "#ffe45c", emissive: 1, unlit: true, comoving: true })), 4);
  photon.scale.setScalar(0.05);
  const tubeMat = mat({ color: "#fff6c8", opacity: 0.15, comoving: true, depthWrite: false, doubleSided: true, unique: true });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.86, 12, 1, true), tubeMat), 6).position.set(1.7, 1.4, 2.6);
  const clockLabel = neon("LIGHT CLOCK", { size: 0.055, color: "#ffe45c", width: 0.014, comoving: true });
  clockLabel.rotation.y = -Math.PI / 2;
  clockLabel.position.set(1.62, 2.55, 2.6 - clockLabel.textWidth / 2);
  clockLabel.traverse((o) => o.isMesh && o.layers.set(2));
  ship.add(clockLabel);
  // Ship time, on the left wall.
  const clock = clockFace(0.42, { comoving: true, face: "#1d2136", hands: "#cfd8f0", rim: "#5fe1ff", glow: 0 });
  clock.position.set(-1.78, 1.95, 2.3);
  clock.rotation.y = Math.PI / 2; // facing into the cabin
  clock.traverse((o) => o.isMesh && (o.layers.set(2), (o.renderOrder = 3)));
  ship.add(clock);
  const shipLabel = neon("SHIP TIME", { size: 0.06, color: "#5fe1ff", width: 0.015, comoving: true });
  shipLabel.rotation.y = Math.PI / 2;
  shipLabel.position.set(-1.72, 2.5, 2.3 + shipLabel.textWidth / 2);
  shipLabel.traverse((o) => o.isMesh && o.layers.set(2));
  ship.add(shipLabel);
  // Glowing flowers that sway.
  const flowers = new THREE.Group();
  flowers.position.set(-1.45, 0.5, 3.9);
  ["#ff8fd8", "#ffd166", "#7dffb0", "#5fe1ff", "#c9a0ff"].forEach((c, i) => {
    const a = (i / 5) * Math.PI * 2, h = 0.5 + (i % 3) * 0.18;
    const stem = new THREE.Mesh(CYL, mat({ color: "#3f9a5a", unlit: true, comoving: true }));
    stem.scale.set(0.012, h, 0.012);
    stem.position.set(Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12);
    const bulb = new THREE.Mesh(BALL, mat({ color: c, emissive: 1, unlit: true, comoving: true }));
    bulb.scale.setScalar(0.06);
    bulb.position.set(Math.cos(a) * 0.12, h, Math.sin(a) * 0.12);
    for (const o of [stem, bulb]) { o.layers.set(2); flowers.add(o); }
  });
  ship.add(flowers);
  // Engine plumes, longer and brighter when you're pushing.
  const plumes = [-1, 1].map((sx) => {
    const g = new THREE.ConeGeometry(0.42, 1, 24, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.5);
    const p = add(new THREE.Mesh(g, holo("#8fdcff", 0.55)), 8);
    p.position.set(sx * 2.35, 0.55, 6.25);
    return p;
  });

  // Pip, the ship's robot, who floats along beside you.
  const pip = new THREE.Group();
  const pipParts = [
    [BALL, "#d2d6ea", [0, 0, 0], 0.2, 0],
    [new THREE.SphereGeometry(1, 24, 12, -Math.PI / 2 - 0.9, 1.8, 0.95, 1.0), "#1d2350", [0, 0.01, 0], 0.205, 0],
    [CYL, "#c9d0ea", [0, 0.24, 0], [0.008, 0.12, 0.008], 0],
    [new THREE.TorusGeometry(0.13, 0.02, 6, 24), "#5fe1ff", [0, -0.19, 0], 1, 1],
  ];
  for (const [geo, color, pos, s, e] of pipParts) {
    const o = new THREE.Mesh(geo, mat({ color, emissive: e, unlit: true, comoving: true }));
    o.position.set(...pos);
    if (Array.isArray(s)) o.scale.set(...s); else o.scale.setScalar(s);
    if (geo instanceof THREE.TorusGeometry) o.rotation.x = Math.PI / 2;
    o.layers.set(2);
    o.renderOrder = 4;
    pip.add(o);
  }
  const eyeMat = mat({ color: "#5fe1ff", emissive: 1, unlit: true, comoving: true, unique: true });
  const pipEyes = [-0.06, 0.06].map((x) => {
    const e = new THREE.Mesh(BALL, eyeMat);
    e.scale.set(0.035, 0.045, 0.02);
    e.position.set(x, 0.02, -0.2);
    e.layers.set(2);
    e.renderOrder = 5;
    pip.add(e);
    return e;
  });
  const antennaTip = new THREE.Mesh(BALL, eyeMat);
  antennaTip.scale.setScalar(0.03);
  antennaTip.position.set(0, 0.31, 0);
  antennaTip.layers.set(2);
  pip.add(antennaTip);
  pip.position.set(0.8, 1.6, 0.5);
  ship.add(pip);

  // Holograms: the speed panel over the desk, and the route over the table.
  // Off to the left of the view ahead, turned toward the pilot.
  const speedPanel = add(holoPanel(0.8, 0.42), 9);
  speedPanel.position.set(-0.6, 1.5, SEAT[1] - 1.0);
  speedPanel.rotation.set(-0.2, 0.45, 0);
  const route = new THREE.Group();
  route.position.set(0, 1.25, 0.9);
  // Home at one end, the destination at the other.
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.9), holo("#5fe1ff", 0.9));
  const homeIcon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), holo("#5f9dff", 1));
  homeIcon.position.z = 0.45;
  const buoyIcon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), holo("#ff5a4a", 1));
  buoyIcon.position.z = -0.45;
  const blip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), holo("#ffd166", 1));
  blip.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.52, 64), holo("#5fe1ff", 0.5));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.32;
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.004), holo("#5fe1ff", 0.4));
    tick.position.set(0, -0.32, 0);
    tick.rotation.y = (i / 12) * Math.PI * 2;
    tick.translateX(0.47);
    route.add(tick);
  }
  for (const o of [line, homeIcon, buoyIcon, blip, disc]) route.add(o);
  route.traverse((o) => { o.layers.set(2); o.renderOrder = 9; });
  ship.add(route);

  let drawIn = 0, lastEta = 0;
  const pipEye = new THREE.Color();

  return {
    group: ship, clock, pip,
    // Called every frame with the ship and player state.
    // progress: 0 at home, 1 at the destination. seen: what the panel says about home.
    update({ t, dt, ship: s, player, progress, seen, dest }) {
      ship.updateMatrixWorld();
      eye.value.copy(player.eye);
      ship.worldToLocal(eye.value);
      clock.set(player.tau);
      // Pip drifts to a spot beside you, a little ahead, and looks at you.
      const ly = player.yaw - s.heading;
      const fx = -Math.sin(ly), fz = -Math.cos(ly), rx = Math.cos(ly), rz = -Math.sin(ly);
      // At the helm it keeps out of your view, up by your left shoulder.
      const want = s.helm
        ? new THREE.Vector3(SEAT[0] - 1.15, 1.95 + Math.sin(t * 1.7) * 0.05, SEAT[1] + 0.1)
        : new THREE.Vector3(s.local.x + rx * 0.7 + fx * 0.8, 1.55 + Math.sin(t * 1.7) * 0.07, s.local.z + rz * 0.7 + fz * 0.8);
      want.x = THREE.MathUtils.clamp(want.x, -1.6, 1.6);
      want.z = THREE.MathUtils.clamp(want.z, -5.4, 5.4);
      pip.position.lerp(want, Math.min(1, dt * 1.6));
      const toYou = new THREE.Vector3(s.local.x, 1.6, s.local.z).sub(pip.position);
      pip.rotation.y = Math.atan2(-toYou.x, -toYou.z);
      pip.rotation.z = Math.sin(t * 1.3) * 0.08;
      // Its eyes: cyan at rest, gold past 99%, pink past 99.999%; they blink.
      const nines = -Math.log10(Math.max(player.omb, 1e-15));
      pipEye.set(nines > 5 ? "#ff8fd8" : nines > 2 ? "#ffd166" : "#5fe1ff");
      eyeMat.uniforms.uColor.value.copy(pipEye);
      const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
      for (const e of pipEyes) e.scale.y = 0.045 * blink;
      // The co-pilot bobs along, and turns to look out of the window now and then.
      pal.position.y = 0.56 + Math.abs(Math.sin(t * 2.2)) * 0.02;
      pal.rotation.y = Math.sin(t * 0.3) > 0.7 ? -0.8 : 0;
      // The jelly pulses and drifts, bubbles rise, flowers sway.
      const pulse = Math.sin(t * 2.4);
      jelly.scale.set(1 + 0.12 * pulse, 1 - 0.15 * pulse, 1 + 0.12 * pulse);
      jelly.position.y = 1.1 + Math.sin(t * 0.6) * 0.25;
      jelly.rotation.y += dt * 0.3;
      for (const b of bubbles) {
        b.k = (b.k + dt * 0.25) % 1;
        b.m.position.set(1.5 + b.x * 0.6, 0.35 + b.k * 1.25, -1.6 + b.z * 0.6);
      }
      flowers.rotation.z = Math.sin(t * 0.8) * 0.05;
      flowers.rotation.x = Math.sin(t * 0.6 + 1) * 0.05;
      // The light clock ticks at light speed: up and down two metres.
      // At real light speed it ticks eighty million times a second: a steady glow.
      const c = world.c;
      const h = 1.86, period = (2 * h) / c;
      const blur = period < 0.05;
      photon.visible = !blur;
      tubeMat.uniforms.uOpacity.value = blur ? 0.55 : 0.15;
      const ph = (player.tau % period) / period;
      photon.position.set(1.7, 0.48 + h * (ph < 0.5 ? ph * 2 : 2 - ph * 2) - 0.02, 2.6);
      // Engines: longer and brighter while speeding up.
      const pushing = s.eta > lastEta + 1e-6;
      lastEta = s.eta;
      for (const p of plumes) {
        const target = pushing ? 2.6 + Math.random() * 0.4 : 0.4 + 0.1 * Math.sin(t * 9);
        p.scale.z += (target - p.scale.z) * Math.min(1, dt * 6);
        p.material.opacity = 0.25 + 0.12 * p.scale.z;
      }
      // Holograms.
      route.rotation.y = -s.heading;
      blip.position.set(0, 0.01, 0.45 - 0.9 * THREE.MathUtils.clamp(progress, 0, 1));
      blip.rotation.set(-Math.PI / 2, 0, s.heading);
      homeIcon.rotation.y += dt;
      drawIn -= dt;
      if (drawIn <= 0) {
        drawIn = 0.12;
        speedPanel.draw((x, w, hh) => {
          x.strokeStyle = "rgba(95, 225, 255, 0.85)";
          x.lineWidth = 4;
          x.strokeRect(6, 6, w - 12, hh - 12);
          x.fillStyle = "rgba(95, 225, 255, 0.9)";
          x.font = "500 22px 'JetBrains Mono', monospace";
          x.fillText("SPEED", 26, 46);
          x.textAlign = "right";
          x.fillText(`γ ${player.gamma < 100 ? player.gamma.toFixed(2) : Math.round(player.gamma).toLocaleString("en-US")}`, w - 26, 46);
          x.textAlign = "left";
          // As big as fits: the nines get long.
          const speed = `${formatBeta(player.beta, player.omb)} c`;
          let size = 88;
          x.font = `700 ${size}px 'Big Shoulders Display', sans-serif`;
          const fit = (w - 48) / x.measureText(speed).width;
          if (fit < 1) { size = Math.floor(size * fit); x.font = `700 ${size}px 'Big Shoulders Display', sans-serif`; }
          x.fillStyle = "#7fd8f0";
          x.fillText(speed, 24, 108 + size * 0.36);
          x.font = "500 20px 'JetBrains Mono', monospace";
          // How far to go, by the world's rulers, and squeezed short by ours.
          if (dest) {
            x.fillStyle = "rgba(127, 255, 176, 0.95)";
            x.font = "500 18px 'JetBrains Mono', monospace";
            x.fillText(`${dest.name} ${distance(dest.left)}`, 26, hh - 62);
            if (player.gamma > 1.05) {
              x.textAlign = "right";
              x.fillText(`FOR US ${distance(dest.left / player.gamma)}`, w - 26, hh - 62);
              x.textAlign = "left";
            }
            x.font = "500 20px 'JetBrains Mono', monospace";
          }
          x.fillStyle = "rgba(255, 209, 102, 0.95)";
          x.fillText(`SHIP ${formatTime(player.tau, " s")}`, 26, hh - 26);
          x.textAlign = "right";
          x.fillText(seen, w - 26, hh - 26);
          x.textAlign = "left";
        });
      }
    },
  };
}
