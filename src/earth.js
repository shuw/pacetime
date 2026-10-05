import * as THREE from "three";
import { box, followDisc, G, mesh, rng } from "./geo.js";
import { mat, sparkField } from "./shaders.js";
import { retardedTime, world } from "./relativity.js";
import { sfx } from "./audio.js";
import { motion } from "./motion.js";

export const SOUND_SPEED = 343; // m/s: here, sound easily outruns light

// Uniforms for something spinning about an axis. Gondolas pass a pivot so
// they orbit without turning.
export function rotor(center, axis, omega, rmax) {
  const u = {
    uRotCenter: { value: new THREE.Vector3(...center) },
    uRotAxis: { value: new THREE.Vector3(...axis).normalize() },
    uOmega: { value: omega },
    uPhase: { value: 0 },
    uPivot: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  motion.addRotor(u, omega, rmax);
  return u;
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
  if (reflective) { m.renderOrder = 1; m.layers.set(2); }
  return m;
}

// Mirror the glowing parts of `obj` in a horizontal plane at y0. A reflection
// is just light taking a longer path, the same length as the straight path
// from a mirrored copy, so drawing the copy gets light delay right too.
export function reflection(obj, y0 = 0, strength = 0.45, { stretch = 1 } = {}) {
  const out = new THREE.Group();
  // A wet street smears reflections downward; `stretch` > 1 fakes that.
  const flip = new THREE.Matrix4().makeTranslation(0, y0, 0)
    .multiply(new THREE.Matrix4().makeScale(1, -stretch, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0));
  const rotors = new Map();
  const mats = new Map(); // one mirrored material per source material
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
          uOmega: { get value() { return -o.rotor.uOmega.value; } },
          uPhase: { get value() { return -o.rotor.uPhase.value; } },
        });
      }
      const p = o.rotor.uPivot.value;
      r = { ...rotors.get(o.rotor.uRotCenter), uPivot: { value: new THREE.Vector4(p.x, 2 * y0 - p.y, p.z, p.w) } };
    }
    const key = m.material.uuid + (r ? r.uPivot.value.toArray().join() : "");
    if (!mats.has(key)) {
      const mm = mat({ ...o, rotor: r, additive: true, opacity: strength, unique: true, doubleSided: true });
      // Share the live color and glow, so lamps switching on and off show in the reflection.
      mm.uniforms.uColor = m.material.uniforms.uColor;
      mm.uniforms.uSpec = m.material.uniforms.uSpec;
      mats.set(key, mm);
    }
    const copy = new THREE.Mesh(m.geometry, mats.get(key));
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(flip).multiply(m.matrixWorld);
    copy.frustumCulled = false;
    copy.renderOrder = 2;
    copy.layers.set(2);
    out.add(copy);
  });
  return out;
}

export function lampPost(x, z, { h = 4, color = "#ffcf8a", pole = "#2a2622", range = 6, power = 1, switched = false, fancy = false } = {}) {
  const g = new THREE.Group();
  g.userData.lamp = { pos: new THREE.Vector3(x, h + 0.2, z), color: new THREE.Color(color), range, power, switched };
  g.add(box(0.12, h, 0.12, { color: pole, ir: 0.2 }, [x, h / 2, z]));
  if (fancy) {
    // A Victorian seaside lamp: a fluted base, a crown and a glass globe.
    g.add(mesh(G.cyl, mat({ color: pole, ir: 0.2 }), { pos: [x, 0.35, z], scale: [0.22, 0.7, 0.22] }));
    g.add(mesh(G.cyl, mat({ color: "#c9a24a", ir: 0.5 }), { pos: [x, h - 0.1, z], scale: [0.2, 0.12, 0.2] }));
    g.add(mesh(new THREE.ConeGeometry(1, 1, 12), mat({ color: pole, ir: 0.2 }), { pos: [x, h + 0.62, z], scale: [0.24, 0.28, 0.24] }));
  }
  g.add(mesh(G.sphere, mat({ color, emissive: 1, ir: 1.2, uv: 0.2, switched }), { pos: [x, h + 0.2, z], scale: fancy ? 0.3 : 0.28 }));
  return g;
}

// Bulbs hanging in a sagging line between two points.
export function stringLights(a, b, { n = 14, sag = 0.8, colors = ["#ffd38a", "#ff8a6b", "#9fe0ff", "#ffe9b0"], size = 0.08, switched = false, wire = null } = {}) {
  const g = new THREE.Group();
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(...a), new THREE.Vector3(...b), k);
    p.y -= sag * 4 * k * (1 - k);
    g.add(mesh(G.ball, mat({ color: colors[i % colors.length], emissive: 1, ir: 1, uv: 0.3, switched }), { pos: [p.x, p.y, p.z], scale: size }));
    if (wire && prev) {
      const seg = mesh(G.cyl, mat({ color: wire, ir: 0.2 }), { scale: [0.012, prev.distanceTo(p), 0.012] });
      seg.position.copy(prev).add(p).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize());
      g.add(seg);
    }
    prev = p;
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
  D: [[0, 0, 0, 4], [0, 4, 1.3, 4], [1.3, 4, 2, 3.2], [2, 3.2, 2, 0.8], [2, 0.8, 1.3, 0], [1.3, 0, 0, 0]],
  G: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 2, 1.8], [2, 1.8, 1.1, 1.8]],
  J: [[2, 4, 2, 0], [2, 0, 0, 0], [0, 0, 0, 1.2]],
  K: [[0, 0, 0, 4], [0, 2, 2, 4], [0, 2, 2, 0]],
  Q: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [1.2, 0.8, 2.2, -0.3]],
  V: [[0, 4, 1, 0], [1, 0, 2, 4]],
  W: [[0, 4, 0.5, 0], [0.5, 0, 1, 2.2], [1, 2.2, 1.5, 0], [1.5, 0, 2, 4]],
  Z: [[0, 4, 2, 4], [2, 4, 0, 0], [0, 0, 2, 0]],
  0: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0, 0, 2, 4]],
  1: [[1, 0, 1, 4], [1, 4, 0.4, 3.4]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 2], [0, 2, 2, 2], [2, 4, 2, 0]],
};

export function neon(text, { pos = [0, 0, 0], rotY = 0, size = 0.25, color = "#ff4fa3", gap = 0.8, ir = 0.8, uv = 0.8, additive = false, width = 0.07, switched = false, comoving = false } = {}) {
  const g = new THREE.Group();
  const m = mat({ color, emissive: 1, ir, uv, additive, switched, comoving, unique: true });
  g.glow = m;
  let cx = 0;
  for (const ch of text) {
    for (const [x0, y0, x1, y1] of STROKES[ch] ?? []) {
      const a = new THREE.Vector3((cx + x0) * size, y0 * size, 0), b = new THREE.Vector3((cx + x1) * size, y1 * size, 0);
      const seg = mesh(G.box, m, { scale: [width, a.distanceTo(b) + width, width] });
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y);
      g.add(seg);
    }
    cx += 2 + gap;
  }
  g.textWidth = (cx - gap) * size;
  g.position.set(...pos);
  g.rotation.y = rotY;
  g.updateMatrixWorld(true);
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
  constructor(group, flashes, { capacity = 4000, seed = 3, mirrorY = null, scale = 1, c = null } = {}) {
    this.scale = scale;
    this.c = c; // the place's own light speed, so shells don't change if the Lab does
    // Each spark is a glowing head and a streak behind it.
    this.sparks = sparkField(capacity, { gravity: 1.6, intensity: 3.5, uv: 1 });
    this.streaks = sparkField(capacity, { gravity: 1.6, intensity: 2.2, lines: true, uv: 1 });
    this.trails = sparkField(800, { intensity: 3 });
    group.add(this.sparks, this.streaks, this.trails);
    // Reflections in still water: the same sparks, mirrored (gravity pulls them "up").
    this.mirrorY = mirrorY;
    if (mirrorY !== null) {
      this.mSparks = sparkField(capacity, { gravity: -1.6, intensity: 1.8, uv: 1 });
      this.mStreaks = sparkField(capacity, { gravity: -1.6, intensity: 0.8, lines: true, uv: 1 });
      this.mTrails = sparkField(800, { intensity: 1 });
      group.add(this.mSparks, this.mStreaks, this.mTrails);
    }
    this.flashes = flashes;
    this.rand = rng(seed);
    this.bangs = []; // { at (world pos), t (burst time), heard }
    this.bursts = []; // for logging and goals
  }

  #put(field, mirror, p) {
    field.set(p);
    if (mirror && this.mirrorY !== null) {
      const y0 = this.mirrorY;
      mirror.set({ ...p, origin: new THREE.Vector3(p.origin.x, 2 * y0 - p.origin.y, p.origin.z), vel: new THREE.Vector3(p.vel.x, -p.vel.y, p.vel.z) });
    }
  }

  // Launch from `from` to burst at `at` (world time tBurst).
  shell(from, at, tBurst, { color, count = 220, speed = null } = {}) {
    const rand = this.rand;
    const c = this.c ?? world.c;
    const rise = new THREE.Vector3().subVectors(at, from);
    const climbSpeed = 0.45 * c;
    const climb = rise.length() / climbSpeed;
    const t0 = tBurst - climb;
    const vRise = rise.clone().divideScalar(climb);
    this.#put(this.trails, this.mTrails, { origin: from, vel: vRise, birth: t0, life: climb, color: new THREE.Color("#ffd9a0"), size: 0.5 });
    for (let k = 1; k < 8; k++) {
      const p = from.clone().addScaledVector(vRise, (climb * k) / 8);
      this.#put(this.trails, this.mTrails, { origin: p, vel: new THREE.Vector3(0, -0.3, 0), birth: t0 + (climb * k) / 8, life: 1.4, color: new THREE.Color("#ff9a50"), size: 0.3 });
    }
    const col = new THREE.Color(color ?? FIREWORK_COLORS[Math.floor(rand() * FIREWORK_COLORS.length)]);
    const v = (speed ?? 0.75) * c * this.scale;
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (dir.lengthSq() > 1 || dir.lengthSq() < 0.05) { i--; continue; }
      dir.normalize().multiplyScalar(v * (0.85 + 0.15 * rand()));
      const p = { origin: at, vel: dir, birth: tBurst, life: 3.6 + rand() * 1.4, color: i % 9 === 0 ? new THREE.Color("#ffffff") : col, size: 1.1 * this.scale, tail: 0.35 };
      this.#put(this.sparks, this.mSparks, p);
      this.#put(this.streaks, this.mStreaks, p);
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

// Many pines in a few draw calls. spots: [x, z, height][]
export function forest(spots, { snow = true } = {}) {
  const g = new THREE.Group();
  const n = spots.length;
  const trunk = new THREE.InstancedMesh(G.box, mat({ color: "#3a2a20", ir: 0.3 }), n);
  const layers = [0, 1, 2].map((i) => new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), mat({ color: "#1d3a2b", ir: 1.4, uv: 0.05 }), n));
  const caps = [0, 1, 2].map(() => new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), mat({ color: "#e9f0f7", ir: 0.6, uv: 0.4 }), n));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, h], k) => {
    q.setFromAxisAngle(up, x * 0.37 + z);
    trunk.setMatrixAt(k, m4.compose(new THREE.Vector3(x, h * 0.15, z), q, new THREE.Vector3(0.35, h * 0.3, 0.35)));
    for (let i = 0; i < 3; i++) {
      const r = h * (0.3 - i * 0.075), y = h * (0.42 + i * 0.2);
      layers[i].setMatrixAt(k, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, h * 0.36, r)));
      caps[i].setMatrixAt(k, m4.compose(new THREE.Vector3(x, y + h * 0.1, z), q, new THREE.Vector3(r * 0.72, h * 0.17, r * 0.72)));
    }
  });
  for (const m of [trunk, ...layers, ...(snow ? caps : [])]) {
    m.frustumCulled = false;
    g.add(m);
  }
  return g;
}

// A clock face whose hands show whatever time `set(t)` is given: the time
// its light left it. One lap of the big hand is a minute.
export function clockFace(radius = 1.2, { face = "#f4ead2", rim = "#2b2622", glow = 0.6 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: rim, ir: 0.3 }), { rot: [Math.PI / 2, 0, 0], scale: [radius * 1.12, 0.12, radius * 1.12] }));
  g.add(mesh(G.cyl, mat({ color: face, emissive: glow, ir: 0.8 }), { pos: [0, 0, 0.04], rot: [Math.PI / 2, 0, 0], scale: [radius, 0.12, radius] }));
  const tick = mat({ color: "#2b2622" });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(mesh(G.box, tick, { pos: [Math.sin(a) * radius * 0.82, Math.cos(a) * radius * 0.82, 0.12], rot: [0, 0, -a], scale: [0.06, i % 3 ? 0.14 : 0.3, 0.04] }));
  }
  const hand = (len, w, color) => {
    const pivot = new THREE.Group();
    pivot.position.z = 0.15;
    pivot.add(mesh(G.box, mat({ color }), { pos: [0, len / 2, 0], scale: [w, len, 0.04] }));
    g.add(pivot);
    return pivot;
  };
  const big = hand(radius * 0.78, 0.07, "#2b2622");
  const small = hand(radius * 0.5, 0.11, "#2b2622");
  const sec = hand(radius * 0.85, 0.03, "#c0392b");
  g.userData.dynamic = true;
  g.set = (t) => {
    sec.rotation.z = -(t % 10) / 10 * Math.PI * 2; // a fast hand, one lap per 10 s
    big.rotation.z = -(t / 60) * Math.PI * 2;
    small.rotation.z = -(t / 720) * Math.PI * 2;
  };
  return g;
}

// Wisps rising from fixed spots (chimneys, manholes), spawned as time passes.
export class Emitter {
  constructor(group, spots, { every = 0.35, rise = 0.9, drift = [0.3, 0, 0.1], life = 6, color = "#9aa0ad", size = 0.9, spread = 0.25, intensity = 0.35, seed = 5 } = {}) {
    this.field = sparkField(Math.ceil((spots.length * life) / every) + 20, { intensity, ir: 0.1, uv: 0.1 });
    group.add(this.field);
    this.spots = spots.map((p) => new THREE.Vector3(...p));
    Object.assign(this, { every, rise, drift: new THREE.Vector3(...drift), life, color: new THREE.Color(color), size, spread });
    this.rand = rng(seed);
    this.next = 0;
  }

  update(t) {
    while (this.next < t) {
      for (const p of this.spots) {
        const r = this.rand;
        const vel = new THREE.Vector3((r() - 0.5) * this.spread, this.rise * (0.8 + 0.4 * r()), (r() - 0.5) * this.spread).add(this.drift);
        this.field.set({ origin: p, vel, birth: this.next + r() * this.every, life: this.life * (0.7 + 0.6 * r()), color: this.color, size: this.size * (0.7 + 0.6 * r()) });
      }
      this.next += this.every;
    }
  }
}

// A simple flying bird, built facing along +x around the origin.
export function birdGeometry(span = 0.9) {
  const g = new THREE.BufferGeometry();
  const s = span / 2;
  const v = [0, 0, 0, -0.25, 0.08, -s, 0.15, 0.02, 0, 0, 0, 0, 0.15, 0.02, 0, -0.25, 0.08, s, -0.1, 0, -0.05, 0.3, 0.01, 0, -0.1, 0, 0.05];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
