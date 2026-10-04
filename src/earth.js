import * as THREE from "three";
import { box, followDisc, G, mesh, rng } from "./geo.js";
import { mat, sparkField } from "./shaders.js";
import { retardedTime, world } from "./relativity.js";
import { sfx } from "./audio.js";

export const SOUND_SPEED = 343; // m/s: here, sound easily outruns light

// Uniforms for something spinning about an axis. Gondolas pass a pivot so
// they orbit without turning.
export function rotor(center, axis, omega) {
  return {
    uRotCenter: { value: new THREE.Vector3(...center) },
    uRotAxis: { value: new THREE.Vector3(...axis).normalize() },
    uOmega: { value: omega },
    uPivot: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}

export function orbiting(r, pivot) {
  return { ...r, uPivot: { value: new THREE.Vector4(...pivot, 1) } };
}

// A ground or sea that follows the player. Drawn after solid things without
// writing depth, so reflections (mirrored lights below it) can show on top.
export function surface(opts, { y = 0, radius = 1200, reflective = false } = {}) {
  const m = followDisc(radius, mat({ ...opts, depthWrite: reflective ? false : null }));
  m.position.y = y;
  m.followY = y;
  if (reflective) m.renderOrder = 1;
  return m;
}

// Mirror the glowing parts of `obj` in a horizontal plane at y0. A reflection
// is just light taking a longer path, the same length as the straight path
// from a mirrored copy, so drawing the copy gets light delay right too.
export function reflection(obj, y0 = 0, strength = 0.45) {
  const out = new THREE.Group();
  const flip = new THREE.Matrix4().makeTranslation(0, 2 * y0, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1));
  const rotors = new Map();
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || !m.material.userData?.opts) return;
    const o = m.material.userData.opts;
    if ((o.emissive ?? 0) < 0.5 && !o.reflect) return;
    let r = null;
    if (o.rotor) {
      if (!rotors.has(o.rotor.uRotCenter)) {
        const c = o.rotor.uRotCenter.value, a = o.rotor.uRotAxis.value;
        rotors.set(o.rotor.uRotCenter, {
          uRotCenter: { value: new THREE.Vector3(c.x, 2 * y0 - c.y, c.z) },
          uRotAxis: { value: new THREE.Vector3(a.x, -a.y, a.z) },
          uOmega: { value: -o.rotor.uOmega.value },
        });
      }
      const p = o.rotor.uPivot.value;
      r = { ...rotors.get(o.rotor.uRotCenter), uPivot: { value: new THREE.Vector4(p.x, 2 * y0 - p.y, p.z, p.w) } };
    }
    const copy = new THREE.Mesh(m.geometry, mat({ ...o, rotor: r, additive: true, opacity: strength, unique: true, doubleSided: true }));
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(flip).multiply(m.matrixWorld);
    copy.frustumCulled = false;
    copy.renderOrder = 2;
    out.add(copy);
  });
  return out;
}

export function lampPost(x, z, { h = 4, color = "#ffcf8a", pole = "#2a2622" } = {}) {
  const g = new THREE.Group();
  g.add(box(0.12, h, 0.12, { color: pole, ir: 0.2 }, [x, h / 2, z]));
  g.add(mesh(G.sphere, mat({ color, emissive: 1, ir: 1.2, uv: 0.2 }), { pos: [x, h + 0.2, z], scale: 0.28 }));
  return g;
}

// Bulbs hanging in a sagging line between two points.
export function stringLights(a, b, { n = 14, sag = 0.8, colors = ["#ffd38a", "#ff8a6b", "#9fe0ff", "#ffe9b0"], size = 0.08 } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(...a), new THREE.Vector3(...b), k);
    p.y -= sag * 4 * k * (1 - k);
    g.add(mesh(G.ball, mat({ color: colors[i % colors.length], emissive: 1, ir: 1, uv: 0.3 }), { pos: [p.x, p.y, p.z], scale: size }));
  }
  return g;
}

export function building(x, z, w, d, h, { color = "#2a2d36", lit = 0.45, window = "#ffcf8a", seed = 1, cell = [2.2, 3] } = {}) {
  return box(w, h, d, { color, ir: 0.2, uv: 0.05, windows: { size: cell, lit, color: window, seed } }, [x, h / 2, z]);
}

// Neon tubes spelling a word, from a small stroke font on a 2×4 grid.
const STROKES = {
  A: [[0, 0, 0, 3], [0, 3, 1, 4], [1, 4, 2, 3], [2, 3, 2, 0], [0, 2, 2, 2]],
  B: [[0, 0, 0, 4], [0, 4, 1.5, 4], [1.5, 4, 2, 3.4], [2, 3.4, 1.5, 2], [0, 2, 1.5, 2], [1.5, 2, 2, 1.2], [2, 1.2, 2, 0.6], [2, 0.6, 1.4, 0], [1.4, 0, 0, 0]],
  C: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0]],
  E: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0], [0, 2, 1.5, 2]],
  F: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 2, 1.5, 2]],
  H: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 2, 2, 2]],
  I: [[1, 0, 1, 4], [0.4, 0, 1.6, 0], [0.4, 4, 1.6, 4]],
  L: [[0, 4, 0, 0], [0, 0, 2, 0]],
  M: [[0, 0, 0, 4], [0, 4, 1, 2.4], [1, 2.4, 2, 4], [2, 4, 2, 0]],
  N: [[0, 0, 0, 4], [0, 4, 2, 0], [2, 0, 2, 4]],
  O: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0]],
  P: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2]],
  R: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0.8, 2, 2, 0]],
  S: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  T: [[0, 4, 2, 4], [1, 4, 1, 0]],
  U: [[0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 2, 4]],
  X: [[0, 0, 2, 4], [0, 4, 2, 0]],
  Y: [[0, 4, 1, 2], [2, 4, 1, 2], [1, 2, 1, 0]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  4: [[0, 4, 0, 2], [0, 2, 2, 2], [2, 4, 2, 0]],
};

export function neon(text, { pos = [0, 0, 0], rotY = 0, size = 0.25, color = "#ff4fa3", gap = 0.8 } = {}) {
  const g = new THREE.Group();
  const m = mat({ color, emissive: 1, ir: 0.8, uv: 0.8 });
  let cx = 0;
  for (const ch of text) {
    for (const [x0, y0, x1, y1] of STROKES[ch] ?? []) {
      const a = new THREE.Vector3((cx + x0) * size, y0 * size, 0), b = new THREE.Vector3((cx + x1) * size, y1 * size, 0);
      const seg = mesh(G.box, m, { scale: [0.07, a.distanceTo(b) + 0.07, 0.07] });
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y);
      g.add(seg);
    }
    cx += 2 + gap;
  }
  g.position.set(...pos);
  g.rotation.y = rotY;
  g.updateMatrixWorld(true);
  return g;
}

export function pine(x, z, h = 7, { snow = false } = {}) {
  const g = new THREE.Group();
  g.add(box(0.4, h * 0.3, 0.4, { color: "#3a2a20", ir: 0.3 }, [x, h * 0.15, z]));
  for (let i = 0; i < 3; i++) {
    const r = h * (0.32 - i * 0.08), y = h * (0.3 + i * 0.22);
    g.add(mesh(new THREE.ConeGeometry(1, 1, 10), mat({ color: snow && i === 2 ? "#dfe8f2" : "#1f3b2c", ir: 1.4, uv: 0.05 }), { pos: [x, y + h * 0.15, z], scale: [r, h * 0.38, r] }));
    if (snow) g.add(mesh(new THREE.ConeGeometry(1, 1, 10), mat({ color: "#e9f0f7", ir: 0.6, uv: 0.4 }), { pos: [x, y + h * 0.27, z], scale: [r * 0.7, h * 0.16, r * 0.7] }));
  }
  return g;
}

// A cottage with a pitched roof (snow optional) and lit windows.
export function cottage(x, z, rotY = 0, { w = 6, d = 5, h = 3.4, color = "#6b4a3a", roof = "#2b2f3a", snow = false, seed = 1 } = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, d, { color, ir: 0.5, windows: { size: [1.6, 1.7], lit: 0.7, color: "#ffc070", seed } }, [0, h / 2, 0]));
  const roofGeo = new THREE.CylinderGeometry(0.01, 1, 1, 3, 1);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.rotateY(Math.PI / 2);
  g.add(mesh(roofGeo, mat({ color: snow ? "#e6eef6" : roof, ir: 0.5, uv: snow ? 0.4 : 0.1 }), { pos: [0, h + 1.1, 0], scale: [w + 0.6, 2.2, (d + 0.8) / 1.5], rot: [0, Math.PI / 2, 0] }));
  g.add(box(0.6, 1.6, 0.6, { color: "#4a3a34" }, [w * 0.25, h + 1.6, d * 0.15]));
  g.add(box(1, 1.9, 0.05, { color: "#ffb35a", emissive: 0.8, ir: 1 }, [0, 0.95, d / 2 + 0.03]));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function mountain(x, z, r, h, { snowLine = 0.55 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(r, h, 7, 4), mat({ color: "#2c3546", ir: 0.4, uv: 0.1 }), { pos: [x, h / 2 - 2, z], rot: [0, x * 0.1, 0] }));
  const capH = h * (1 - snowLine);
  g.add(mesh(new THREE.ConeGeometry(r * (1 - snowLine) * 1.02, capH, 7, 2), mat({ color: "#e3ebf5", ir: 0.6, uv: 0.5 }), { pos: [x, h - capH / 2 - 2 + 0.05, z], rot: [0, x * 0.1, 0] }));
  return g;
}

const FIREWORK_COLORS = ["#ff5a7a", "#ffd166", "#7bdcff", "#b98cff", "#7dffb0", "#ffffff", "#ff9f40"];

// Fireworks: rockets climb, burst into sparks with gravity, flash on nearby
// surfaces, and bang. The bang reaches you at the speed of sound, long before
// the light does.
export class Fireworks {
  constructor(group, flashes, { capacity = 4000, seed = 3 } = {}) {
    this.sparks = sparkField(capacity, { gravity: 1.6, intensity: 5 });
    this.trails = sparkField(800, { intensity: 3 });
    group.add(this.sparks, this.trails);
    this.flashes = flashes;
    this.rand = rng(seed);
    this.bangs = []; // { at (world pos), t (burst time), heard }
    this.bursts = []; // for logging and goals
  }

  // Launch from `from` to burst at `at` (world time tBurst).
  shell(from, at, tBurst, { color, count = 220, speed = null } = {}) {
    const rand = this.rand;
    const c = world.c;
    const rise = new THREE.Vector3().subVectors(at, from);
    const climbSpeed = 0.45 * c;
    const climb = rise.length() / climbSpeed;
    const t0 = tBurst - climb;
    const vRise = rise.clone().divideScalar(climb);
    this.trails.set({ origin: from, vel: vRise, birth: t0, life: climb, color: new THREE.Color("#ffd9a0"), size: 0.5 });
    for (let k = 1; k < 8; k++) {
      const p = from.clone().addScaledVector(vRise, (climb * k) / 8);
      this.trails.set({ origin: p, vel: new THREE.Vector3(0, -0.3, 0), birth: t0 + (climb * k) / 8, life: 1.4, color: new THREE.Color("#ff9a50"), size: 0.3 });
    }
    const col = new THREE.Color(color ?? FIREWORK_COLORS[Math.floor(rand() * FIREWORK_COLORS.length)]);
    const v = (speed ?? 0.62) * c;
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (dir.lengthSq() > 1 || dir.lengthSq() < 0.05) { i--; continue; }
      dir.normalize().multiplyScalar(v * (0.85 + 0.15 * rand()));
      this.sparks.set({ origin: at, vel: dir, birth: tBurst, life: 3 + rand() * 1.2, color: i % 5 === 0 ? new THREE.Color("#ffffff") : col, size: 0.55 });
    }
    this.bangs.push({ at: at.clone(), t: tBurst, heard: false, flashed: false, color: col });
  }

  update(eye) {
    const t = world.t;
    for (const b of this.bangs) {
      if (!b.flashed && t >= b.t) {
        b.flashed = true;
        this.flashes?.add(b.at, b.t, "#" + b.color.getHexString());
      }
      // Sound: real-world speed, so it beats the light by a long way.
      if (!b.heard && t >= b.t + b.at.distanceTo(eye) / SOUND_SPEED) {
        b.heard = true;
        sfx.bang(b.at);
      }
    }
    this.bangs = this.bangs.filter((b) => !b.heard || t - b.t < 90);
  }
}

export { box, G, mesh, mat, rng, retardedTime };
