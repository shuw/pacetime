import * as THREE from "three";
import { mat, liveMat } from "./shaders.js";

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  ball: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16, 4),
  cone: new THREE.ConeGeometry(1, 1, 20, 4),
  box: new THREE.BoxGeometry(1, 1, 1, 3, 3, 3),
  torus: new THREE.TorusGeometry(1, 0.18, 10, 40),
};

// Seeded randomness so scenes look the same every visit.
export function rng(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function mesh(geo, material, { pos = [0, 0, 0], scale = 1, rot = [0, 0, 0] } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (typeof scale === "number") m.scale.setScalar(scale);
  else m.scale.set(...scale);
  m.rotation.set(...rot);
  m.frustumCulled = false; // apparent positions differ from true ones
  return m;
}

// Ground with enough vertices that aberration can bend it smoothly.
export function ground(size, a, b, cell = 4, extra = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 220, 220);
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, mat({ color: a, checker: { b, size: cell }, ir: 0.5, uv: 0.1, ...extra }));
}

export const PASTELS = ["#ff7eb6", "#ffb86b", "#ffe66d", "#7ee8a6", "#6ec8ff", "#b69cff", "#ff9a8b"];

export function lollipopTree(color, h = 4) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: "#fff4e8" }), { pos: [0, h / 2, 0], scale: [0.12, h, 0.12] }));
  g.add(mesh(G.sphere, mat({ color, uv: 0.3 }), { pos: [0, h + 0.6, 0], scale: [1.2, 1.2, 0.5] }));
  g.add(mesh(G.torus, mat({ color: "#ffffff" }), { pos: [0, h + 0.6, 0], scale: [0.75, 0.75, 1.8] }));
  return g;
}

// Leaves are much brighter in infrared than in green light (the "Wood
// effect"), so these glow when you run at them.
export function puffTree(h = 3.5, color = "#4cc36b") {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: "#a0663a" }), { pos: [0, h / 2, 0], scale: [0.25, h, 0.25] }));
  const leaf = mat({ color, ir: 1.6, uv: 0.05 });
  g.add(mesh(G.sphere, leaf, { pos: [0, h + 0.8, 0], scale: 1.6 }));
  g.add(mesh(G.sphere, leaf, { pos: [0.9, h + 0.3, 0.3], scale: 1.1 }));
  g.add(mesh(G.sphere, leaf, { pos: [-0.8, h + 0.4, -0.4], scale: 1.15 }));
  return g;
}

export function mushroomHouse(cap = "#ff5d73") {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: "#fff1d6" }), { pos: [0, 1.4, 0], scale: [1.5, 2.8, 1.5] }));
  g.add(mesh(G.box, mat({ color: "#8a5a3c" }), { pos: [0, 0.8, 1.45], scale: [0.8, 1.6, 0.2] }));
  g.add(mesh(G.sphere, mat({ color: "#bfe8ff", emissive: 0.4 }), { pos: [0.9, 1.9, 1.1], scale: 0.35 }));
  g.add(mesh(G.cone, mat({ color: cap }), { pos: [0, 3.6, 0], scale: [2.8, 1.9, 2.8] }));
  const spot = mat({ color: "#ffffff" });
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, y = 3.2 + (i % 3) * 0.35, r = 2.4 - (y - 3.2) * 1.3;
    g.add(mesh(G.ball, spot, { pos: [Math.cos(a) * r, y, Math.sin(a) * r], scale: 0.28 }));
  }
  return g;
}

export function arch(color, w = 3.2) {
  const geo = new THREE.TorusGeometry(w, 0.32, 10, 48, Math.PI);
  return mesh(geo, mat({ color, uv: 0.25 }));
}

export function candyPole(h = 3, a = "#ff4d6d", b = "#ffffff") {
  const g = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    g.add(mesh(G.cyl, mat({ color: i % 2 ? b : a }), { pos: [0, (i + 0.5) * (h / n), 0], scale: [0.15, h / n, 0.15] }));
  }
  g.add(mesh(G.ball, mat({ color: "#ffe66d", emissive: 0.5 }), { pos: [0, h + 0.15, 0], scale: 0.25 }));
  return g;
}

// A clock whose hands show whatever time `set(t)` is given, which is the
// time its light left it.
export function clockFace(radius = 1.5, face = "#fffaf0", rim = "#ff7eb6") {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: rim }), { rot: [Math.PI / 2, 0, 0], scale: [radius * 1.12, 0.2, radius * 1.12] }));
  g.add(mesh(G.cyl, mat({ color: face, emissive: 0.15 }), { pos: [0, 0, 0.06], rot: [Math.PI / 2, 0, 0], scale: [radius, 0.2, radius] }));
  const tick = mat({ color: "#3b3355" });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(mesh(G.box, tick, { pos: [Math.sin(a) * radius * 0.82, Math.cos(a) * radius * 0.82, 0.18], rot: [0, 0, -a], scale: [0.08, i % 3 ? 0.18 : 0.35, 0.05] }));
  }
  const hand = (len, w, color) => {
    const pivot = new THREE.Group();
    pivot.position.z = 0.22;
    pivot.add(mesh(G.box, mat({ color }), { pos: [0, len / 2, 0], scale: [w, len, 0.05] }));
    g.add(pivot);
    return pivot;
  };
  const sec = hand(radius * 0.85, 0.05, "#ff3d6e");
  const min = hand(radius * 0.7, 0.12, "#3b3355");
  g.add(mesh(G.ball, mat({ color: "#ffe66d" }), { pos: [0, 0, 0.3], scale: 0.1 }));
  g.set = (t) => {
    sec.rotation.z = -(t / 60) * Math.PI * 2; // a "minute" lap every 60 s
    min.rotation.z = -(t / 3600) * Math.PI * 2;
  };
  return g;
}

export function clockTower() {
  const g = new THREE.Group();
  g.add(mesh(G.box, mat({ color: "#ffd6e7" }), { pos: [0, 5, 0], scale: [4, 10, 4] }));
  g.add(mesh(G.box, mat({ color: "#b69cff" }), { pos: [0, 10.4, 0], scale: [4.6, 0.8, 4.6] }));
  g.add(mesh(G.cone, mat({ color: "#6ec8ff" }), { pos: [0, 13, 0], scale: [3.4, 4.4, 3.4], rot: [0, Math.PI / 4, 0] }));
  g.add(mesh(G.ball, mat({ color: "#ffe66d", emissive: 0.6 }), { pos: [0, 15.5, 0], scale: 0.45 }));
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const f = clockFace(1.5);
    const a = (i * Math.PI) / 2;
    f.position.set(Math.sin(a) * 2.05, 8, Math.cos(a) * 2.05);
    f.rotation.y = a;
    g.add(f);
    faces.push(f);
  }
  g.set = (t) => faces.forEach((f) => f.set(t));
  return g;
}

export function firefly() {
  const m = liveMat({ color: "#d8ff6a", emissive: 1, ir: 0.4, uv: 0.4 });
  const halo = liveMat({ color: "#d8ff6a", emissive: 1, opacity: 0.25, additive: true, ir: 0.2, uv: 0.2 });
  const g = new THREE.Group();
  const glow = mesh(G.ball, m, { scale: 0.22 });
  const aura = mesh(G.sphere, halo, { scale: 0.6 });
  g.add(glow, aura);
  g.add(mesh(G.ball, mat({ color: "#3b3355" }), { pos: [0, 0.16, 0.05], scale: 0.14 }));
  g.color = new THREE.Color("#e8ff7a");
  g.glow = (k) => {
    m.uniforms.uSpec.value.z = 0.15 + k * 1.6;
    m.uniforms.uColor.value.copy(g.color).multiplyScalar(0.25 + 0.75 * Math.min(1, k * 3));
    halo.uniforms.uColor.value.copy(g.color);
    halo.uniforms.uOpacity.value = 0.04 + 0.3 * k;
    glow.scale.setScalar(0.22 + 0.12 * k);
    aura.scale.setScalar(0.35 + 0.6 * k);
  };
  return g;
}

// A shy critter painted only in infrared or ultraviolet: at rest it sends out
// no light the eye can read, so it is invisible until Doppler shifts it in.
export function critter(kind) {
  const ir = kind === "ir";
  const g = new THREE.Group();
  const hidden = liveMat({ color: "#000000", ir: ir ? 2.2 : 0, uv: ir ? 0 : 2.2, emissive: 0.8, additive: true });
  const found = mat({ color: ir ? "#ff6a3d" : "#b46bff", emissive: 0.3, ir: 0.5, uv: 0.5 });
  const body = mesh(G.sphere, hidden, { pos: [0, 0.7, 0], scale: [0.7, 0.62, 0.7] });
  const ears = [-1, 1].map((s) =>
    mesh(ir ? G.cone : G.sphere, hidden, ir
      ? { pos: [s * 0.35, 1.35, 0], scale: [0.18, 0.4, 0.18], rot: [0, 0, -s * 0.3] }
      : { pos: [s * 0.75, 0.95, -0.1], scale: [0.6, 0.12, 0.35], rot: [0, 0, s * 0.4] }));
  const eyeM = liveMat({ color: "#000000", ir: ir ? 2.5 : 0, uv: ir ? 0 : 2.5, emissive: 1, additive: true });
  const eyes = [-1, 1].map((s) => mesh(G.ball, eyeM, { pos: [s * 0.22, 0.85, 0.6], scale: 0.12 }));
  [body, ...ears, ...eyes].forEach((m) => g.add(m));
  g.reveal = () => {
    [body, ...ears].forEach((m) => (m.material = found));
    eyes.forEach((m) => (m.material = mat({ color: "#2a2340" })));
  };
  return g;
}

export function personPip() {
  const g = new THREE.Group();
  const shirt = mat({ color: "#6ec8ff" });
  g.add(mesh(G.cyl, shirt, { pos: [0, 0.55, 0], scale: [0.45, 0.8, 0.45] }));
  g.add(mesh(G.sphere, mat({ color: "#ffd8b8" }), { pos: [0, 1.25, 0], scale: 0.42 }));
  g.add(mesh(G.sphere, mat({ color: "#7a4a2a" }), { pos: [0, 1.42, -0.05], scale: [0.45, 0.3, 0.45] }));
  const eye = mat({ color: "#2a2340" });
  g.add(mesh(G.ball, eye, { pos: [-0.14, 1.28, 0.38], scale: 0.05 }));
  g.add(mesh(G.ball, eye, { pos: [0.14, 1.28, 0.38], scale: 0.05 }));
  g.add(mesh(G.ball, mat({ color: "#ff7eb6" }), { pos: [0, 1.13, 0.39], scale: [0.09, 0.04, 0.04] }));
  return g;
}

export function kettle() {
  const g = new THREE.Group();
  g.add(mesh(G.box, mat({ color: "#5b4a6b" }), { pos: [0, 0.35, 0], scale: [0.9, 0.7, 0.9] }));
  // Hot things glow in infrared long before they glow red.
  const burner = liveMat({ color: "#ff5a2a", emissive: 0.3, ir: 1.5 });
  g.add(mesh(G.cyl, burner, { pos: [0, 0.72, 0], scale: [0.35, 0.04, 0.35] }));
  const pot = mat({ color: "#ff7eb6", uv: 0.3 });
  g.add(mesh(G.sphere, pot, { pos: [0, 1.05, 0], scale: [0.4, 0.33, 0.4] }));
  g.add(mesh(G.cyl, pot, { pos: [0.42, 1.12, 0], rot: [0, 0, -0.9], scale: [0.05, 0.35, 0.05] }));
  g.add(mesh(G.torus, mat({ color: "#3b3355" }), { pos: [0, 1.38, 0], scale: 0.22 }));
  const puffs = [];
  const steam = mat({ color: "#ffffff", opacity: 0.55, uv: 0.4 });
  for (let i = 0; i < 6; i++) {
    const p = mesh(G.ball, steam, { scale: 0.001 });
    g.add(p);
    puffs.push(p);
  }
  g.set = (t, heat) => {
    burner.uniforms.uSpec.value.set(1.5 + heat * 3, 0, 0.2 + heat * 0.5);
    puffs.forEach((p, i) => {
      const k = (t * 0.6 + i / puffs.length) % 1;
      p.position.set(0.7 + k * 0.4, 1.3 + k * 1.6, Math.sin(k * 6 + i) * 0.15);
      p.scale.setScalar(heat * (0.08 + k * 0.25));
    });
  };
  return g;
}

export function flag(color) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat({ color: "#ffffff" }), { pos: [0, 1.2, 0], scale: [0.05, 2.4, 0.05] }));
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.4, 0), new THREE.Vector3(0.9, 2.15, 0), new THREE.Vector3(0, 1.9, 0),
  ]);
  geo.computeVertexNormals();
  g.add(mesh(geo, mat({ color, doubleSided: true })));
  return g;
}

export function flowerPatch(rand, n, radius, colors = PASTELS) {
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
  stemGeo.translate(0, 0.25, 0);
  const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
  headGeo.translate(0, 0.55, 0);
  const stems = new THREE.InstancedMesh(stemGeo, mat({ color: "#4cc36b", ir: 1.4 }), n);
  const heads = new THREE.InstancedMesh(headGeo, mat({ color: "#ffffff", uv: 0.5, ir: 0.4 }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    m.makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r);
    stems.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, c.set(colors[i % colors.length]));
  }
  const g = new THREE.Group();
  [stems, heads].forEach((x) => { x.frustumCulled = false; g.add(x); });
  return g;
}

export { G };
