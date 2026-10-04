import * as THREE from "three";
import { mat } from "./shaders.js";

export const G = {
  sphere: new THREE.SphereGeometry(1, 32, 20),
  ball: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24, 4),
  box: new THREE.BoxGeometry(1, 1, 1, 4, 4, 4),
};

// Seeded randomness so places look the same every visit.
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

export function box(w, h, d, opts, pos = [0, 0, 0], rot = [0, 0, 0]) {
  return mesh(G.box, mat(opts), { pos, rot, scale: [w, h, d] });
}

export function withEdges(m, opts) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), mat({ unlit: true, emissive: 1, ...opts }));
  lines.frustumCulled = false;
  m.add(lines);
  return m;
}

// A thin glowing line between two points.
export function line(points, opts) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const l = new THREE.Line(geo, mat({ unlit: true, emissive: 1, ...opts }));
  l.frustumCulled = false;
  return l;
}

// A ground disc that follows the player: rings get denser close in, where
// aberration bends things most. Patterns are drawn in world space, so the
// mesh moving along with you is invisible.
export function followDisc(radius, material) {
  const rings = 150, spokes = 360, pos = [], idx = [];
  const r0 = 0.25, k = Math.log(radius / r0) / rings;
  pos.push(0, 0, 0);
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.exp(k * i);
    for (let j = 0; j < spokes; j++) {
      const a = (j / spokes) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < spokes; j++) idx.push(0, 1 + ((j + 1) % spokes), 1 + j);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < spokes; j++) {
      const a = 1 + i * spokes + j, b = 1 + i * spokes + ((j + 1) % spokes);
      idx.push(a, b, b + spokes, a, b + spokes, a + spokes);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const m = mesh(geo, material);
  m.follow = true;
  m.layers.set(1); // ground receives shadows but doesn't cast them
  return m;
}

// A trail left behind in space: points stay where they were laid down and fade
// with age as seen from the player (so light delay applies to them too).
export class Wake {
  constructor(color, { size = 900, fade = 2.5, opacity = 1 } = {}) {
    this.size = size;
    this.pos = new Float32Array(size * 3);
    this.birth = new Float32Array(size).fill(-1e9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aBirth", new THREE.BufferAttribute(this.birth, 1));
    this.geo = geo;
    this.n = 0;
    this.line = new THREE.Line(geo, mat({ color, unlit: true, emissive: 1, additive: true, opacity, wake: fade, ir: 0.6, uv: 0.6 }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 2;
  }

  // Points are kept in order; the oldest falls off the start.
  push(p, t) {
    if (this.n < this.size) {
      this.pos.set([p.x, p.y, p.z], this.n * 3);
      this.birth[this.n] = t;
      this.n++;
      this.geo.setDrawRange(0, this.n);
    } else {
      this.pos.copyWithin(0, 3);
      this.birth.copyWithin(0, 1);
      this.pos.set([p.x, p.y, p.z], (this.size - 1) * 3);
      this.birth[this.size - 1] = t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aBirth.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
}

// Merge every static mesh in `root` that shares a material into one mesh.
// Anything under an object flagged userData.dynamic (moved, spun or hidden at
// run time) is left alone.
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const isDynamic = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true; return false; };
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || isDynamic(m)) return;
    const key = m.material.uuid + ":" + m.renderOrder + ":" + m.layers.mask;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  });
  let merged = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const keep = meshes[0].material.vertexColors ? ["position", "normal", "color"] : ["position", "normal"];
    const geos = meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const big = new THREE.Mesh(geo, meshes[0].material);
    big.frustumCulled = false;
    big.renderOrder = meshes[0].renderOrder;
    big.layers.mask = meshes[0].layers.mask;
    root.add(big);
    for (const m of meshes) m.removeFromParent();
    merged += meshes.length;
  }
  return merged;
}
