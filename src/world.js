import * as THREE from "three";
import { box, followDisc, G, line, mesh, rng, withEdges } from "./geo.js";
import { mat } from "./shaders.js";
import { retardedTime, world } from "./relativity.js";

export const COSMIC = {
  env: {
    night: 1, space: 1, sun: [0.8, 0.25, -0.5], sunColor: [1.3, 1.25, 1.2], sky: [0.05, 0.055, 0.08], ground: [0.0, 0.0, 0.0],
    fog: "#000000", fogRange: [5000, 9000], skyTop: "#000000", skyHorizon: "#000000",
  },
  post: { bloom: { strength: 0.6, radius: 0.4, threshold: 0.55 } },
};

export const PALETTE = {
  obsidian: "#0b0b10",
  glass: "#1a2236",
  rail: "#5f8fd6",
  edge: "#9fb4ff",
  warm: "#ffb36b",
  strike: "#d9e4ff",
  danger: "#ff5a4a",
};

// Up to six flashes whose wavefronts are drawn on the deck.
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

// The walkable deck: a floor clipped to a rectangle, a slab underneath, and
// glowing edges. rect = [minX, minZ, maxX, maxZ].
export function deck(rect, { flashes, grid = 5 } = {}) {
  const g = new THREE.Group();
  const [x0, z0, x1, z1] = rect;
  g.add(followDisc(900, mat({
    color: PALETTE.obsidian, ir: 0.05, uv: 0.05, rect,
    grid: { color: "#4d5cff", spacing: grid, width: 0.8, glow: 0.3 },
    flashes,
  })));
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.add(box(w, 1.6, d, { color: "#07070b", ir: 0.05, uv: 0.02 }, [cx, -0.82, cz]));
  const glow = { color: PALETTE.edge, emissive: 1, ir: 0.5, uv: 0.8 };
  g.add(box(w, 0.08, 0.08, glow, [cx, 0.02, z0]));
  g.add(box(w, 0.08, 0.08, glow, [cx, 0.02, z1]));
  g.add(box(0.08, 0.08, d, glow, [x0, 0.02, cz]));
  g.add(box(0.08, 0.08, d, glow, [x1, 0.02, cz]));
  return g;
}

export function rails(x0, x1, z = 0) {
  const g = new THREE.Group();
  const o = { color: PALETTE.rail, emissive: 1, ir: 0.5, uv: 1 };
  for (const s of [-0.8, 0.8]) g.add(box(x1 - x0, 0.1, 0.1, o, [(x0 + x1) / 2, 0.06, z + s]));
  g.add(box(x1 - x0, 0.02, 2.4, { color: "#05050a", ir: 0.02 }, [(x0 + x1) / 2, 0.005, z]));
  return g;
}

// A glowing ring on the floor marking a place to stand.
export function marker(x, z, color = PALETTE.warm, r = 1.1) {
  const g = new THREE.Group();
  const ring = mesh(new THREE.RingGeometry(r - 0.07, r, 96), mat({ color, emissive: 1, unlit: true, doubleSided: true, ir: 0.5, uv: 0.5 }), { pos: [x, 0.03, z], rot: [-Math.PI / 2, 0, 0] });
  g.add(ring);
  g.add(mesh(new THREE.RingGeometry(0.05, 0.14, 32), mat({ color, emissive: 1, unlit: true, doubleSided: true }), { pos: [x, 0.03, z], rot: [-Math.PI / 2, 0, 0] }));
  return g;
}

// A slim pylon with a light on top, for lining platforms.
export function pylon(x, z, h = 2.6, color = PALETTE.edge) {
  const g = new THREE.Group();
  g.add(box(0.22, h, 0.22, { color: "#121522", ir: 0.1, uv: 0.1 }, [x, h / 2, z]));
  g.add(box(0.24, 0.06, 0.24, { color, emissive: 1, ir: 0.5, uv: 0.8 }, [x, h, z]));
  return g;
}

// A ringed giant, a moon and drifting rubble far below the deck.
export function cosmos(seed = 13) {
  const g = new THREE.Group();
  const rand = rng(seed);
  g.add(mesh(new THREE.SphereGeometry(1, 128, 80), mat({ color: "#d9a46c", ir: 0.8, uv: 0.2 }), { pos: [-160, 60, -560], scale: 160 }));
  g.add(mesh(new THREE.RingGeometry(200, 320, 200, 4), mat({ color: "#a8977c", ir: 0.4, uv: 0.3, doubleSided: true }), { pos: [-160, 60, -560], rot: [-1.25, 0.25, 0.1] }));
  g.add(mesh(G.sphere, mat({ color: "#b8bcc8", ir: 0.4, uv: 0.3 }), { pos: [260, 90, -380], scale: 16 }));
  g.add(mesh(G.sphere, mat({ color: "#7d8aa8", ir: 0.4, uv: 0.4 }), { pos: [-300, -40, 420], scale: 30 }));
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * 900, z = (rand() - 0.5) * 500, y = -20 - rand() * 120;
    g.add(mesh(new THREE.IcosahedronGeometry(1 + rand() * 5, 0), mat({ color: "#2a2a33", ir: 0.3 }), { pos: [x, y, z], rot: [rand() * 3, rand() * 3, 0] }));
  }
  return g;
}

// A jagged bolt from the sky to a point on the deck, shown for a moment when
// its light reaches you, plus the spot it leaves behind.
export function bolt(target, seed, color = PALETTE.strike) {
  const g = new THREE.Group();
  const rand = rng(seed);
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const j = i === 0 || i === 14 ? 0 : 1;
    pts.push([target.x + (rand() - 0.5) * 3 * j, target.y + 60 * (1 - k), target.z + (rand() - 0.5) * 3 * j]);
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
  const scorch = mesh(new THREE.CircleGeometry(0.9, 40), mat({ color: "#ff8a3d", emissive: 0.9, unlit: true, doubleSided: true, ir: 1.5 }), { pos: [target.x, 0.04, target.z], rot: [-Math.PI / 2, 0, 0] });
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

// A sliding door across the track: open = raised. `closedAt(t)` decides.
export function door(x, z, width = 5, height = 4.4) {
  const g = new THREE.Group();
  const slab = withEdges(box(0.35, height, width, { color: "#120d12", ir: 0.1, uv: 0.05 }, [0, height / 2, 0]), { color: PALETTE.danger });
  const frame = { color: PALETTE.edge, emissive: 0.8, ir: 0.3, uv: 0.5 };
  g.add(box(0.12, height + 1.2, 0.12, frame, [0, (height + 1.2) / 2, -width / 2 - 0.3]));
  g.add(box(0.12, height + 1.2, 0.12, frame, [0, (height + 1.2) / 2, width / 2 + 0.3]));
  g.add(box(0.12, 0.12, width + 0.7, frame, [0, height + 1.2, 0]));
  const lamp = mat({ color: PALETTE.danger, emissive: 1, unlit: true, unique: true });
  g.add(mesh(G.ball, lamp, { pos: [0, height + 1.45, 0], scale: 0.2 }));
  g.add(slab);
  g.position.set(x, 0, z);
  g.userData.dynamic = true;
  g.amount = 0;
  g.show = (closed) => {
    g.amount += ((closed ? 1 : 0) - g.amount) * 0.5;
    slab.position.y = (1 - g.amount) * (height + 0.2);
    lamp.uniforms.uColor.value.set(closed ? PALETTE.danger : "#5dff9a");
  };
  return g;
}

// A tall glass light clock: a photon bouncing between two mirrors.
export function lightClockFrame(height, extra = {}) {
  const g = new THREE.Group();
  const m = (o) => ({ ...o, ...extra });
  const mirror = m({ color: "#9fb0d8", emissive: 0.35, ir: 0.3, uv: 0.4 });
  g.add(box(1.4, 0.08, 1.4, mirror, [0, 0.3, 0]));
  g.add(box(1.4, 0.08, 1.4, mirror, [0, 0.3 + height, 0]));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.035, height, 0.035, m({ color: PALETTE.edge, emissive: 0.5, ir: 0.2, uv: 0.3 }), [sx * 0.68, 0.3 + height / 2, sz * 0.68]));
  }
  g.add(box(1.36, height, 1.36, m({ color: PALETTE.glass, additive: true, opacity: 0.12, unique: true }), [0, 0.3 + height / 2, 0]));
  return g;
}

export function photonBall(color = "#fff1c9", sourceVel = null) {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  g.add(mesh(G.sphere, mat({ color, emissive: 1, ir: 1.5, uv: 1.5, sourceVel }), { scale: 0.12 }));
  g.add(mesh(G.sphere, mat({ color, emissive: 1, additive: true, opacity: 0.2, ir: 0.3, uv: 0.3, unique: true, sourceVel }), { scale: 0.28 }));
  return g;
}

export { world };
