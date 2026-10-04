import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Mover } from "./movers.js";
import { mat } from "./shaders.js";
import { mesh, rng } from "./geo.js";

// The pier's regulars are round little creatures: jelly-bean bodies, big
// eyes, stubby feet, and something on top.
export const BODIES = ["#ff6b8b", "#ffb347", "#ffe066", "#7ee081", "#4cc9f0", "#9d8cff", "#ff8fd8", "#5ce1c6", "#ff7f50", "#b4e05a", "#f4a7ff", "#7fb7ff"];
const TOPS = ["sprout", "antenna", "ears", "hat", "bow", "horn", "tuft", "none", "sprout", "ears"];
const EYES = ["round", "round", "round", "sleepy", "wide"];

export function randomLook(rand) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const body = pick(BODIES);
  return {
    body,
    belly: new THREE.Color(body).lerp(new THREE.Color("#ffffff"), 0.55).getStyle(),
    top: pick(TOPS),
    topColor: pick(["#2b2340", "#ff4d6d", "#ffffff", "#3ab26b", "#ffbe0b", "#3a86ff"]),
    eyes: pick(EYES),
    cheeks: rand() < 0.7,
    wide: 0.85 + rand() * 0.35, // some are rounder, some taller
  };
}

// One creature as a single geometry with colors baked in, feet at the origin,
// facing -z. Poses: "stand", "sit" (on a bench at y = 0.45), "ride" (seated,
// arms up), "seated" (arms down).
export function personGeometry(look, { scale = 1, pose = "stand" } = {}) {
  const parts = [];
  const add = (geo, color, pos, rot = [0, 0, 0], s = [1, 1, 1]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s)));
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color"].includes(k)) g.deleteAttribute(k);
    parts.push(g);
  };
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const small = new THREE.SphereGeometry(1, 10, 8);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sit = pose !== "stand";
  const w = look.wide ?? 1;
  const R = 0.36 * w; // body radius
  const H = 0.62 / Math.sqrt(w); // half-height of the body
  const base = sit ? 0.38 : 0.16; // bottom of the body
  const cy = base + H; // body centre
  // Body: a squashy bean, with a paler belly.
  add(ball, look.body, [0, cy, 0], [0, 0, 0], [R, H, R * 0.92]);
  add(ball, look.belly, [0, cy - H * 0.18, -R * 0.42], [0, 0, 0], [R * 0.72, H * 0.62, R * 0.55]);
  // Feet
  if (sit) for (const sx of [-1, 1]) add(small, look.body, [sx * R * 0.45, base + 0.02, -R * 0.75], [0, 0, 0], [0.11, 0.08, 0.16]);
  else for (const sx of [-1, 1]) add(small, look.body, [sx * R * 0.45, 0.07, -0.04], [0, 0, 0], [0.12, 0.08, 0.17]);
  // Arms: little nubs, up when riding.
  for (const sx of [-1, 1]) {
    if (pose === "ride") add(small, look.body, [sx * (R + 0.04), cy + H * 0.75, -0.02], [0, 0, sx * -0.3], [0.08, 0.2, 0.08]);
    else add(small, look.body, [sx * (R + 0.02), cy - H * 0.05, -0.02], [0, 0, sx * 0.35], [0.07, 0.17, 0.08]);
  }
  // Eyes: big whites, dark pupils, a highlight each.
  const ey = cy + H * 0.42, ex = R * 0.36, ez = -R * 0.84;
  const er = look.eyes === "wide" ? 0.12 : 0.1;
  for (const sx of [-1, 1]) {
    add(small, "#ffffff", [sx * ex, ey, ez], [0, 0, 0], [er, look.eyes === "sleepy" ? er * 0.55 : er * 1.1, er * 0.7]);
    if (look.eyes === "sleepy") add(small, look.body, [sx * ex, ey + er * 0.32, ez - 0.01], [0, 0, 0], [er * 1.08, er * 0.42, er * 0.72]);
    add(small, "#1d1b2e", [sx * ex * 0.96, ey - er * 0.08, ez - er * 0.55], [0, 0, 0], [er * 0.55, er * 0.62, er * 0.3]);
    add(small, "#ffffff", [sx * ex * 0.9 + 0.025, ey + er * 0.2, ez - er * 0.72], [0, 0, 0], [er * 0.18, er * 0.18, er * 0.1]);
  }
  // Cheeks and a small smile.
  if (look.cheeks) for (const sx of [-1, 1]) add(small, "#ff8fa3", [sx * ex * 1.55, ey - 0.14, ez + 0.04], [0, 0, 0], [0.06, 0.035, 0.03]);
  add(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), "#1d1b2e", [0, ey - 0.13, ez - 0.02], [0, 0, Math.PI], [1, 1, 1]);
  // Something on top.
  const top = cy + H;
  const tc = look.topColor;
  switch (look.top) {
    case "sprout":
      add(cyl, "#3ab26b", [0, top + 0.1, 0], [0, 0, 0], [0.018, 0.2, 0.018]);
      add(small, "#5fd38d", [0.08, top + 0.21, 0], [0, 0, -0.6], [0.1, 0.045, 0.06]);
      add(small, "#5fd38d", [-0.08, top + 0.21, 0], [0, 0, 0.6], [0.1, 0.045, 0.06]);
      break;
    case "antenna":
      add(cyl, "#2b2340", [0, top + 0.14, 0], [0, 0, 0], [0.012, 0.28, 0.012]);
      add(small, tc === "#2b2340" ? "#ffbe0b" : tc, [0, top + 0.3, 0], [0, 0, 0], [0.06, 0.06, 0.06]);
      break;
    case "ears":
      for (const sx of [-1, 1]) add(small, look.body, [sx * R * 0.5, top + 0.12, 0], [0, 0, sx * -0.25], [0.08, 0.2, 0.06]);
      for (const sx of [-1, 1]) add(small, look.belly, [sx * R * 0.5, top + 0.12, -0.04], [0, 0, sx * -0.25], [0.045, 0.14, 0.03]);
      break;
    case "hat":
      add(cyl, tc, [0, top - 0.01, 0], [0, 0, 0], [0.22, 0.025, 0.22]);
      add(cyl, tc, [0, top + 0.09, 0], [0, 0, 0], [0.13, 0.2, 0.13]);
      add(cyl, "#ff4d6d", [0, top + 0.03, 0], [0, 0, 0], [0.135, 0.04, 0.135]);
      break;
    case "bow":
      for (const sx of [-1, 1]) add(cone, tc === "#2b2340" ? "#ff4d6d" : tc, [sx * 0.09, top + 0.02, 0.05], [0, 0, sx * Math.PI / 2], [0.07, 0.14, 0.05]);
      add(small, tc === "#2b2340" ? "#ff4d6d" : tc, [0, top + 0.02, 0.05], [0, 0, 0], [0.04, 0.04, 0.04]);
      break;
    case "horn":
      add(cone, "#ffe9a8", [0, top + 0.12, -0.04], [-0.2, 0, 0], [0.05, 0.26, 0.05]);
      break;
    case "tuft":
      for (let k = -1; k <= 1; k++) add(cone, look.body, [k * 0.05, top + 0.06, 0], [0, 0, -k * 0.5], [0.04, 0.16, 0.04]);
      break;
    default:
  }
  const g = mergeGeometries(parts, false);
  g.scale(scale, scale, scale);
  return g;
}

// Material for people: colors come from the geometry.
export function personMat(extra = {}) {
  return mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.2, ...extra });
}

export function person(look, { pos = [0, 0, 0], rotY = 0, scale = 1, pose = "stand" } = {}) {
  const m = mesh(personGeometry(look, { scale, pose }), personMat(), { pos, rot: [0, rotY, 0] });
  return m;
}

// People walking up and down a strip, wrapping at the ends. Each is a Mover,
// so you see them where they were; anchors bob a little for footsteps.
export class Strollers {
  constructor(group, { count, x0, x1, z0, z1, speed = [1, 1.6], kids = 0, kidSpeed = [2.6, 3.4], seed = 7, clip = null, avoid = 0 }) {
    const rand = rng(seed);
    this.list = [];
    this.z0 = z0;
    this.z1 = z1;
    for (let i = 0; i < count + kids; i++) {
      const kid = i >= count;
      const dir = rand() < 0.5 ? 1 : -1;
      const v = kid ? kidSpeed[0] + rand() * (kidSpeed[1] - kidSpeed[0]) : speed[0] + rand() * (speed[1] - speed[0]);
      const m = new Mover(new THREE.Vector3(0, 0, dir * v), { clip });
      const geo = personGeometry(randomLook(rand), { scale: kid ? 0.62 : 1 + rand() * 0.25 });
      const body = mesh(geo, m.mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.2 }), { rot: [0, dir > 0 ? Math.PI : 0, 0] });
      m.group.add(body);
      m.group.userData.dynamic = true;
      group.add(m.group);
      // Keep a clear lane down the middle (where you start) if asked.
      let x = x0 + rand() * (x1 - x0);
      if (Math.abs(x) < avoid) x = Math.sign(x || 1) * (avoid + rand() * 0.6);
      m.dispatch(0, new THREE.Vector3(x, 0, z0 + rand() * (z1 - z0)));
      this.list.push({ m, body, x, dir, v, kid, stepPhase: rand() * 6 });
    }
  }

  update(t) {
    for (const p of this.list) {
      const z = p.m.at(t).z;
      if (p.dir > 0 && z > this.z1) p.m.dispatch(t, new THREE.Vector3(p.x, 0, this.z0));
      if (p.dir < 0 && z < this.z0) p.m.dispatch(t, new THREE.Vector3(p.x, 0, this.z1));
      // Bouncy steps: hop up, squash a little on landing.
      const ph = t * p.v * 3.2 + p.stepPhase;
      const hop = Math.abs(Math.sin(ph));
      p.m.anchor.y = hop * (p.kid ? 0.16 : 0.08);
      const squash = 1 + 0.07 * (hop - 0.5) * (p.kid ? 1.6 : 1);
      p.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      p.body.rotation.z = Math.sin(ph) * 0.06;
    }
  }
}
