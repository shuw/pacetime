import * as THREE from "three";
import { G, mesh, rng } from "./geo.js";
import { mat } from "./shaders.js";
import { retardedTime } from "./relativity.js";

// Light shows shared between places: flash wavefronts, lightning, photons.

export const PALETTE = {
  obsidian: "#0b0b10",
  glass: "#1a2236",
  rail: "#5f8fd6",
  edge: "#9fb4ff",
  warm: "#ffb36b",
  strike: "#d9e4ff",
  danger: "#ff5a4a",
};

// Up to six flashes whose wavefronts are drawn on the ground.
export class Flashes {
  constructor() {
    this.uFlash = { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -1e9)) };
    this.uFlashColor = { value: Array.from({ length: 6 }, () => new THREE.Color(1, 1, 1)) };
    this.next = 0;
  }

  add(pos, t, color = PALETTE.strike) {
    const i = this.next++ % 6;
    this.uFlash.value[i].set(pos.x, pos.y, pos.z, t);
    this.uFlashColor.value[i].set(color);
  }
}

// A glowing ring on the floor marking a place to stand.
export function marker(x, z, color = PALETTE.warm, r = 1.1) {
  const g = new THREE.Group();
  const ring = mesh(new THREE.RingGeometry(r - 0.07, r, 96), mat({ color, emissive: 1, unlit: true, doubleSided: true, ir: 0.5, uv: 0.5 }), { pos: [x, 0.03, z], rot: [-Math.PI / 2, 0, 0] });
  g.add(ring);
  g.add(mesh(new THREE.RingGeometry(0.05, 0.14, 32), mat({ color, emissive: 1, unlit: true, doubleSided: true }), { pos: [x, 0.03, z], rot: [-Math.PI / 2, 0, 0] }));
  return g;
}

// A jagged bolt from the sky to a point on the ground, shown for a moment when
// its light reaches you, plus the spot it leaves behind.
export function bolt(target, seed, color = PALETTE.strike, { top = 60 } = {}) {
  const g = new THREE.Group();
  const rand = rng(seed);
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const j = i === 0 || i === 14 ? 0 : 1;
    pts.push([target.x + (rand() - 0.5) * 3 * j, target.y + top * (1 - k), target.z + (rand() - 0.5) * 3 * j]);
  }
  pts.reverse();
  const stroke = new THREE.Group();
  const boltMat = mat({ color, emissive: 1, ir: 1, uv: 1.5 });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const seg = mesh(G.cyl, boltMat, { scale: [0.07, a.distanceTo(b), 0.07] });
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    stroke.add(seg);
  }
  const strokes = [stroke];
  g.add(stroke);
  const flare = mesh(G.sphere, mat({ color, emissive: 1, additive: true, opacity: 0.8, ir: 1, uv: 1 }), { pos: [target.x, target.y + 0.3, target.z], scale: 0.01 });
  g.add(flare);
  const scorch = mesh(new THREE.CircleGeometry(0.9, 40), mat({ color: "#ff8a3d", emissive: 0.9, unlit: true, doubleSided: true, ir: 1.5 }), { pos: [target.x, target.y + 0.04, target.z], rot: [-Math.PI / 2, 0, 0] });
  g.add(scorch);
  g.strike = null;
  g.userData.dynamic = true;
  // Shows the bolt for the world time `t` its light left the strike point.
  g.update = (eye) => {
    const seen = g.strike === null ? -1e9 : retardedTime(eye, target) - g.strike;
    const lit = seen >= 0 && seen < 0.35;
    strokes.forEach((s) => (s.visible = lit && (seen < 0.1 || seen > 0.18)));
    flare.scale.setScalar(seen >= 0 && seen < 2 ? 1.8 * Math.exp(-seen * 2.2) + 0.01 : 0.01);
    scorch.visible = seen >= 0;
  };
  return g;
}

export function photonBall(color = "#fff1c9", sourceVel = null) {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  g.add(mesh(G.sphere, mat({ color, emissive: 1, ir: 1.5, uv: 1.5, sourceVel }), { scale: 0.12 }));
  g.add(mesh(G.sphere, mat({ color, emissive: 1, additive: true, opacity: 0.2, ir: 0.3, uv: 0.3, unique: true, sourceVel }), { scale: 0.28 }));
  return g;
}

