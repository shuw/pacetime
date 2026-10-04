import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Mover } from "./movers.js";
import { mat } from "./shaders.js";
import { mesh, rng } from "./geo.js";

export const CLOTHES = ["#ff6b6b", "#2ec4b6", "#ffbe0b", "#8338ec", "#ff006e", "#3a86ff", "#8ac926", "#fb5607", "#f4f1ea", "#1d3557", "#e76f51", "#06d6a0"];
export const PANTS = ["#3d5a80", "#1d3557", "#2b2d42", "#c2a878", "#f4f1ea", "#6d597a", "#344e41"];
export const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#6b4226"];
export const HAIR = ["#2b1b10", "#6b4423", "#d8b06a", "#111111", "#a0522d", "#cfcfcf", "#e8c27a"];

export function randomLook(rand) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return { shirt: pick(CLOTHES), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR), hat: rand() < 0.25 ? pick(["#f4e3b5", "#ff6b6b", "#1d3557", "#ffbe0b"]) : null };
}

// One person as a single geometry with colors baked in, feet at the origin,
// facing -z. Poses: "stand", "sit" (on a bench at y = 0.45), "ride" (seated,
// arms up), "seated" (arms down).
export function personGeometry(look, { scale = 1, pose = "stand", phase = 0 } = {}) {
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
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 0.85, 1, 10);
  const ball = new THREE.SphereGeometry(1, 12, 9);
  const cap = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const sit = pose !== "stand";
  const hip = sit ? 0.48 : 0.86;
  // Legs
  if (sit) {
    for (const s of [-1, 1]) {
      add(box, look.pants, [s * 0.1, hip, -0.2], [0, 0, 0], [0.14, 0.15, 0.42]);
      add(box, look.pants, [s * 0.1, hip / 2, -0.4], [0, 0, 0], [0.13, hip, 0.14]);
    }
  } else {
    const swing = Math.sin(phase) * 0.3;
    for (const s of [-1, 1]) add(box, look.pants, [s * 0.1, hip / 2, 0], [s * swing, 0, 0], [0.14, hip, 0.16]);
  }
  // Body and arms
  add(cyl, look.shirt, [0, hip + 0.31, 0], [0, 0, 0], [0.21, 0.6, 0.14]);
  const up = pose === "ride";
  for (const s of [-1, 1]) {
    if (up) add(box, look.shirt, [s * 0.27, hip + 0.82, -0.05], [0, 0, s * -0.25], [0.1, 0.56, 0.11]);
    else add(box, look.shirt, [s * 0.27, hip + 0.32, sit ? -0.12 : 0], [sit ? -0.6 : Math.sin(phase) * -0.3 * s, 0, s * 0.08], [0.1, 0.55, 0.11]);
  }
  // Head, hair, maybe a hat
  const head = hip + 0.78;
  add(ball, look.skin, [0, head, 0], [0, 0, 0], [0.12, 0.13, 0.12]);
  add(cap, look.hair, [0, head + 0.02, 0.01], [0, 0, 0], [0.128, 0.13, 0.13]);
  if (look.hat) {
    add(cyl, look.hat, [0, head + 0.12, 0], [0, 0, 0], [0.22, 0.03, 0.22]);
    add(cyl, look.hat, [0, head + 0.17, 0], [0, 0, 0], [0.12, 0.1, 0.12]);
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
      const geo = personGeometry(randomLook(rand), { scale: kid ? 0.6 : 0.92 + rand() * 0.16 });
      const body = mesh(geo, m.mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.2 }), { rot: [0, dir > 0 ? Math.PI : 0, 0] });
      m.group.add(body);
      m.group.userData.dynamic = true;
      group.add(m.group);
      // Keep a clear lane down the middle (where you start) if asked.
      let x = x0 + rand() * (x1 - x0);
      if (Math.abs(x) < avoid) x = Math.sign(x || 1) * (avoid + rand() * 0.6);
      m.dispatch(0, new THREE.Vector3(x, 0, z0 + rand() * (z1 - z0)));
      this.list.push({ m, x, dir, v, kid, stepPhase: rand() * 6 });
    }
  }

  update(t) {
    for (const p of this.list) {
      const z = p.m.at(t).z;
      if (p.dir > 0 && z > this.z1) p.m.dispatch(t, new THREE.Vector3(p.x, 0, this.z0));
      if (p.dir < 0 && z < this.z0) p.m.dispatch(t, new THREE.Vector3(p.x, 0, this.z1));
      // A small bounce with each step.
      p.m.anchor.y = Math.abs(Math.sin(t * p.v * 3.2 + p.stepPhase)) * (p.kid ? 0.12 : 0.05);
    }
  }
}
