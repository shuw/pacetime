import * as THREE from "three";
import { G, mesh, rng } from "./props.js";
import { mat } from "./shaders.js";
import { retardedTime, world } from "./relativity.js";

// Look-development scenes: the same layout (an avenue of gates, a landmark,
// a train crossing at 85% of light speed) dressed in four candidate styles.

const TRACK_Z = -24;

// A ground disc that follows the player: rings get denser close in, where
// aberration bends things most. Patterns are drawn in world space, so the
// mesh moving along with you is invisible.
function plane(radius, opts) {
  const rings = 140, spokes = 360, pos = [], idx = [];
  const r0 = 0.3, k = Math.log(radius / r0) / rings;
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
      const c = a + spokes, d = b + spokes;
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const m = mesh(geo, mat(opts));
  m.follow = true;
  return m;
}

function box(w, h, d, opts, pos = [0, 0, 0], rot = [0, 0, 0]) {
  return mesh(G.box, mat(opts), { pos, rot, scale: [w, h, d] });
}

function withEdges(m, opts) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), mat({ unlit: true, emissive: 1, ...opts }));
  lines.frustumCulled = false;
  m.add(lines);
  return m;
}

function makeMover(speedFraction) {
  return {
    uVel: { value: new THREE.Vector3(speedFraction, 0, 0) },
    uAnchor: { value: new THREE.Vector3(0, 0, TRACK_Z) },
    fraction: speedFraction,
  };
}

// A five-car train built around the origin, moving along +x. Every material
// shares the mover's uniforms so the shader can place it in spacetime.
function train(mover, { body, roof, glass, stripe, edge, nose = body }) {
  const g = new THREE.Group();
  const m = (o) => ({ ...o, mover });
  const add = (obj) => { g.add(obj); return obj; };
  const carLen = 11, gap = 0.7;
  for (let i = 0; i < 5; i++) {
    const x = -i * (carLen + gap);
    const b = add(box(carLen, 3.2, 3.1, m({ color: body, ir: 0.3, uv: 0.2 }), [x, 2.3, 0]));
    if (edge) withEdges(b, m({ color: edge }));
    add(box(carLen - 0.4, 0.35, 2.7, m({ color: roof, ir: 0.2 }), [x, 4.05, 0]));
    for (const s of [-1, 1]) {
      add(box(carLen - 1.2, 0.9, 0.05, m({ color: glass, emissive: 0.9, ir: 0.6, uv: 0.4 }), [x, 2.8, s * 1.58]));
      add(box(carLen - 0.2, 0.18, 0.05, m({ color: stripe, emissive: 0.6, ir: 0.4, uv: 0.3 }), [x, 1.6, s * 1.58]));
    }
    add(box(carLen - 1, 0.6, 2.4, m({ color: "#15151a", ir: 0.1 }), [x, 0.55, 0]));
  }
  // Nose: a wedge on the lead car.
  const wedge = new THREE.CylinderGeometry(0.01, 1.8, 4.5, 4, 1);
  wedge.rotateZ(-Math.PI / 2);
  wedge.rotateX(Math.PI / 4);
  const n = mesh(wedge, mat(m({ color: nose, ir: 0.3, uv: 0.2 })), { pos: [carLen / 2 + 2.2, 2.2, 0], scale: [1, 0.9, 0.86] });
  if (edge) withEdges(n, m({ color: edge }));
  g.add(n);
  g.add(mesh(G.sphere, mat(m({ color: "#ffffff", emissive: 1, ir: 1.5, uv: 1.5 })), { pos: [carLen / 2 + 4.3, 2.0, 0], scale: [0.2, 0.35, 0.6] }));
  g.length = 5 * (carLen + gap);
  return g;
}

function rails(opts, sleeperOpts) {
  const g = new THREE.Group();
  for (const s of [-0.75, 0.75]) g.add(box(400, 0.15, 0.12, opts, [0, 0.2, TRACK_Z + s]));
  if (sleeperOpts) {
    const sleepers = new THREE.InstancedMesh(G.box, mat(sleeperOpts), 260);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 260; i++) {
      mtx.compose(new THREE.Vector3(-200 + i * 1.55, 0.06, TRACK_Z), new THREE.Quaternion(), new THREE.Vector3(0.35, 0.12, 2.4));
      sleepers.setMatrixAt(i, mtx);
    }
    sleepers.frustumCulled = false;
    g.add(sleepers);
  }
  return g;
}

// Loops the train along the track, re-entering out of sight once its image
// (not its true position) has left.
function runTrain(mover, length) {
  const center = new THREE.Vector3(0, 2, TRACK_Z);
  let start = null;
  return (eye) => {
    const u = mover.fraction * world.c;
    mover.uVel.value.set(u, 0, 0);
    if (start === null) start = -8 + u * (eye.distanceTo(center) / world.c - world.t); // head just left of the avenue as first seen
    const seen = retardedTime(eye, center);
    let x = start + u * seen;
    if (x - length > 170) { start -= 340 + length; x = start + u * seen; }
    mover.uAnchor.value.set(start, 0, TRACK_Z);
  };
}

function avenue(gate, pillar) {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const z = -10 - i * 9;
    if (Math.abs(z - TRACK_Z) < 4) continue;
    const o = gate(i);
    o.position.z = z;
    g.add(o);
  }
  for (let z = -6; z > -90; z -= 6) {
    if (Math.abs(z - TRACK_Z) < 4) continue;
    for (const s of [-1, 1]) {
      const p = pillar(z, s);
      p.position.set(s * 7, 0, z);
      g.add(p);
    }
  }
  return g;
}

function previewScene(def) {
  return {
    id: def.id,
    title: def.title,
    icon: "",
    blurb: def.blurb,
    hidden: true,
    build() {
      const group = new THREE.Group();
      const mover = makeMover(0.85);
      const extra = def.build(group, mover) ?? {};
      const run = runTrain(mover, 5 * 11.7);
      return {
        group,
        colliders: [],
        bounds: def.bounds ?? 150,
        spawn: [0, 8, 0],
        env: def.env,
        post: def.post,
        goals: [],
        tips: [],
        update(ctx) {
          run(ctx.eye);
          for (const c of group.children) if (c.follow) c.position.set(ctx.eye.x, 0, ctx.eye.z);
          extra.update?.(ctx);
        },
      };
    },
  };
}

const neon = previewScene({
  id: "style-neon",
  title: "Neon Grid",
  blurb: "A dark void, a glowing grid, edge-lit monoliths.",
  env: {
    night: 1, sun: [0, 0.35, -1], sunColor: [0.05, 0.05, 0.1], sky: [0.04, 0.03, 0.09], ground: [0.02, 0.01, 0.04],
    fog: "#0a0418", fogRange: [60, 260], skyTop: "#020008", skyHorizon: "#1d0838",
  },
  post: { bloom: { strength: 1.0, radius: 0.55, threshold: 0.3 } },
  build(group, mover) {
    const rand = rng(21);
    group.add(plane(400, { color: "#04030a", grid: { color: "#2fd8ff", spacing: 4, width: 1.1, glow: 0.9 }, ir: 0.05, uv: 0.05 }));
    const dark = { color: "#07070c", ir: 0.02, uv: 0.02 };
    group.add(avenue(
      (i) => {
        const g = new THREE.Group();
        const c = i % 2 ? "#ff3df2" : "#2fd8ff";
        g.add(withEdges(box(0.6, 7, 0.6, dark, [-4, 3.5, 0]), { color: c }));
        g.add(withEdges(box(0.6, 7, 0.6, dark, [4, 3.5, 0]), { color: c }));
        g.add(withEdges(box(8.6, 0.6, 0.6, dark, [0, 7.3, 0]), { color: c }));
        return g;
      },
      () => {
        const g = new THREE.Group();
        g.add(withEdges(box(0.4, 3, 0.4, dark, [0, 1.5, 0]), { color: "#7a5cff" }));
        return g;
      },
    ));
    const ico = withEdges(mesh(new THREE.IcosahedronGeometry(14, 1), mat(dark)), { color: "#ff3df2" });
    ico.position.set(0, 24, -120);
    group.add(ico);
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, r = 30 + rand() * 110;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 12 || Math.abs(z - TRACK_Z) < 6) continue;
      const h = 4 + rand() * 18;
      group.add(withEdges(box(2 + rand() * 4, h, 2 + rand() * 4, dark, [x, h / 2, z], [0, rand() * 3, 0]), { color: rand() < 0.5 ? "#2fd8ff" : "#7a5cff" }));
    }
    group.add(rails({ color: "#2fd8ff", emissive: 0.8, ir: 0.2, uv: 0.2 }));
    group.add(train(mover, { body: "#08080e", roof: "#0c0c14", glass: "#ffe2b8", stripe: "#ff3df2", edge: "#2fd8ff" }));
    return { update: ({ eye }) => { ico.rotation.y = retardedTime(eye, ico.position) * 0.15; } };
  },
});

const monolith = previewScene({
  id: "style-monolith",
  title: "Salt Flat",
  blurb: "An endless pale salt flat at golden hour, basalt monoliths, a ring in the sky.",
  env: {
    night: 0, sun: [-0.3, 0.13, -0.95], sunColor: [1.25, 0.82, 0.5], sky: [0.42, 0.36, 0.36], ground: [0.55, 0.4, 0.3],
    fog: "#f0c9a6", fogRange: [60, 320], skyTop: "#35588f", skyHorizon: "#f5c49a",
  },
  post: { bloom: { strength: 0.35, radius: 0.7, threshold: 0.8 } },
  build(group, mover) {
    const rand = rng(8);
    group.add(plane(500, { color: "#f1dfca", grid: { color: "#d9bfa2", spacing: 7, width: 1.0, glow: 0 }, ir: 0.6, uv: 0.25 }));
    const basalt = { color: "#26252b", ir: 0.15, uv: 0.05 };
    const stone = { color: "#cdbba6", ir: 0.5, uv: 0.15 };
    group.add(avenue(
      () => {
        const g = new THREE.Group();
        g.add(box(0.9, 10, 0.9, basalt, [-4.2, 5, 0]));
        g.add(box(0.9, 10, 0.9, basalt, [4.2, 5, 0]));
        g.add(box(9.3, 0.9, 0.9, basalt, [0, 10.4, 0]));
        return g;
      },
      () => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.02, 0.5, 6, 4, 6), mat(basalt), { pos: [0, 3, 0] }));
        return g;
      },
    ));
    const ring = mesh(new THREE.TorusGeometry(26, 1.1, 16, 128), mat(basalt), { pos: [0, 40, -170] });
    group.add(ring);
    group.add(box(7, 46, 2.5, basalt, [24, 21, -140], [0, 0.4, 0.08]));
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, r = 30 + rand() * 160;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 12 || Math.abs(z - TRACK_Z) < 6) continue;
      if (rand() < 0.5) {
        const h = 3 + rand() * 14;
        group.add(box(1 + rand() * 3, h, 0.6 + rand(), basalt, [x, h / 2 - 0.3, z], [0, rand() * 3, (rand() - 0.5) * 0.2]));
      } else {
        const s = 1 + rand() * 5;
        group.add(mesh(G.sphere, mat(stone), { pos: [x, s * 0.3, z], scale: s }));
      }
    }
    group.add(rails({ color: "#8a8178", ir: 0.3 }, { color: "#3a3833", ir: 0.2 }));
    group.add(train(mover, { body: "#f3f0ea", roof: "#d9d4cc", glass: "#20232c", stripe: "#e2572b" }));
  },
});

const manifold = previewScene({
  id: "style-manifold",
  title: "Manifold",
  blurb: "Crisp white architecture repeating into thick colored fog.",
  env: {
    night: 0, sun: [0.45, 0.7, 0.35], sunColor: [0.75, 0.7, 0.66], sky: [0.3, 0.42, 0.42], ground: [0.32, 0.28, 0.25],
    fog: "#249c95", fogRange: [20, 190], skyTop: "#13706f", skyHorizon: "#58c8b8",
  },
  post: { bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 } },
  build(group, mover) {
    const rand = rng(4);
    group.add(plane(450, { color: "#e4ded2", grid: { color: "#c4bba9", spacing: 3, width: 1, glow: 0 }, ir: 0.4, uv: 0.2 }));
    const white = { color: "#f4f1ea", ir: 0.4, uv: 0.2 };
    const orange = { color: "#ff7a2f", ir: 0.5, uv: 0.1 };
    group.add(avenue(
      (i) => {
        const g = new THREE.Group();
        g.add(box(1.2, 9, 1.2, white, [-4.5, 4.5, 0]));
        g.add(box(1.2, 9, 1.2, white, [4.5, 4.5, 0]));
        g.add(box(10.2, 1.4, 2.4, i % 3 === 0 ? orange : white, [0, 9.7, 0]));
        return g;
      },
      () => {
        const g = new THREE.Group();
        g.add(box(0.8, 5, 0.8, white, [0, 2.5, 0]));
        return g;
      },
    ));
    // Colonnades and stepped towers repeating into the fog.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 18; k++) {
        const x = side * (26 + (k % 3) * 18), z = 40 - k * 16;
        if (Math.abs(z - TRACK_Z) < 8) continue;
        const h = 10 + ((k * 7) % 5) * 6;
        for (let s = 0; s < 4; s++) {
          const w = 10 - s * 2.2;
          group.add(box(w, h / 4, w, s === 3 && k % 4 === 0 ? orange : white, [x, (s + 0.5) * (h / 4), z]));
        }
      }
    }
    // A floating lattice cube.
    const lattice = new THREE.Group();
    for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
      lattice.add(box(0.8, 20, 0.8, white, [a * 10, 0, b * 10]));
      lattice.add(box(20, 0.8, 0.8, white, [0, a * 10, b * 10]));
      lattice.add(box(0.8, 0.8, 20, white, [a * 10, b * 10, 0]));
    }
    lattice.position.set(0, 34, -130);
    lattice.rotation.set(0.6, 0.7, 0);
    group.add(lattice);
    for (let i = 0; i < 20; i++) {
      const x = (rand() - 0.5) * 300, z = -40 - rand() * 160;
      if (Math.abs(x) < 14) continue;
      group.add(box(2 + rand() * 3, 2 + rand() * 3, 2 + rand() * 3, rand() < 0.3 ? orange : white, [x, 6 + rand() * 30, z], [rand(), rand(), 0]));
    }
    group.add(rails({ color: "#cfc8bb", ir: 0.3 }, { color: "#e2dccf", ir: 0.3 }));
    group.add(train(mover, { body: "#ff7a2f", roof: "#f4f1ea", glass: "#1d2b33", stripe: "#f4f1ea" }));
  },
});

const cosmic = previewScene({
  id: "style-cosmic",
  title: "Cosmic Rail",
  blurb: "An obsidian platform adrift in deep space, maglev light-rails, a ringed giant.",
  bounds: 120,
  env: {
    night: 1, space: 1, sun: [0.8, 0.25, -0.5], sunColor: [1.4, 1.3, 1.2], sky: [0.03, 0.035, 0.06], ground: [0.0, 0.0, 0.0],
    fog: "#000000", fogRange: [5000, 9000], skyTop: "#000000", skyHorizon: "#000000",
  },
  post: { bloom: { strength: 0.9, radius: 0.6, threshold: 0.45 } },
  build(group, mover) {
    const rand = rng(13);
    const deck = box(70, 1.2, 190, { color: "#0b0b10", grid: { color: "#5b6cff", spacing: 5, width: 0.8, glow: 0.35 }, ir: 0.05, uv: 0.05 }, [0, -0.6, -50]);
    deck.geometry = new THREE.BoxGeometry(1, 1, 1, 60, 1, 160);
    group.add(deck);
    const edgeGlow = { color: "#9fb4ff", emissive: 1, ir: 0.5, uv: 0.8 };
    group.add(box(0.15, 0.15, 190, edgeGlow, [-35, 0.05, -50]));
    group.add(box(0.15, 0.15, 190, edgeGlow, [35, 0.05, -50]));
    const glass = { color: "#141826", ir: 0.1, uv: 0.2 };
    group.add(avenue(
      () => {
        const g = new THREE.Group();
        const arc = mesh(new THREE.TorusGeometry(5, 0.12, 8, 96, Math.PI), mat(edgeGlow));
        g.add(arc);
        g.add(mesh(new THREE.TorusGeometry(5.4, 0.35, 8, 96, Math.PI), mat(glass)));
        return g;
      },
      () => {
        const g = new THREE.Group();
        g.add(box(0.5, 2.4, 0.5, glass, [0, 1.2, 0]));
        g.add(box(0.52, 0.08, 0.52, edgeGlow, [0, 2.4, 0]));
        return g;
      },
    ));
    // A ringed giant and a moon, far beyond the platform.
    const planet = mesh(new THREE.SphereGeometry(1, 96, 64), mat({ color: "#d9a46c", ir: 0.8, uv: 0.2 }), { pos: [-140, 70, -520], scale: 150 });
    group.add(planet);
    const ringGeo = new THREE.RingGeometry(190, 300, 160, 4);
    group.add(mesh(ringGeo, mat({ color: "#c9b79a", ir: 0.4, uv: 0.3, doubleSided: true, opacity: 0.8 }), { pos: [-140, 70, -520], rot: [-1.25, 0.25, 0.1] }));
    group.add(mesh(G.sphere, mat({ color: "#b8bcc8", ir: 0.4, uv: 0.3 }), { pos: [180, 40, -300], scale: 14 }));
    // Light rails running off into the void in both directions.
    for (const z of [TRACK_Z, TRACK_Z - 80]) {
      for (const s of [-0.75, 0.75]) group.add(box(900, 0.12, 0.12, { color: "#8fd0ff", emissive: 1, ir: 0.5, uv: 1 }, [0, 0.25, z + s]));
    }
    for (let i = 0; i < 30; i++) {
      const x = (rand() - 0.5) * 320, z = (rand() - 0.5) * 320 - 60, y = -10 - rand() * 60;
      if (Math.abs(x) < 40 && z > -150 && z < 50) continue;
      group.add(mesh(new THREE.IcosahedronGeometry(1 + rand() * 4, 0), mat({ color: "#2a2a33", ir: 0.3 }), { pos: [x, y, z], rot: [rand() * 3, rand() * 3, 0] }));
    }
    group.add(train(mover, { body: "#101118", roof: "#181a24", glass: "#cfe4ff", stripe: "#7f9bff", nose: "#0d0e14" }));
  },
});

export const PREVIEWS = [neon, monolith, manifold, cosmic];
