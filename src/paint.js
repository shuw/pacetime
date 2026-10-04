import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Merge many colored parts into one geometry with per-vertex colors, so a
// whole object (a gondola and its rider, a ring of swings) is one draw call.
export class Painter {
  constructor() {
    this.parts = [];
  }

  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], matrix = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const s = typeof scale === "number" ? [scale, scale, scale] : scale;
    const m = matrix ?? new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!["position", "normal"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  // Add an already-colored geometry (a person) with a transform.
  addPainted(geo, matrix) {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    this.parts.push(g);
    return this;
  }

  geometry() {
    return mergeGeometries(this.parts, false);
  }
}

// A cylinder between two points.
export function rodMatrix(a, b, r = 0.05) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, A.distanceTo(B), r));
}
