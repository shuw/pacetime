import * as THREE from "three";
import { Train } from "../rail.js";
import { EventLog } from "../events.js";
import { box, G, mesh, rng, Wake } from "../geo.js";
import { mat } from "../shaders.js";
import { bolt, Flashes, marker, PALETTE, photonBall } from "../world.js";
import { clockFace, cottage, forest, lampPost, mountain, neon, surface } from "../earth.js";
import { person, randomLook, Strollers } from "../people.js";
import { DayCycle } from "../day.js";
import { retardedTime, seenTimeOf, world } from "../relativity.js";
import { carMarker } from "./common.js";
import { sfx } from "../audio.js";

// A summer valley with a little country station, a nod to Einstein's Bern:
// one line, three thought experiments, in the order a train meets them.
const P = 170; // the line runs between tunnels in the hills at ±P
const STRIKE_X = -90; // lightning hits both ends as a train's middle passes here
const ENTRY = -30, EXIT = 10, MID = (ENTRY + EXIT) / 2; // a 40 m glasshouse tunnel
const CLOCK = new THREE.Vector3(60, 0, 7); // the platform's light clock
const HEADWAY = 45; // seconds between trains
const H = 2.4, BASE = 0.3; // light clock mirror gap and floor height
const ONBOARD = -3; // where each train's clock sits, from its middle
const GROUND = -0.6; // the meadow and the track bed, below the platform
const EDGE = 3.6; // the platform's edge

const AFTERNOON = { p: 0, hour: 15.5, elev: 0.42, sun: [1.3, 1.16, 0.95], sky: [0.42, 0.48, 0.6], ground: [0.42, 0.44, 0.3], top: "#3a78d0", hor: "#e6eef8", fog: "#dbe7f2", lit: "#ffffff", shade: "#b6c4d8", clouds: 0.38, stars: 0, night: 0, fogNear: 260, fogFar: 1500, bloom: [0.25, 0.92], dark: 0 };

const bounce = (s) => {
  const p = ((world.c * s) % (2 * H) + 2 * H) % (2 * H);
  return BASE + (p < H ? p : 2 * H - p);
};
const ticks = (s) => Math.floor((world.c * s) / (2 * H));

function tickLamps(parent, materialFor, x, y, z) {
  const lamps = [];
  for (let i = 0; i < 10; i++) {
    const m = materialFor();
    parent.add(mesh(G.sphere, m, { pos: [x - 0.9 + i * 0.2, y, z], scale: 0.07 }));
    lamps.push(m);
  }
  return (n) => lamps.forEach((m, i) => {
    const on = i < n % 10;
    m.uniforms.uColor.value.set(on ? "#ffb347" : "#5a4a3a");
    m.uniforms.uSpec.value.z = on ? 1 : 0.1;
  });
}

// A light clock: a photon bouncing between two brass mirrors inside a glass
// tube. The platform's stands on a pedestal under a little roof and dial.
function lightClock(extra = {}, { tower = false } = {}) {
  const g = new THREE.Group();
  const m = (o) => ({ ...o, ...extra });
  const brass = m({ color: "#d8a94a", ir: 0.7, uv: 0.3 });
  for (const y of [BASE, BASE + H]) {
    g.add(mesh(G.cyl, mat(brass), { pos: [0, y, 0], scale: [0.62, 0.08, 0.62] }));
    g.add(mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 40), mat(brass), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] }));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(mesh(G.cyl, mat(brass), { pos: [Math.cos(a) * 0.6, BASE + H / 2, Math.sin(a) * 0.6], scale: [0.03, H, 0.03] }));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.58, 0.58, H, 32, 1, true), mat(m({ color: "#cfeaff", additive: true, opacity: 0.12, ir: 0.1, uv: 0.2, doubleSided: true, unique: true })), { pos: [0, BASE + H / 2, 0] }));
  if (tower) {
    g.add(mesh(G.cyl, mat({ color: "#e8dcc4", ir: 0.5 }), { pos: [0, BASE / 2 - 0.02, 0], scale: [0.8, BASE, 0.8] }));
    g.add(mesh(new THREE.ConeGeometry(0.95, 0.9, 8), mat({ color: "#b8322c", ir: 0.5 }), { pos: [0, BASE + H + 0.75, 0] }));
    g.add(mesh(G.sphere, mat({ color: "#d8a94a", ir: 0.7 }), { pos: [0, BASE + H + 1.28, 0], scale: 0.12 }));
  }
  return g;
}

// A red barn door across the track that slides up out of the way.
function gate(x, width = 5.4, height = 4.6) {
  const g = new THREE.Group();
  const slab = new THREE.Group();
  slab.add(box(0.3, height, width, { color: "#b8322c", ir: 0.5 }, [0, height / 2, 0]));
  const trim = { color: "#f4efe6", ir: 0.6 };
  for (const [y, h] of [[0.15, 0.3], [height - 0.15, 0.3], [height / 2, 0.22]]) slab.add(box(0.34, h, width, trim, [0, y, 0]));
  for (const s of [-1, 1]) slab.add(box(0.34, height, 0.25, trim, [0, height / 2, (s * width) / 2]));
  for (const s of [-1, 1]) slab.add(box(0.33, 0.22, Math.hypot(width, height) * 0.48, trim, [0, height * 0.25, 0], [Math.atan2(height / 2, width) * s, 0, 0]));
  slab.children.forEach((c) => (c.position.y += GROUND));
  g.add(slab);
  const iron = { color: "#f4efe6", ir: 0.5 };
  for (const s of [-1, 1]) g.add(box(0.3, height * 2 + 0.6, 0.3, iron, [0, GROUND + height + 0.3, s * (width / 2 + 0.3)]));
  g.add(box(0.32, 0.3, width + 1, iron, [0, GROUND + height * 2 + 0.6, 0]));
  const lamp = mat({ color: "#ff5a4a", emissive: 1, unlit: true, unique: true });
  g.add(mesh(G.ball, lamp, { pos: [0, GROUND + height * 2 + 0.95, 0], scale: 0.28 }));
  g.position.set(x, 0, 0);
  g.userData.dynamic = true;
  g.amount = 0;
  g.show = (closed) => {
    g.amount += ((closed ? 1 : 0) - g.amount) * 0.5;
    slab.position.y = (1 - g.amount) * (height + 0.2);
    lamp.uniforms.uColor.value.set(closed ? "#ff5a4a" : "#5dff9a");
  };
  return g;
}

// A grumpy little storm cloud, with eyes, that lights up when it strikes.
function stormCloud(x, y, z, seed) {
  const g = new THREE.Group();
  const rand = rng(seed);
  const puff = mat({ color: "#8d96aa", ir: 0.5, uv: 0.3, unique: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(mesh(G.sphere, puff, { pos: [Math.cos(a) * (3 + rand() * 2), Math.sin(a * 2) * 0.8 + rand() * 1.2, Math.sin(a) * 2.5], scale: 2.4 + rand() * 1.6 }));
  }
  g.add(mesh(G.sphere, puff, { pos: [0, 1.6, 0], scale: 3.6 }));
  for (const sx of [-1, 1]) {
    g.add(mesh(G.sphere, mat({ color: "#ffffff" }), { pos: [sx * 1.3, 0.9, 3.4], scale: 0.7 }));
    g.add(mesh(G.sphere, mat({ color: "#1d1b22" }), { pos: [sx * 1.3, 0.75, 3.95], scale: 0.32 }));
    g.add(box(1.3, 0.22, 0.2, { color: "#3a3f50" }, [sx * 1.35, 1.75, 3.6], [0, 0, sx * 0.4])); // cross eyebrows
  }
  g.add(mesh(new THREE.TorusGeometry(0.8, 0.12, 8, 24, Math.PI), mat({ color: "#3a3f50" }), { pos: [0, -0.6, 3.75] })); // a frown
  g.position.set(x, y, z);
  g.userData.dynamic = true;
  g.flash = (k) => {
    puff.uniforms.uSpec.value.z = k * 0.9;
    puff.uniforms.uColor.value.set(k > 0.1 ? "#dfe6ff" : "#8d96aa");
  };
  return g;
}

// A Swiss cow, with a bell.
function cow(x, z, rotY, seed) {
  const g = new THREE.Group();
  const rand = rng(seed);
  const white = { color: "#f4f1ea", ir: 0.6 }, black = { color: "#2a2622", ir: 0.4 }, pink = { color: "#f2a0a8", ir: 0.6 };
  g.add(box(2.0, 1.0, 0.95, white, [0, 1.2, 0]));
  for (let i = 0; i < 4; i++) g.add(box(0.5 + rand() * 0.4, 0.5 + rand() * 0.3, 0.97, black, [-0.7 + rand() * 1.4, 1.1 + rand() * 0.3, 0]));
  for (const [sx, sz] of [[-0.75, -0.32], [-0.75, 0.32], [0.75, -0.32], [0.75, 0.32]]) g.add(box(0.2, 0.75, 0.2, white, [sx, 0.38, sz]));
  const head = new THREE.Group();
  head.position.set(1.15, 1.45, 0);
  head.add(box(0.7, 0.62, 0.6, white, [0.2, 0, 0]));
  head.add(box(0.3, 0.36, 0.52, pink, [0.6, -0.14, 0]));
  for (const s of [-1, 1]) {
    head.add(box(0.12, 0.12, 0.34, black, [0.15, 0.22, s * 0.42]));
    head.add(mesh(new THREE.ConeGeometry(0.06, 0.26, 6), mat({ color: "#f4e6c4" }), { pos: [0.1, 0.42, s * 0.2], rot: [s * -0.5, 0, 0] }));
    head.add(mesh(G.ball, mat({ color: "#1d1b22" }), { pos: [0.52, 0.12, s * 0.2], scale: 0.07 }));
  }
  head.add(mesh(G.sphere, mat({ color: "#e8b94a", ir: 0.8 }), { pos: [0.05, -0.5, 0], scale: 0.17 })); // the bell
  g.add(head);
  const tail = new THREE.Group();
  tail.position.set(-1.0, 1.5, 0);
  tail.add(box(0.06, 0.9, 0.06, white, [0, -0.45, 0]));
  tail.add(box(0.14, 0.2, 0.14, black, [0, -0.92, 0]));
  g.add(tail);
  g.position.set(x, GROUND, z);
  g.rotation.y = rotY;
  g.userData.dynamic = true;
  g.update = (t) => {
    tail.rotation.x = Math.sin(t * 2.3 + seed) * 0.4;
    head.rotation.z = -0.35 - 0.25 * (0.5 + 0.5 * Math.sin(t * 0.7 + seed * 1.3)); // grazing, now and then looking up
  };
  return g;
}

// A tunnel mouth in a grassy hill at the end of the line.
function hillTunnel(x, dir) {
  const g = new THREE.Group();
  g.add(mesh(G.sphere, mat({ color: "#5f9a48", ir: 1.2, uv: 0.1 }), { pos: [x + dir * 32, GROUND - 4, 0], scale: [38, 24, 52] }));
  const stone = mat({ color: "#a39a8a", ir: 0.5 });
  g.add(mesh(new THREE.TorusGeometry(3.6, 0.8, 8, 24, Math.PI), stone, { pos: [x, GROUND + 3.2, 0], rot: [0, Math.PI / 2, 0] }));
  for (const s of [-1, 1]) g.add(box(1.2, 3.4, 1.6, { color: "#a39a8a", ir: 0.5 }, [x, GROUND + 1.6, s * 3.6]));
  g.add(mesh(new THREE.CircleGeometry(3.6, 32, 0, Math.PI), mat({ color: "#0d0c10", unlit: true, doubleSided: true }), { pos: [x + dir * 0.4, GROUND + 3.2, 0], rot: [0, Math.PI / 2, 0] }));
  g.add(box(0.4, 3.4, 7.2, { color: "#0d0c10", unlit: true }, [x + dir * 0.4, GROUND + 1.6, 0]));
  return g;
}

export default {
  id: "railway",
  title: "Einstein's Railway",
  tag: "simultaneity · contraction · dilation",
  blurb: "A country station in a summer valley, with red trains at 87% of light speed: grumpy storm clouds, a glasshouse tunnel too short for the train, and a clock made of light.",

  build({ player, toast }) {
    world.c = 5;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const day = new DayCycle([AFTERNOON, { ...AFTERNOON, p: 1 }], { length: 1e9, azimuth: [0.35, 0.94] });
    const rand = rng(11);

    // The valley: a meadow, the track bed, alps and pines all round.
    group.add(surface({ color: "#6aa84f", ir: 1.3, uv: 0.1, checker: { b: "#64a24a", size: 9 }, flashes }, { y: GROUND, radius: 2400 }));
    // Rolling green foothills before the mountains.
    for (let i = 0; i < 9; i++) {
      const x = -700 + i * 170 + rand() * 60;
      group.add(mesh(G.sphere, mat({ color: i % 2 ? "#5f9a48" : "#6aa04e", ir: 1.2, uv: 0.1 }), { pos: [x, GROUND - 8, -260 - rand() * 80], scale: [90 + rand() * 50, 34 + rand() * 18, 60] }));
      group.add(mesh(G.sphere, mat({ color: i % 2 ? "#6aa04e" : "#5f9a48", ir: 1.2, uv: 0.1 }), { pos: [x + 60, GROUND - 8, 300 + rand() * 80], scale: [80 + rand() * 40, 26 + rand() * 14, 60] }));
    }
    group.add(box(2 * P + 24, 0.06, 5, { color: "#8a8076", ir: 0.4, flashes }, [0, GROUND + 0.03, 0]));
    for (const s of [-0.75, 0.75]) group.add(box(2 * P + 24, 0.12, 0.12, { color: "#c9ccd4", ir: 0.4, uv: 0.4 }, [0, GROUND + 0.12, s]));
    {
      const n = Math.floor((2 * P + 24) / 0.9);
      const sleepers = new THREE.InstancedMesh(G.box, mat({ color: "#5a4030", ir: 0.4 }), n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) sleepers.setMatrixAt(i, m4.compose(new THREE.Vector3(-P - 12 + i * 0.9, GROUND + 0.07, 0), new THREE.Quaternion(), new THREE.Vector3(0.24, 0.1, 2.4)));
      group.add(sleepers);
    }
    group.add(hillTunnel(-P, -1), hillTunnel(P, 1));
    for (let i = 0; i < 12; i++) {
      const x = -900 + i * 165 + rand() * 60, z = -420 - rand() * 380;
      group.add(mountain(x, z, 110 + rand() * 90, 170 + rand() * 170, { snowLine: 0.58 }));
    }
    for (let i = 0; i < 8; i++) group.add(mountain(-800 + i * 230 + rand() * 50, 520 + rand() * 260, 90 + rand() * 60, 110 + rand() * 90, { snowLine: 0.66 }));
    const pines = [];
    for (let i = 0; i < 90; i++) {
      const far = rand() < 0.5;
      const x = (rand() - 0.5) * 520, z = far ? -60 - rand() * 220 : 40 + rand() * 160;
      if (Math.abs(x) > P + 10 && Math.abs(z) < 40) continue;
      pines.push([x, z, 6 + rand() * 9]);
    }
    const trees = forest(pines, { snow: false });
    trees.position.y = GROUND;
    group.add(trees);
    [[-60, -70, 0.3, "#8a5a3a"], [-20, -95, -0.2, "#a0683e"], [40, -78, 0.5, "#8a5a3a"], [95, -110, -0.4, "#9a6038"], [-120, -120, 0.2, "#a0683e"]].forEach(([x, z, r, c], i) => {
      const h = cottage(x, z, r, { color: c, roof: "#7a2a24", seed: i + 3 });
      h.position.y = GROUND;
      group.add(h);
    });
    const cows = [[-140, -22, 0.4], [-118, -34, 2.6], [-60, -28, 1.2], [-20, -46, -0.6], [30, -24, 2.2], [80, -38, 0.9], [130, -26, -1.4]].map(([x, z, r], i) => {
      const c = cow(x, z, r, i + 1);
      group.add(c);
      return c;
    });

    // The platform: a wooden edge with a safety line, a stone promenade
    // behind, lamp posts with bunting, benches and flower boxes.
    const plank = { color: "#b8834f", ir: 0.6, uv: 0.1, planks: true, flashes };
    group.add(box(2 * P + 16, 0.2, 6, plank, [0, -0.1, EDGE + 3]));
    group.add(box(2 * P + 16, 0.2, 14.5, { color: "#d8cfbf", ir: 0.5, uv: 0.2, checker: { b: "#d1c7b4", size: 1.2 }, flashes }, [0, -0.1, EDGE + 6 + 7.25]));
    group.add(box(2 * P + 16, -GROUND, 0.4, { color: "#a39a8a", ir: 0.4 }, [0, GROUND / 2, EDGE - 0.2]));
    group.add(box(2 * P + 16, 0.02, 0.22, { color: "#ffd166", ir: 0.6, uv: 0.4 }, [0, 0.01, EDGE + 0.4]));
    for (let x = -P + 6; x <= P - 6; x += 24) {
      group.add(lampPost(x, EDGE + 5.6, { h: 3.8, fancy: true, pole: "#23465a", color: "#ffe6b0", range: 6, power: 0.4 }));
      // Bunting to the next lamp post.
      if (x + 24 <= P - 6) for (let k = 1; k < 12; k++) {
        const f = k / 12, sag = Math.sin(f * Math.PI) * 0.6;
        const flag = mesh(new THREE.ConeGeometry(0.16, 0.34, 3), mat({ color: ["#ff5a4a", "#ffd166", "#2ec4b6", "#3a86ff", "#ff8fd8"][k % 5], ir: 0.6, uv: 0.4 }), { pos: [x + f * 24, 3.75 - sag, EDGE + 5.6], rot: [Math.PI, 0, 0] });
        group.add(flag);
      }
      // A bench and a flower box between the lamps.
      group.add(box(2.2, 0.08, 0.5, { color: "#8a5a3a", ir: 0.5 }, [x + 12, 0.45, EDGE + 13]));
      group.add(box(2.2, 0.5, 0.08, { color: "#8a5a3a", ir: 0.5 }, [x + 12, 0.75, EDGE + 13.25]));
      for (const sx of [-0.9, 0.9]) group.add(box(0.08, 0.45, 0.45, { color: "#2b2d33" }, [x + 12 + sx, 0.22, EDGE + 13]));
      group.add(box(1.8, 0.4, 0.5, { color: "#7a4a2a", ir: 0.4 }, [x + 6, 0.2, EDGE + 19.5]));
      for (let k = 0; k < 6; k++) group.add(mesh(G.ball, mat({ color: ["#ff5a7a", "#ffd166", "#f4f1ea", "#c77dff"][k % 4], ir: 0.8, uv: 0.5 }), { pos: [x + 5.3 + k * 0.28, 0.48, EDGE + 19.5], scale: 0.16 }));
    }
    // The station house behind the promenade, with its own clock.
    {
      const sx = -128, sz = 28.5;
      group.add(box(16, 6, 7, { color: "#f2e8d5", ir: 0.5, windows: { size: [1.8, 2.2], lit: 0.2, color: "#ffc070", seed: 4 } }, [sx, 3 + GROUND, sz]));
      for (const x of [-8, -2.7, 2.7, 8]) group.add(box(0.35, 6, 0.35, { color: "#5a3a26", ir: 0.4 }, [sx + x, 3 + GROUND, sz - 3.55]));
      group.add(box(16.4, 0.35, 0.35, { color: "#5a3a26", ir: 0.4 }, [sx, 3.1 + GROUND, sz - 3.55]));
      // A pitched roof: a triangular prism along the building.
      const roofShape = new THREE.Shape([new THREE.Vector2(-4.4, 0), new THREE.Vector2(4.4, 0), new THREE.Vector2(0, 3.2)]);
      const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 17.4, bevelEnabled: false });
      roof.translate(0, 0, -8.7);
      roof.rotateY(Math.PI / 2);
      group.add(mesh(roof, mat({ color: "#b8322c", ir: 0.5 }), { pos: [sx, 6 + GROUND, sz] }));
      const board = box(7, 1.3, 0.2, { color: "#f4f1ea", ir: 0.5 }, [sx, 5.2 + GROUND, sz - 3.7]);
      group.add(board);
      const name = neon("BERN", { size: 0.22, color: "#7a1f1a", width: 0.09 });
      name.rotation.y = Math.PI; // read from the platform side
      name.position.set(sx + name.textWidth / 2, 4.75 + GROUND, sz - 3.82);
      group.add(name);
      const clock = clockFace(0.9);
      clock.position.set(sx, 7.6 + GROUND, sz - 4.4);
      clock.rotation.y = Math.PI;
      group.add(clock);
      group.userData.stationClock = clock;
    }
    // On the promenade: a ticket kiosk, a fountain, and topiary in planters.
    {
      const kx = -40, kz = 21.5;
      group.add(box(4, 2.6, 2.4, { color: "#f2e8d5", ir: 0.5 }, [kx, 1.3, kz]));
      group.add(box(2.4, 1.0, 0.1, { color: "#3a2a20" }, [kx, 1.5, kz - 1.25]));
      for (let i = 0; i < 6; i++) group.add(box(0.7, 0.08, 1.4, { color: i % 2 ? "#f4f1ea" : "#c8282d", ir: 0.5 }, [kx - 1.75 + i * 0.7, 2.75, kz - 1.6], [0.35, 0, 0]));
      const label = neon("TICKETS", { size: 0.09, color: "#7a1f1a", width: 0.035 });
      group.add(box(label.textWidth + 0.4, 0.55, 0.06, { color: "#f4f1ea" }, [kx, 3.3, kz - 1.25]));
      label.position.set(kx - label.textWidth / 2, 3.12, kz - 1.3);
      label.rotation.y = Math.PI;
      label.position.x = kx + label.textWidth / 2;
      group.add(label);
      group.add(person(randomLook(rand), { pos: [kx, 0.2, kz - 0.5], scale: 0.9 }));
      const fx = 110, fz = 16;
      group.add(mesh(G.cyl, mat({ color: "#d8cfbf", ir: 0.5 }), { pos: [fx, 0.3, fz], scale: [2.6, 0.6, 2.6] }));
      group.add(mesh(G.cyl, mat({ color: "#4cb6e0", ir: 0.2, uv: 0.4, emissive: 0.15 }), { pos: [fx, 0.58, fz], scale: [2.35, 0.06, 2.35] }));
      group.add(mesh(G.cyl, mat({ color: "#d8cfbf", ir: 0.5 }), { pos: [fx, 1.1, fz], scale: [0.3, 1.2, 0.3] }));
      group.add(mesh(G.sphere, mat({ color: "#bff0ff", additive: true, opacity: 0.35, emissive: 0.6 }), { pos: [fx, 1.9, fz], scale: [0.7, 0.45, 0.7] }));
      for (let x = -P + 18; x <= P - 18; x += 24) for (const z of [20.5]) {
        group.add(box(1.2, 0.7, 1.2, { color: "#7a4a2a", ir: 0.4 }, [x, 0.35, z]));
        group.add(mesh(G.sphere, mat({ color: "#3f8a45", ir: 1.3, uv: 0.1 }), { pos: [x, 1.6, z], scale: 0.85 }));
        group.add(mesh(G.sphere, mat({ color: "#3f8a45", ir: 1.3, uv: 0.1 }), { pos: [x, 2.55, z], scale: 0.55 }));
      }
      // Some folk resting on the benches.
      for (let x = -P + 18; x <= P - 18; x += 48) group.add(person(randomLook(rand), { pos: [x, 0.08, EDGE + 13.05], rotY: Math.PI, pose: "ride", scale: 0.95 }));
    }

    // A painted ring and a signpost at each place to watch from.
    const signpost = (x, z, text, color) => {
      group.add(marker(x, z, color));
      group.add(box(0.12, 2.2, 0.12, { color: "#5a3a26", ir: 0.4 }, [x + 1.6, 1.1, z]));
      const s = neon(text, { size: 0.1, color: "#2b2622", width: 0.04 });
      group.add(box(s.textWidth + 0.5, 0.75, 0.08, { color }, [x + 1.6, 2.1, z]));
      s.position.set(x + 1.6 - s.textWidth / 2, 1.9, z + 0.06);
      group.add(s);
    };
    signpost(STRIKE_X, 6.5, "LIGHTNING", PALETTE.warm);
    signpost(MID, 17, "TUNNEL", "#ff7a6a");
    signpost(CLOCK.x, CLOCK.z + 3.5, "CLOCKS", "#8fb4ff");

    // Folk waiting for a train, and others strolling about.
    for (let i = 0; i < 16; i++) {
      let x = -P + 14 + rand() * (2 * P - 28);
      if ([STRIKE_X, MID, CLOCK.x].some((m) => Math.abs(x - m) < 4)) x += 8;
      const z = EDGE + 1.6 + rand() * 3;
      group.add(person(randomLook(rand), { pos: [x, 0, z], rotY: (rand() - 0.5) * 0.8, scale: rand() < 0.25 ? 0.62 : 1 }));
      if (rand() < 0.4) group.add(box(0.5, 0.36, 0.2, { color: ["#8a5a3a", "#3a86ff", "#ff8fd8"][i % 3], ir: 0.5 }, [x + 0.55, 0.18, z]));
      if (rand() < 0.3) {
        const bz = z;
        group.add(mesh(G.sphere, mat({ color: ["#ff5a7a", "#ffd166", "#5ce1c6"][i % 3], ir: 0.6, uv: 0.4 }), { pos: [x + 0.4, 2.9, bz], scale: [0.3, 0.36, 0.3] }));
        group.add(box(0.01, 1.4, 0.01, { color: "#f4f1ea" }, [x + 0.4, 1.9, bz]));
      }
    }
    const strollers = new Strollers(group, { count: 7, x0: -P + 10, x1: P - 10, z0: EDGE + 8, z1: EDGE + 19, seed: 21 });
    const walk = [[-P - 8, EDGE, P + 8, 24]];

    // The glasshouse tunnel: white iron arches, glass between, red doors.
    {
      const iron = mat({ color: "#f4f1ea", ir: 0.6, uv: 0.3 });
      const R = 2.9, CY = 2.1;
      for (let x = ENTRY; x <= EXIT + 0.01; x += 4) {
        group.add(mesh(new THREE.TorusGeometry(R, 0.09, 6, 32, Math.PI), iron, { pos: [x, CY, 0], rot: [0, Math.PI / 2, 0] }));
        for (const s of [-1, 1]) group.add(box(0.18, CY - GROUND, 0.18, { color: "#f4f1ea", ir: 0.6 }, [x, (CY + GROUND) / 2, s * R]));
      }
      const glassM = mat({ color: "#bfe6ff", additive: true, opacity: 0.12, ir: 0.1, uv: 0.3, doubleSided: true, depthWrite: false });
      const vault = new THREE.CylinderGeometry(R, R, EXIT - ENTRY, 48, 1, true, 0, Math.PI);
      vault.rotateZ(Math.PI / 2);
      group.add(mesh(vault, glassM, { pos: [MID, CY, 0], rot: [Math.PI / 2, 0, 0] }));
      for (const s of [-1, 1]) group.add(box(EXIT - ENTRY, CY - GROUND, 0.04, { color: "#bfe6ff", additive: true, opacity: 0.12, ir: 0.1, uv: 0.3 }, [MID, (CY + GROUND) / 2, s * R]));
      group.add(box(EXIT - ENTRY, 0.12, 0.12, { color: "#f4f1ea", ir: 0.6 }, [MID, CY + R, 0]));
      // Flowers along the outside.
      for (let x = ENTRY + 1; x < EXIT; x += 1.1) group.add(mesh(G.ball, mat({ color: ["#ff5a7a", "#ffd166", "#c77dff", "#ff9f40"][Math.floor(x) & 3], ir: 0.8, uv: 0.5 }), { pos: [x, GROUND + 0.35, R + 0.5], scale: 0.28 }));
    }
    const entry = gate(ENTRY), exit = gate(EXIT);
    group.add(entry, exit);
    const entryPos = new THREE.Vector3(ENTRY, 2.5, 0), exitPos = new THREE.Vector3(EXIT, 2.5, 0);

    // The platform's light clock tower.
    const still = lightClock({}, { tower: true });
    still.position.copy(CLOCK);
    group.add(still);
    const stillPhoton = photonBall();
    group.add(stillPhoton);
    const stillWake = new Wake("#fff1c9", { fade: 3 });
    group.add(stillWake.line);
    const stillLamps = tickLamps(group, () => mat({ color: "#5a4a3a", emissive: 0.1, unique: true }), CLOCK.x, 0.08, CLOCK.z + 1.2); // a row of floor lights in front
    const stillPath = (t) => new THREE.Vector3(CLOCK.x, bounce(t), CLOCK.z);

    // A pool of red trains, each with a light clock and strike scorch marks.
    const scorchGeo = new THREE.CircleGeometry(0.8, 32);
    scorchGeo.rotateY(Math.PI / 2);
    const trains = [0, 1, 2, 3].map((k) => {
      const train = new Train({ cars: 5, fraction: Math.sqrt(3) / 2, clip: [-P, -50, P, 50], look: { body: "#c8282d", roof: "#e8e4dc", trim: "#f4f1ea", seed: 5 + k } });
      group.add(train.group);
      carMarker(train, 2.5);
      const clock = lightClock({ mover: train.mover, rect: train.clip });
      clock.position.x = ONBOARD;
      train.group.add(clock);
      const lamps = tickLamps(train.group, () => mat({ color: "#5a4a3a", emissive: 0.1, mover: train.mover, rect: train.clip, unique: true }), ONBOARD, BASE + H + 0.25, 0);
      const photon = photonBall("#c9e6ff", train.mover.uVel);
      group.add(photon);
      const wake = new Wake("#c9e6ff", { fade: 3 });
      group.add(wake.line);
      const scorch = [1, -1].map((end) => {
        const m = train.lifeMat({ color: "#ff8a3d", emissive: 1, ir: 1.5, unlit: true, doubleSided: true });
        train.carry(scorchGeo, m, end * (train.length / 2 + 0.1), 2.2);
        return m;
      });
      train.dispatch(0, -1e5);
      return { train, lamps, photon, wake, scorch, runStart: -1e9, ticks: -1 };
    });

    // Lightning from two grumpy clouds, one over each end of a passing train.
    const hl0 = trains[0].train.halfLength;
    const front = bolt(new THREE.Vector3(STRIKE_X + hl0, GROUND, 0), 4, PALETTE.strike, { top: 25 });
    const rear = bolt(new THREE.Vector3(STRIKE_X - hl0, GROUND, 0), 9, PALETTE.strike, { top: 25 });
    group.add(front, rear);
    const clouds = [stormCloud(STRIKE_X + hl0, 27, 0, 3), stormCloud(STRIKE_X - hl0, 27, 0, 8)];
    for (const c of clouds) c.rotation.y = Math.PI; // their grumpy faces toward the platform
    group.add(...clouds);

    const log = new EventLog();
    const passes = []; // per run: strike and door times, and their logged events
    const goals = [
      { group: "Simultaneity", text: "From the LIGHTNING sign's ring, watch lightning hit a passing train", done: false, at: [-90, 6.5, 0, 0.1] },
      { group: "Simultaneity", text: "Ride a train (E) through the strikes, standing in the middle car", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Length contraction", text: "From the TUNNEL sign's ring, see the whole train inside the glasshouse, both doors shut", done: false, at: [-10, 17, 0, 0.05] },
      { group: "Length contraction", text: "Ride through the tunnel: on board, the exit opens before the entry shuts", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Time dilation", text: "By the CLOCKS sign, watch a train's light clock tick slower than the tower's", done: false, at: [54, 12, -0.3, 0] },
      { group: "Time dilation", text: "Ride past the platform clock: now it's the slow one", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Appearance", text: "Stand at the platform edge as a train flies by: you see its far end, as if it turned", done: false, at: [-50, 4, 0, 0.05] },
    ];
    let note = "Trains every 45 seconds. Watch from a painted ring, or hop on one at the start of the platform.";

    // Fixed timetable: run k emerges from the west tunnel at k × HEADWAY.
    const hl = trains[0].train.halfLength;
    const v = trains[0].train.v;
    const first = -(-150 - (-P - hl - 1)) / v; // the first train is already emerging
    let nextRun = 0;
    const schedule = (t) => {
      const start = first + nextRun * HEADWAY;
      if (t < start - 2) return;
      const slot = trains[nextRun % trains.length];
      const tr = slot.train;
      tr.dispatch(start, -P - tr.halfLength - 1);
      slot.runStart = start;
      slot.wake.clear();
      const ts = tr.timeAt(STRIKE_X), h = tr.halfLength;
      const fp = new THREE.Vector3(STRIKE_X + h, 0.4, 0), rp = new THREE.Vector3(STRIKE_X - h, 0.4, 0);
      slot.scorch.forEach((m) => m.uniforms.uLife.value.set(ts, 1e9));
      const shut = tr.timeAt(ENTRY + h) + 0.15, open = tr.timeAt(EXIT - h) - 0.15, clear = tr.timeAt(EXIT + h) + 0.6;
      passes.push({
        slot, ts, fp, rp, shut, open, clear,
        strikes: [log.add("Front strike", ts, fp, "strike"), log.add("Rear strike", ts, rp, "strike")],
        doors: [log.add("Entry door shuts", shut, entryPos, "door"), log.add("Exit door opens", open, exitPos, "door")],
      });
      if (passes.length > 8) passes.shift();
      nextRun++;
    };
    while (first + nextRun * HEADWAY < 2) schedule(first + nextRun * HEADWAY);

    const entryClosed = (t) => passes.some((p) => t >= p.shut && t < p.clear);
    const exitOpen = (t) => passes.some((p) => t >= p.open && t < p.clear);
    const ridingSlot = () => trains.find((s) => player.vehicle === s.train.vehicle);

    log.onSeen((e) => {
      const pass = passes.find((p) => p.strikes.includes(e) || p.doors.includes(e));
      if (!pass) return;
      if (e.tag === "strike") {
        sfx.strike(e.pos);
        const [f, r] = pass.strikes;
        if (f.seenTau === null || r.seenTau === null) return;
        const seenGap = f.seenTau - r.seenTau, frameGap = f.frameTau - r.frameTau;
        const together = Math.abs(seenGap) < 0.08;
        const seenText = together ? "reached you together" : `reached you ${Math.abs(seenGap).toFixed(2)} s apart, ${seenGap < 0 ? "front" : "rear"} first`;
        const frameText = Math.abs(frameGap) < 0.08 ? "they happened at the same moment" : `the ${frameGap < 0 ? "front" : "rear"} strike happened ${Math.abs(frameGap).toFixed(2)} s earlier`;
        note = `Lightning, watched ${f.riding ? "on the train" : "from the platform"}: the flashes ${seenText}. Taking out the light's travel time, ${frameText} in your frame.`;
        if (!f.riding && together && Math.abs(player.pos.x - STRIKE_X) < 1.5) goals[0].done = true;
        const local = player.pos.x - pass.slot.train.centerAt(world.t);
        if (f.riding && Math.abs(local) < 8 && frameGap < -0.5 && !goals[1].done) {
          goals[1].done = true;
          toast("On the train, the front strike really did happen first. Whether two things happen at the same time depends on who's asking.", 9);
        }
      } else {
        if (e.label.includes("shuts")) sfx.doorShut(e.pos);
        else sfx.doorOpen(e.pos);
        const [s, o] = pass.doors;
        if (s.seenTau === null || o.seenTau === null) return;
        const seenGap = o.seenTau - s.seenTau, frameGap = o.frameTau - s.frameTau;
        note = `Tunnel doors, watched ${s.riding ? "on the train" : "from the platform"}: you saw the exit open ${Math.abs(seenGap).toFixed(2)} s ${seenGap > 0 ? "after" : "before"} the entry shut. In your frame it opened ${Math.abs(frameGap).toFixed(2)} s ${frameGap > 0 ? "after" : "before"}.`;
        if (!s.riding && seenGap > 0 && Math.abs(player.pos.x - MID) < 2) goals[2].done = true;
        if (s.riding && frameGap < 0 && !goals[3].done) {
          goals[3].done = true;
          toast("To the passengers the tunnel is only 20 m long, so the exit has to open before the back of the train is in. Both stories are true.", 10);
        }
      }
    });

    let stillTicks = -1;
    const fwdR = new THREE.Vector3();
    return {
      group,
      walk,
      trains: trains.map((s) => s.train),
      spawn: [STRIKE_X - 6, 11, -0.35],
      env: {
        night: 0, space: 0, clouds: AFTERNOON.clouds, sun: [0.3, 0.6, 0.8], sunColor: AFTERNOON.sun, sky: AFTERNOON.sky, ground: AFTERNOON.ground,
        fog: AFTERNOON.fog, fogRange: [AFTERNOON.fogNear, AFTERNOON.fogFar], skyTop: AFTERNOON.top, skyHorizon: AFTERNOON.hor,
      },
      shadows: true,
      post: { bloom: { strength: 0.3, radius: 0.4, threshold: 0.9 } },
      goals,
      log,
      tips: [
        "Lightning: the two strike points are the same distance from the LIGHTNING ring, so from there both flashes arrive together.",
        "The train is 62 m long at rest and 31 m on the platform, so it fits the 40 m tunnel. Its passengers see a 20 m tunnel.",
        "Each tick, a clock's photon crosses 2.4 m and back. On a moving train its path is a longer zigzag, so it ticks slower.",
        "The ground glows where a flash's light has spread so far. You see the flash the moment that ring reaches you.",
      ],
      get note() { return note; },
      readouts() {
        const tr = trains[0].train;
        const ride = ridingSlot();
        const nextStrike = passes.map((p) => p.ts - world.t).filter((d) => d > 0).sort((a, b) => a - b)[0];
        return [
          ["train", `${(tr.fraction * 100).toFixed(1)}% c · γ ${tr.gamma.toFixed(2)}`],
          ["train length", `${tr.length.toFixed(0)} m own · ${(tr.halfLength * 2).toFixed(0)} m here`],
          ["tunnel", `${EXIT - ENTRY} m · ${((EXIT - ENTRY) / tr.gamma).toFixed(0)} m to passengers`],
          ["next strike", nextStrike ? `${nextStrike.toFixed(1)} s (platform time)` : "–"],
          ["clock tick", (() => {
            const own = (2 * H) / world.c, slow = own * tr.gamma;
            return ride ? `${own.toFixed(2)} s yours · ${slow.toFixed(2)} s platform` : `${own.toFixed(2)} s platform · ${slow.toFixed(2)} s trains`;
          })()],
        ];
      },
      sound(eye) {
        let best = null;
        for (const s of trains) {
          const a = s.train.audio(eye, player);
          if (a && (!best || a.riding || a.pos.distanceTo(eye) < best.pos.distanceTo(eye))) best = a;
          if (a?.riding) break;
        }
        return best;
      },
      action() {
        const ride = ridingSlot();
        if (ride) return { label: "Step off the train", run: () => { player.alight(); sfx.alight(); player.pos.z = 5.2; } };
        if (player.pos.z > 6) return null;
        for (const s of trains) {
          const tr = s.train;
          if (Math.abs(player.pos.x - tr.centerAt(world.t)) < tr.halfLength - 1) {
            return { label: "Board the train", run: () => { player.pos.z = tr.z; player.board(tr.vehicle); sfx.board(); } };
          }
        }
        return null;
      },
      update({ eye, camera, t, dTau }) {
        day.apply(t);
        schedule(t);
        trains.forEach((s) => s.train.update());
        strollers.update(t);
        cows.forEach((c) => c.update(t));
        group.userData.stationClock.set(retardedTime(eye, group.userData.stationClock.position));
        const ride = ridingSlot();
        if (ride && ride.train.centerAt(t) + ride.train.halfLength > P - 1) {
          player.alight();
          sfx.alight();
          player.pos.set(Math.min(player.pos.x, P - 4), 0, 5.2);
          toast("End of the line. Press T to go back to the start.");
        }

        // The bolts show the latest strike that has happened (or the next one),
        // and their clouds light up as you see them strike.
        const struck = passes.filter((p) => p.ts <= t).at(-1) ?? passes.find((p) => p.ts > t);
        front.strike = rear.strike = struck ? struck.ts : null;
        // The train's length on the platform depends on light speed, so the
        // bolts strike wherever this run's ends are, and the clouds drift there.
        if (struck) {
          front.position.x = struck.fp.x - (STRIKE_X + hl0);
          rear.position.x = struck.rp.x - (STRIKE_X - hl0);
          clouds[0].position.x += (struck.fp.x - clouds[0].position.x) * Math.min(1, dTau * 2);
          clouds[1].position.x += (struck.rp.x - clouds[1].position.x) * Math.min(1, dTau * 2);
        }
        front.update(eye);
        rear.update(eye);
        clouds.forEach((c, i) => {
          const seen = struck ? retardedTime(eye, c.position) - struck.ts : -1;
          c.flash(seen >= 0 && seen < 0.4 ? 1 - seen / 0.4 : 0);
          c.position.y = 27 + Math.sin(t * 0.6 + i * 2) * 0.4;
        });
        for (const p of passes) {
          if (!p.flashed && t >= p.ts) { p.flashed = true; flashes.add(p.fp, p.ts); flashes.add(p.rp, p.ts); }
          if (!p.shutFlash && t >= p.shut) { p.shutFlash = true; flashes.add(new THREE.Vector3(ENTRY, 0.2, 3.2), p.shut, PALETTE.danger); }
          if (!p.openFlash && t >= p.open) { p.openFlash = true; flashes.add(new THREE.Vector3(EXIT, 0.2, 3.2), p.open, "#5dff9a"); }
        }
        entry.show(entryClosed(retardedTime(eye, entryPos)));
        exit.show(!exitOpen(retardedTime(eye, exitPos)));

        // Light clocks: real photon paths leave trails; the photons are drawn where you see them.
        stillWake.push(stillPath(t), t);
        const ts = seenTimeOf(stillPath, eye, t, 60);
        stillPhoton.position.copy(stillPath(ts));
        stillLamps(ticks(ts));
        if (ticks(ts) !== stillTicks) { if (stillTicks >= 0) sfx.tick(stillPhoton.position, 1320); stillTicks = ticks(ts); }
        for (const s of trains) {
          const tr = s.train;
          const path = (tt) => { const p = tr.pointAt(ONBOARD, tt); p.y = bounce((tt - s.runStart) / tr.gamma); return p; };
          const live = Math.abs(tr.centerAt(t)) < P + 60;
          s.photon.visible = live;
          if (!live) continue;
          s.wake.push(path(t), t);
          const tm = seenTimeOf(path, eye, t, 60);
          s.photon.position.copy(path(tm));
          s.photon.visible = Math.abs(s.photon.position.x) < P;
          const n = ticks((tm - s.runStart) / tr.gamma);
          s.lamps(n);
          if (n !== s.ticks) { if (s.ticks >= 0 && s.photon.visible) sfx.tick(s.photon.position, 880); s.ticks = n; }
          if (!ride && Math.abs(tr.centerAt(retardedTime(eye, s.photon.position)) - player.pos.x) < 12 && Math.abs(player.pos.x - CLOCK.x) < 30) goals[4].done = true;
        }
        // Terrell rotation: a passing train seen up close looks turned.
        if (!ride && player.pos.z < 6 && !goals[6].done) {
          for (const s of trains) {
            const path = (tt) => s.train.pointAt(0, tt);
            const seen = path(seenTimeOf(path, eye, t, 60));
            const toIt = seen.clone().sub(eye);
            camera.getWorldDirection(fwdR);
            if (Math.abs(seen.x - eye.x) < 14 && toIt.length() < 20 && fwdR.dot(toIt.normalize()) > 0.7) {
              goals[6].done = true;
              note = "The light from the train's far end left earlier, when the train was further back, so you see that end too. A fast box looks turned, not squashed: Terrell rotation.";
            }
          }
        }
        if (ride && Math.abs(player.pos.x - CLOCK.x) < 10 && !goals[5].done) {
          goals[5].done = true;
          toast("From the train, the platform clock's photon is the one zigzagging. Each of you sees the other's clock run slow.", 9);
        }
        log.update(player, eye);
      },
    };
  },
};
