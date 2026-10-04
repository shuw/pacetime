import * as THREE from "three";
import { box, G, mesh, rng } from "../geo.js";
import { mat, shared } from "../shaders.js";
import { EventLog } from "../events.js";
import { Flashes } from "../world.js";
import { birdGeometry, building, Fireworks, lampPost, neon, orbiting, rotor, SOUND_SPEED, stringLights, surface } from "../earth.js";
import { Mover } from "../movers.js";
import { retardedTime, seenTimeOf, world } from "../relativity.js";
import { angleOf, govern, motion } from "../motion.js";
import { sfx } from "../audio.js";
import { Gallery } from "../gallery.js";
import { DayCycle } from "../day.js";
import { Painter, rodMatrix } from "../paint.js";
import { person, personGeometry, randomLook, Strollers } from "../people.js";

const C = 6; // light speed here, m/s
const SEA = -2.4;
const WHEEL = new THREE.Vector3(-16, 14.5, -146), WHEEL_R = 12;
const SWING = new THREE.Vector3(-1, 0, -160), SWING_R = 6.4;
const LIGHTHOUSE = new THREE.Vector3(70, 0, -250), LAMP_Y = 22, BEAM_OMEGA = 0.6;
const BARGE = new THREE.Vector3(0, SEA, -228);
const TWIN = [new THREE.Vector3(-36, 30, -224), new THREE.Vector3(36, 30, -224)];
const DAY_LEN = 170; // seconds of world time from golden hour to night
const LIGHTS_ON = 0.47; // the moment in the day the pier lights switch on
const SHOW_FROM = 0.58; // fireworks once it's dark enough

const BRIGHT = ["#ff4d6d", "#ffbe0b", "#2ec4b6", "#8338ec", "#3a86ff", "#fb5607", "#06d6a0", "#ff006e"];

// Golden hour, sunset, dusk, blue hour, night.
const DAY = [
  { p: 0, elev: 0.17, sun: [1.45, 1.05, 0.7], sky: [0.46, 0.44, 0.54], ground: [0.44, 0.33, 0.27], top: "#3d6fb6", hor: "#ffc48a", fog: "#f2b68e", lit: "#ffe2a8", shade: "#b08a9a", clouds: 0.5, stars: 0, night: 0, fogNear: 120, fogFar: 900, bloom: [0.4, 0.82], dark: 0 },
  { p: 0.25, elev: 0.08, sun: [1.45, 0.85, 0.5], sky: [0.4, 0.35, 0.46], ground: [0.38, 0.26, 0.21], top: "#34589e", hor: "#ffa262", fog: "#e8946e", lit: "#ffc070", shade: "#94607e", clouds: 0.55, stars: 0, night: 0, fogNear: 110, fogFar: 850, bloom: [0.45, 0.78], dark: 0.05 },
  { p: 0.45, elev: 0.0, sun: [1.3, 0.55, 0.32], sky: [0.32, 0.25, 0.36], ground: [0.26, 0.16, 0.15], top: "#2a4282", hor: "#ff6a44", fog: "#c47068", lit: "#ff7a52", shade: "#703c6e", clouds: 0.58, stars: 0, night: 0, fogNear: 100, fogFar: 800, bloom: [0.55, 0.7], dark: 0.25 },
  { p: 0.6, elev: -0.05, sun: [0.75, 0.32, 0.3], sky: [0.22, 0.18, 0.3], ground: [0.14, 0.1, 0.12], top: "#1e2d66", hor: "#e0506a", fog: "#70496a", lit: "#e8607e", shade: "#40294f", clouds: 0.55, stars: 0.1, night: 0.2, fogNear: 90, fogFar: 760, bloom: [0.7, 0.58], dark: 0.6 },
  { p: 0.8, elev: -0.11, sun: [0, 0, 0], sky: [0.14, 0.15, 0.27], ground: [0.07, 0.06, 0.1], top: "#111b46", hor: "#78406c", fog: "#3a3052", lit: "#8a4c7c", shade: "#211f3a", clouds: 0.5, stars: 0.6, night: 0.7, fogNear: 90, fogFar: 760, bloom: [0.7, 0.55], dark: 0.88 },
  { p: 1, elev: -0.25, sun: [0, 0, 0], sky: [0.07, 0.08, 0.15], ground: [0.03, 0.03, 0.05], top: "#060a1c", hor: "#1c1b36", fog: "#121428", lit: "#30324f", shade: "#10101d", clouds: 0.45, stars: 1, night: 1, fogNear: 90, fogFar: 760, bloom: [0.7, 0.56], dark: 1 },
];

// The coaster: a closed track, a station stop, a chain lift, then gravity.
const TRACK = [
  [20, 1.4, -126], [20, 1.4, -136], [20, 5, -146], [20, 15, -160], [18, 15.6, -168], [10, 3, -176], [2, 2.6, -186],
  [4, 8, -196], [14, 10, -201], [26, 4, -195], [31, 2.6, -181], [28, 7.5, -166], [31, 3.2, -151], [28, 2, -137], [24, 1.6, -127],
];

function coasterProfile(curve) {
  const L = curve.getLength();
  const N = 2400;
  const h = [];
  for (let i = 0; i <= N; i++) h.push(curve.getPointAt(i / N).y);
  let crest = 0;
  for (let i = 0; i < N / 2; i++) if (h[i] > h[crest]) crest = i;
  const sCrest = (crest / N) * L, hCrest = h[crest];
  const vLift = 0.18 * C, vMax = 0.9 * C;
  const hLow = Math.min(...h.slice(crest));
  const g = (vMax * vMax - vLift * vLift) / (2 * (hCrest - hLow));
  const height = (s) => h[Math.min(N, Math.max(0, Math.round((s / L) * N)))];
  const speed = (s) => {
    if (s < 4) return vLift * 0.6;
    if (s < sCrest) return vLift;
    let v = Math.sqrt(vLift * vLift + 2 * g * Math.max(0, hCrest - height(s)));
    if (s > L - 14) v = Math.min(v, Math.max(0.12 * C, ((L - s) / 14) * v));
    return Math.min(v, vMax);
  };
  // A timetable: 4 s waiting in the station, then one lap.
  const ts = [0, 4], ss = [0, 0];
  let s = 0, t = 4;
  while (s < L) {
    s += speed(s) * 0.01;
    t += 0.01;
    ts.push(t);
    ss.push(Math.min(s, L));
  }
  const T = t;
  const sAt = (time) => {
    const tt = ((time % T) + T) % T;
    let lo = 0, hi = ts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= tt) lo = mid; else hi = mid; }
    const k = (tt - ts[lo]) / Math.max(1e-6, ts[hi] - ts[lo]);
    return ss[lo] + (ss[hi] - ss[lo]) * k;
  };
  return { L, T, sAt, speed, vMax };
}

// A coaster car with two riders, arms up. Drawn by hand where you see it.
function coasterCar(color, rand) {
  const sv = { value: new THREE.Vector3() };
  const p = new Painter();
  p.add(G.box, color, { pos: [0, 0.5, 0], scale: [1.5, 0.6, 2.1] });
  p.add(G.box, "#f4f1ea", { pos: [0, 0.82, 0], scale: [1.52, 0.08, 2.12] });
  p.add(G.box, "#1b1c22", { pos: [0, 0.2, 0], scale: [1.2, 0.25, 1.8] });
  for (const z of [-0.45, 0.45]) {
    const rider = personGeometry(randomLook(rand), { pose: "ride", scale: 0.85 });
    p.addPainted(rider, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.3, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  }
  const g = new THREE.Group();
  g.add(mesh(p.geometry(), mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.3, sourceVel: sv })));
  g.add(mesh(G.box, mat({ color: "#fff2c8", emissive: 1, ir: 1, uv: 0.6, sourceVel: sv }), { pos: [0, 0.55, -1.08], scale: [1.1, 0.1, 0.04] }));
  g.sv = sv;
  g.userData.dynamic = true;
  return g;
}

// A seaside kiosk with a striped awning and a neon sign.
function kiosk(group, colliders, x, z, rotY, color, sign) {
  const g = new THREE.Group();
  g.add(box(2.6, 2.2, 2, { color: "#f6efe2", ir: 0.5 }, [0, 1.1, 0]));
  g.add(box(2.4, 0.9, 0.06, { color: "#2b2340", ir: 0.2 }, [0, 1.35, 1.01]));
  g.add(box(2.7, 0.12, 2.1, { color, ir: 0.5 }, [0, 2.25, 0]));
  for (let k = 0; k < 6; k++) g.add(box(0.45, 0.06, 1.2, { color: k % 2 ? "#ffffff" : color, ir: 0.5 }, [-1.125 + k * 0.45, 2.15, 1.45], [-0.35, 0, 0]));
  const n = neon(sign, { size: 0.13, color: "#fff4c0", switched: true });
  n.position.set(-n.textWidth / 2, 2.45, 0.5);
  g.add(n);
  g.add(box(n.textWidth + 0.3, 0.75, 0.08, { color: "#1d1b2e", ir: 0.2 }, [0, 2.7, 0.45]));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  group.add(g);
  colliders.push({ x, z, r: 1.5 });
}

// Triangular pennants on a sagging line.
function bunting(group, a, b, { n = 16, sag = 0.5, colors = BRIGHT } = {}) {
  const p = new Painter();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.36, 0)]);
  tri.computeVertexNormals();
  const dir = B.clone().sub(A);
  const rotY = Math.atan2(-dir.z, dir.x);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const q = A.clone().lerp(B, k);
    q.y -= sag * 4 * k * (1 - k);
    p.add(tri, colors[i % colors.length], { pos: q.toArray(), rot: [0.12, rotY, 0] });
  }
  group.add(mesh(p.geometry(), mat({ color: "#ffffff", vertexColors: true, doubleSided: true, ir: 0.4, uv: 0.4 })));
}

export default {
  id: "pier",
  title: "Seaside Funfair",
  tag: "light delay · Doppler",
  blurb: "Golden hour on the pier, then dusk. A Ferris wheel near light speed, a coaster, swings, fireworks you hear before you see.",
  intro: true,
  tour: { from: [0, 30, 0], dir: [0, -1], length: 150 },

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const rand = rng(17);
    const colliders = [];
    const day = new DayCycle(DAY, { length: DAY_LEN, azimuth: [-0.42, -0.9] });

    // The sea mirrors everything: see the reflection pass in main.js.
    group.add(surface({ color: "#0e3a52", water: true, flashes, ir: 0.15, uv: 0.2 }, { y: SEA, reflective: true }));

    // Shore: sand, a promenade, beach huts and a pastel town on the hill.
    group.add(box(420, 1.6, 40, { color: "#e3c08f", ir: 0.6, uv: 0.2 }, [0, SEA - 0.2, 52]));
    group.add(box(260, 0.5, 18, { color: "#c9b49a", ir: 0.4, grid: { color: "#b39d82", spacing: 1.5, width: 1, glow: 0 } }, [0, -0.25, 49]));
    for (let i = 0; i < 24; i++) {
      const x = -118 + i * 10;
      if (Math.abs(x) < 10) continue;
      const c = BRIGHT[i % BRIGHT.length];
      group.add(box(3, 2.6, 2.6, { color: c, ir: 0.5 }, [x, 1.3, 45]));
      group.add(box(3.4, 0.25, 3, { color: "#ffffff", ir: 0.5 }, [x, 2.7, 45]));
      group.add(box(1, 1.8, 0.05, { color: "#ffffff", ir: 0.5 }, [x, 0.9, 43.68]));
    }
    const facades = ["#f7a8a0", "#9ee0c8", "#ffe08a", "#a8cdf0", "#d4b8f0", "#ffc49a", "#f5f0e6"];
    for (let i = 0; i < 28; i++) {
      const x = -140 + i * 10 + rand() * 3, z = 68 + rand() * 46, h = 7 + rand() * 13;
      group.add(building(x, z, 7 + rand() * 3, 7, h, { color: facades[i % facades.length], lit: 0.3, seed: i, cell: [1.7, 2.6], window: "#ffd59a" }));
      group.add(box(8 + rand() * 2, 0.6, 8, { color: ["#c8553d", "#3d5a80", "#5a8f6a"][i % 3], ir: 0.4 }, [x, h + 0.3, z]));
    }
    for (let x = -110; x <= 110; x += 12) group.add(lampPost(x, 41, { h: 4.2, switched: true, fancy: true, pole: "#23465a", color: "#ffe6b0" }));

    // The pier: honey boards, white rails, dark pilings.
    const plank = { color: "#b8834f", ir: 0.6, uv: 0.1, planks: true };
    group.add(box(10, 0.5, 160, plank, [0, -0.25, -40]));
    group.add(box(64, 0.5, 52, plank, [0, -0.25, -146]));
    group.add(box(10.4, 0.18, 160, { color: "#f4f1ea", ir: 0.5 }, [0, -0.45, -40]));
    group.add(box(64.4, 0.18, 52.4, { color: "#f4f1ea", ir: 0.5 }, [0, -0.45, -146]));
    for (let z = 40; z >= -170; z -= 8) {
      for (const x of z > -118 ? [-4.6, 4.6] : [-31, -15, 0, 15, 31]) group.add(box(0.5, 6, 0.5, { color: "#3a2c22", ir: 0.4 }, [x, -3.2, z]));
    }
    const rail = { color: "#f6f2ea", ir: 0.5, uv: 0.2 };
    for (const x of [-4.9, 4.9]) group.add(box(0.12, 0.12, 156, rail, [x, 1.05, -42]));
    for (let z = 36; z > -120; z -= 2) for (const x of [-4.9, 4.9]) group.add(box(0.07, 1.05, 0.07, rail, [x, 0.52, z]));
    for (const [x0, z0, x1, z1] of [[-31, -120, -5, -120], [5, -120, 31, -120], [-31, -172, 31, -172], [-31, -172, -31, -120], [31, -172, 31, -136]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      group.add(box(x1 === x0 ? 0.12 : len, 0.12, x1 === x0 ? len : 0.12, rail, [(x0 + x1) / 2, 1.05, (z0 + z1) / 2]));
    }

    // Entrance arch with neon.
    for (const s of [-1, 1]) {
      group.add(box(1.4, 7, 1.4, { color: "#f6f2ea", ir: 0.5 }, [s * 5.6, 3.5, 37]));
      group.add(mesh(G.sphere, mat({ color: "#e84a5f", ir: 0.5 }), { pos: [s * 5.6, 7.4, 37], scale: [0.9, 1.1, 0.9] }));
      group.add(mesh(G.cyl, mat({ color: "#ffd166", emissive: 0.6, ir: 0.8 }), { pos: [s * 5.6, 8.7, 37], scale: [0.06, 0.8, 0.06] }));
    }
    group.add(box(12.6, 1.6, 0.6, { color: "#23465a", ir: 0.4 }, [0, 6.6, 37]));
    {
      const n = neon("PIER", { size: 0.32, color: "#ff5fa2", switched: true, width: 0.1 });
      n.position.set(-n.textWidth / 2, 6.0, 37.35);
      group.add(n);
      group.add(stringLights([-5.6, 7.6, 37.4], [5.6, 7.6, 37.4], { n: 18, sag: -0.7, switched: true, colors: ["#ffe6a0"] }));
    }

    // Lamps, strings of bulbs and bunting along the pier.
    let prev = null;
    for (let z = 32; z > -118; z -= 10) {
      const side = (Math.round(z / 10) % 2 === 0) ? -4.5 : 4.5;
      group.add(lampPost(side, z, { h: 4, switched: true, fancy: true, pole: "#23465a", color: "#ffe6b0", range: 7, power: 1.1 }));
      if (prev) {
        group.add(stringLights([prev[0], 4.3, prev[1]], [side, 4.3, z], { n: 14, sag: 0.9, switched: true, wire: "#2b2d33", colors: ["#ffd38a", "#ff6b8a", "#7fd8ff", "#c7ff8a", "#ffb0e0"] }));
        bunting(group, [prev[0], 3.7, prev[1]], [side, 3.7, z], { n: 14, sag: 0.6 });
      }
      prev = [side, z];
    }

    // Benches with people enjoying the evening.
    for (let z = 22; z > -112; z -= 18) {
      for (const s of [-1, 1]) {
        const x = s * 4.25;
        group.add(box(0.5, 0.08, 1.8, { color: "#a0663a", ir: 0.5 }, [x, 0.45, z]));
        group.add(box(0.08, 0.5, 1.8, { color: "#a0663a", ir: 0.5 }, [x + s * 0.24, 0.75, z]));
        for (const lz of [-0.8, 0.8]) group.add(box(0.5, 0.45, 0.08, { color: "#23465a", ir: 0.3 }, [x, 0.22, z + lz]));
        const n = rand() < 0.45 ? 1 : 0;
        for (let k = 0; k < n; k++) group.add(person(randomLook(rand), { pose: "sit", pos: [x - s * 0.05, 0, z - 0.45 + k * 0.85], rotY: s * Math.PI / 2 }));
      }
    }

    // Kiosks along the pier.
    kiosk(group, colliders, -3.4, -58, Math.PI / 2, "#ff6fa8", "CANDY");
    kiosk(group, colliders, 3.4, -78, -Math.PI / 2, "#2ec4b6", "ICE CREAM");
    kiosk(group, colliders, -3.4, -98, Math.PI / 2, "#ffbe0b", "HOT DOGS");
    // and on the end platform
    kiosk(group, colliders, -27, -124, 0, "#8338ec", "GAMES");
    kiosk(group, colliders, -6, -124, 0, "#fb5607", "FRIES");
    kiosk(group, colliders, 8, -124, 0, "#3a86ff", "DRINKS");
    for (const [x, z] of [[-6, -121.6], [8, -121.6], [-27, -121.6]]) {
      if (rand() < 0.7) group.add(person(randomLook(rand), { pos: [x - 0.3, 0, z + 0.9], rotY: Math.PI }));
    }

    // A balloon seller near the entrance.
    const balloons = new THREE.Group();
    balloons.userData.dynamic = true;
    group.add(person({ body: "#ff6b8b", belly: "#ffd0da", top: "hat", topColor: "#f4e3b5", eyes: "round", cheeks: true, wide: 1.15 }, { pos: [2.6, 0, 26], rotY: -Math.PI / 2, scale: 1.15 }));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.25 + (i % 3) * 0.18;
      const top = new THREE.Vector3(2.4 + Math.cos(a) * r, 2.9 + (i % 4) * 0.25, 26 + Math.sin(a) * r);
      balloons.add(mesh(G.sphere, mat({ color: BRIGHT[i % BRIGHT.length], ir: 0.5, uv: 0.5 }), { pos: top.toArray(), scale: [0.24, 0.3, 0.24] }));
      const seg = mesh(G.cyl, mat({ color: "#eeeeee", ir: 0.3 }), { scale: [0.006, top.distanceTo(new THREE.Vector3(2.4, 1.3, 26)), 0.006] });
      seg.position.copy(top).add(new THREE.Vector3(2.4, 1.3, 26)).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(new THREE.Vector3(2.4, 1.3, 26)).normalize());
      balloons.add(seg);
    }
    group.add(balloons);

    // People strolling up and down; a few kids running at half light speed.
    const strollers = new Strollers(group, { count: 12, kids: 4, x0: -3.2, x1: 3.2, z0: -116, z1: 34, speed: [1, 1.5], kidSpeed: [2.6, 3.4], seed: 31, avoid: 1.1 });
    const strollers2 = new Strollers(group, { count: 4, x0: -26, x1: 26, z0: -168, z1: -150, speed: [0.6, 1.1], seed: 32 });

    // Ferris wheel: the rim moves at 80% of light speed.
    const wheelOmega = (0.8 * C) / WHEEL_R;
    const wr = rotor([WHEEL.x, WHEEL.y, WHEEL.z], [0, 0, 1], wheelOmega, WHEEL_R + 1.2);
    const spin = (o) => mat({ ...o, rotor: wr });
    for (const dz of [-0.9, 0.9]) {
      group.add(mesh(new THREE.TorusGeometry(WHEEL_R, 0.18, 10, 180), spin({ color: "#f6f2ea", ir: 0.4, uv: 0.3 }), { pos: [WHEEL.x, WHEEL.y, WHEEL.z + dz] }));
      group.add(mesh(new THREE.TorusGeometry(WHEEL_R * 0.55, 0.1, 8, 120), spin({ color: "#f6f2ea", ir: 0.4, uv: 0.3 }), { pos: [WHEEL.x, WHEEL.y, WHEEL.z + dz] }));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        group.add(mesh(G.box, spin({ color: BRIGHT[i % 4], ir: 0.4, uv: 0.3 }), { pos: [WHEEL.x + (Math.cos(a) * WHEEL_R) / 2, WHEEL.y + (Math.sin(a) * WHEEL_R) / 2, WHEEL.z + dz], scale: [WHEEL_R, 0.1, 0.1], rot: [0, 0, a] }));
      }
    }
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      group.add(mesh(G.ball, spin({ color: ["#ffd38a", "#ff6b8a", "#8fd8ff", "#c7ff8a"][i % 4], emissive: 1, ir: 1, uv: 2.2, switched: true }), { pos: [WHEEL.x + Math.cos(a) * WHEEL_R, WHEEL.y + Math.sin(a) * WHEEL_R, WHEEL.z + 1.1], scale: 0.13 }));
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (let k = 1; k <= 4; k++) {
        const r = (WHEEL_R * k) / 5;
        group.add(mesh(G.ball, spin({ color: "#fff2c8", emissive: 1, ir: 1, uv: 2, switched: true }), { pos: [WHEEL.x + Math.cos(a) * r, WHEEL.y + Math.sin(a) * r, WHEEL.z + 1.0], scale: 0.08 }));
      }
    }
    // Open gondolas hang level as the wheel turns: a basket, four posts and a
    // roof, roomy enough to ride in. Riders are separate so yours can step out.
    const cabinPivots = [];
    const riders = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pivot = [WHEEL.x + Math.cos(a) * WHEEL_R, WHEEL.y + Math.sin(a) * WHEEL_R, WHEEL.z];
      cabinPivots.push(new THREE.Vector3(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 0));
      const c = BRIGHT[i % BRIGHT.length];
      const [px, py, pz] = pivot;
      const p = new Painter();
      p.add(G.cyl, "#d9dde6", { pos: [px, py - 0.3, pz], scale: [0.05, 0.6, 0.05] });
      p.add(new THREE.ConeGeometry(1.05, 0.45, 16), "#f6f2ea", { pos: [px, py - 0.6, pz] });
      p.add(new THREE.CylinderGeometry(1.06, 1.06, 0.08, 16), c, { pos: [px, py - 0.84, pz] });
      for (let k = 0; k < 4; k++) {
        const b = (k / 4) * Math.PI * 2 + Math.PI / 4;
        p.add(G.cyl, "#f6f2ea", { pos: [px + Math.cos(b) * 0.82, py - 1.3, pz + Math.sin(b) * 0.82], scale: [0.035, 0.92, 0.035] });
      }
      p.add(new THREE.CylinderGeometry(0.88, 0.8, 0.7, 20, 1, true), c, { pos: [px, py - 2.1, pz] });
      p.add(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 20), "#3b3355", { pos: [px, py - 2.45, pz] });
      p.add(new THREE.TorusGeometry(0.88, 0.05, 6, 24), "#ffe9a8", { pos: [px, py - 1.75, pz], rot: [Math.PI / 2, 0, 0] });
      const gr = orbiting(wr, pivot);
      group.add(mesh(p.geometry(), mat({ color: "#ffffff", vertexColors: true, doubleSided: true, ir: 0.5, uv: 1.2, rotor: gr })));
      if (i % 3 !== 0) {
        const rider = mesh(personGeometry(randomLook(rand), { pose: "seated", scale: 0.85 }), mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.4, rotor: gr }), { pos: [px, py - 2.45, pz] });
        rider.userData.dynamic = true;
        group.add(rider);
        riders[i] = rider;
      }
    }
    for (const dz of [-2.4, 2.4]) for (const sx of [-1, 1]) {
      const foot = new THREE.Vector3(WHEEL.x + sx * 7.5, 0, WHEEL.z + dz);
      const leg = mesh(G.box, mat({ color: "#e6e2da", ir: 0.4 }), { scale: [0.4, foot.distanceTo(WHEEL), 0.4] });
      leg.position.copy(foot).add(WHEEL).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), WHEEL.clone().sub(foot).normalize());
      group.add(leg);
    }
    group.add(mesh(G.sphere, mat({ color: "#ffd38a", emissive: 1, ir: 1, switched: true }), { pos: [WHEEL.x, WHEEL.y, WHEEL.z], scale: 0.8 }));
    colliders.push({ x: WHEEL.x - 7.5, z: WHEEL.z, r: 1 }, { x: WHEEL.x + 7.5, z: WHEEL.z, r: 1 });

    // Wave swinger: chairs on chains fly out as the canopy spins.
    const swingOmega = (0.6 * C) / SWING_R;
    const sr = rotor(SWING.toArray(), [0, 1, 0], swingOmega, SWING_R + 0.5);
    {
      for (let k = 0; k < 6; k++) group.add(mesh(G.cyl, mat({ color: k % 2 ? "#ffffff" : "#ff4d6d", ir: 0.5 }), { pos: [SWING.x, 0.5 + k, SWING.z], scale: [0.45, 1, 0.45] }));
      const p = new Painter();
      p.add(new THREE.ConeGeometry(4.6, 1.8, 24), "#ffbe0b", { pos: [SWING.x, 7.4, SWING.z] });
      p.add(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 24), "#ff4d6d", { pos: [SWING.x, 6.3, SWING.z] });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const top = [SWING.x + Math.cos(a) * 4.2, 6.05, SWING.z + Math.sin(a) * 4.2];
        const seat = [SWING.x + Math.cos(a) * SWING_R, 2.4, SWING.z + Math.sin(a) * SWING_R];
        for (const off of [-0.25, 0.25]) {
          const t2 = [top[0] - Math.sin(a) * off, top[1], top[2] + Math.cos(a) * off];
          const s2 = [seat[0] - Math.sin(a) * off, seat[1] + 0.5, seat[2] + Math.cos(a) * off];
          p.add(G.cyl, "#cfcfcf", { matrix: rodMatrix(t2, s2, 0.015) });
        }
        const tilt = Math.atan2(SWING_R - 4.2, 3.6);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt));
        p.add(G.box, BRIGHT[i % BRIGHT.length], { matrix: new THREE.Matrix4().compose(new THREE.Vector3(...seat), q, new THREE.Vector3(0.6, 0.12, 0.6)) });
        if (i % 4 !== 3) {
          const rider = personGeometry(randomLook(rand), { pose: i % 2 ? "ride" : "seated", scale: 0.8 });
          p.addPainted(rider, new THREE.Matrix4().compose(new THREE.Vector3(seat[0], seat[1] - 0.38, seat[2]), q, new THREE.Vector3(1, 1, 1)));
        }
      }
      group.add(mesh(p.geometry(), mat({ color: "#ffffff", vertexColors: true, ir: 0.5, uv: 1, rotor: sr })));
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        group.add(mesh(G.ball, mat({ color: i % 2 ? "#fff0c0" : "#ff8ab0", emissive: 1, ir: 1, uv: 2, switched: true, rotor: sr }), { pos: [SWING.x + Math.cos(a) * 4.62, 6.3, SWING.z + Math.sin(a) * 4.62], scale: 0.1 }));
      }
      colliders.push({ x: SWING.x, z: SWING.z, r: 1.2 });
    }

    // Roller coaster.
    const curve = new THREE.CatmullRomCurve3(TRACK.map((q) => new THREE.Vector3(...q)), true, "catmullrom", 0.4);
    const prof = coasterProfile(curve);
    const railMat = mat({ color: "#2ec4b6", ir: 0.4, uv: 0.4 });
    for (const off of [-0.55, 0.55]) {
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const u = i / 600, q = curve.getPointAt(u), tan = curve.getTangentAt(u);
        const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        pts.push(q.clone().addScaledVector(side, off));
      }
      group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, 0.1, 6, true), railMat));
    }
    for (let i = 0; i < 120; i++) {
      const u = i / 120, q = curve.getPointAt(u);
      const ground = q.z < -170 ? SEA : 0;
      group.add(box(0.2, q.y - ground, 0.2, { color: "#f6f2ea", ir: 0.4 }, [q.x, (q.y + ground) / 2, q.z]));
      if (i % 2 === 0) group.add(box(1.3, 0.12, 0.2, { color: "#ff4d6d", ir: 0.4 }, [q.x, q.y - 0.2, q.z]));
      if (i % 3 === 0) group.add(mesh(G.ball, mat({ color: i % 2 ? "#ff9a6b" : "#fff0b0", emissive: 1, ir: 1, uv: 1.5, switched: true }), { pos: [q.x, q.y - 0.3, q.z], scale: 0.09 }));
    }
    group.add(box(4, 0.3, 14, { color: "#b07a4a", ir: 0.5 }, [24.4, 0.6, -131]));
    for (const dz of [-6.5, 6.5]) group.add(box(0.2, 3, 0.2, { color: "#f6f2ea" }, [26.2, 2.1, -131 + dz]));
    group.add(box(4.4, 0.2, 14.4, { color: "#ff4d6d", ir: 0.5 }, [24.4, 3.6, -131]));
    group.add(box(0.12, 0.12, 14, { color: "#ffd38a", emissive: 1, ir: 1, switched: true }, [26.4, 3.4, -131]));
    for (let k = 0; k < 2; k++) group.add(person(randomLook(rand), { pos: [27.3, 0, -127 - k * 0.9], rotY: Math.PI }));
    const cars = ["#ffbe0b", "#3a86ff", "#8338ec"].map((c) => { const car = coasterCar(c, rand); group.add(car); return car; });
    // The coaster keeps its own clock, which only runs slow if light gets
    // slower than its top speed.
    const coaster = { clock: 0, k: 1 };
    motion.add((dT, t, c) => {
      coaster.k = govern(prof.vMax, c) / prof.vMax;
      coaster.clock += dT * coaster.k;
    });
    const ct = (t) => coaster.clock - coaster.k * (world.t - t);
    const carS = (k) => (t) => ((prof.sAt(ct(t)) - k * 2.4) % prof.L + prof.L) % prof.L;
    const carPath = (k) => (t) => curve.getPointAt(carS(k)(t) / prof.L);
    const carVel = (k, t) => curve.getTangentAt(carS(k)(t) / prof.L).multiplyScalar(coaster.k * prof.speed(carS(k)(t)) * (((ct(t) % prof.T) + prof.T) % prof.T > 4 ? 1 : 0));

    // Lighthouse on a rock, its beam turning through the evening mist.
    group.add(mesh(new THREE.DodecahedronGeometry(9, 0), mat({ color: "#4a4650", ir: 0.4 }), { pos: [LIGHTHOUSE.x, SEA, LIGHTHOUSE.z], scale: [1.4, 0.6, 1.4] }));
    for (let i = 0; i < 6; i++) {
      group.add(mesh(G.cyl, mat({ color: i % 2 ? "#d63a3a" : "#f6f2ea", ir: 0.5 }), { pos: [LIGHTHOUSE.x, 1 + i * 3.2 + 1.6, LIGHTHOUSE.z], scale: [2.4 - i * 0.18, 3.2, 2.4 - i * 0.18] }));
    }
    group.add(mesh(G.cyl, mat({ color: "#22252c" }), { pos: [LIGHTHOUSE.x, LAMP_Y - 1.2, LIGHTHOUSE.z], scale: [2.2, 0.3, 2.2] }));
    const lampMat = mat({ color: "#fff3c4", emissive: 1, ir: 1.2, uv: 0.6, unique: true });
    const lamp = mesh(G.sphere, lampMat, { pos: [LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z], scale: 0.9 });
    lamp.userData.dynamic = true;
    group.add(lamp);
    group.add(mesh(new THREE.ConeGeometry(1.4, 1.4, 12), mat({ color: "#22252c" }), { pos: [LIGHTHOUSE.x, LAMP_Y + 1.4, LIGHTHOUSE.z] }));
    // The beam lies in a thin layer of mist at the lamp's height: from the pier
    // you see it edge-on as arcs, from the top of the wheel as a spiral.
    const beamColor = new THREE.Color("#fff0c0");
    const spiral = { uSpiral: { value: new THREE.Vector4(LIGHTHOUSE.x, LIGHTHOUSE.z, BEAM_OMEGA, 0.07) }, uSpiralColor: { value: beamColor.clone() } };
    const mist = mesh(new THREE.RingGeometry(2, 320, 360, 120), mat({ color: "#000000", unlit: true, additive: true, doubleSided: true, ir: 0, uv: 0, spiral }), { pos: [LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z], rot: [-Math.PI / 2, 0, 0] });
    mist.renderOrder = 4;
    mist.layers.set(2);
    group.add(mist);

    // Gulls circling over the pier.
    const bird = birdGeometry(1.1);
    for (let i = 0; i < 10; i++) {
      const center = [(rand() - 0.5) * 60, 12 + rand() * 14, -60 - rand() * 120];
      const r = 8 + rand() * 14, speed = (0.25 + rand() * 0.25) * C * (i % 2 ? 1 : -1);
      const br = rotor(center, [0, 1, 0], speed / r, r + 0.6);
      const a = rand() * Math.PI * 2;
      const pos = new THREE.Vector3(center[0] + Math.cos(a) * r, center[1], center[2] - Math.sin(a) * r);
      const gull = mesh(bird, mat({ color: "#f4f1ea", ir: 0.6, uv: 0.3, doubleSided: true, rotor: br }), { pos: pos.toArray() });
      gull.rotation.y = a + (speed > 0 ? 0 : Math.PI);
      group.add(gull);
    }

    // Two blimps drifting over the bay; one slow, one hurrying along at 40% of
    // light speed (and squashed a little for it). Their signs light up at dusk.
    const blimps = [
      { speed: 0.12, y: 46, z: -210, x: -60, dir: 1, body: "#f4f1ea", band: "#ff4d6d", sign: "PACETIME", signColor: "#ff6fb5" },
      { speed: 0.4, y: 28, z: -95, x: 120, dir: -1, body: "#ffd166", band: "#3a86ff", sign: "ICE CREAM", signColor: "#7fe8ff" },
    ].map((b) => {
      const m = new Mover(new THREE.Vector3(b.dir * b.speed * C, 0, 0));
      const g = new THREE.Group();
      const add = (geo, opts, tr) => { const o = mesh(geo, m.mat(opts), tr); g.add(o); return o; };
      add(new THREE.SphereGeometry(1, 40, 20), { color: b.body, ir: 0.5, uv: 0.4 }, { pos: [0, 0, 0], scale: [10, 3.2, 3.2] });
      for (const x of [-3.5, 3.5]) add(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), { color: b.band, ir: 0.5, uv: 0.4, doubleSided: true }, { pos: [x, 0, 0], rot: [0, 0, Math.PI / 2], scale: [3.07 - Math.abs(x) * 0.02, 1.2, 3.07 - Math.abs(x) * 0.02] });
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) add(G.box, { color: b.band, ir: 0.5 }, { pos: [-8.6, Math.cos(r) * 1.9, Math.sin(r) * 1.9], rot: [r, 0, 0], scale: [2.6, 2.4, 0.12] });
      add(G.box, { color: "#2b2d33", ir: 0.3 }, { pos: [0.5, -3.45, 0], scale: [3.4, 0.9, 1.2] });
      add(G.box, { color: "#ffe2a8", emissive: 1, ir: 1, uv: 1, switched: true }, { pos: [0.5, -3.4, 0], scale: [3.2, 0.32, 1.22] });
      add(G.sphere, { color: "#ff3030", emissive: 1, ir: 1, switched: true }, { pos: [10.05, 0, 0], scale: 0.22 });
      for (const side of [-1, 1]) {
        const n = neon(b.sign, { size: 0.36, color: b.signColor, switched: true, width: 0.12 });
        n.position.set(side > 0 ? -n.textWidth / 2 : n.textWidth / 2, -0.75, side * 3.25);
        n.rotation.y = side > 0 ? 0 : Math.PI;
        n.traverse((o) => { if (o.isMesh) o.material = m.mat({ color: b.signColor, emissive: 1, ir: 0.8, uv: 0.8, switched: true }); });
        g.add(n);
      }
      if (b.dir < 0) g.rotation.y = Math.PI;
      g.position.y = b.y;
      g.scale.setScalar(1.5);
      m.group.add(g);
      m.withGhost();
      m.group.userData.dynamic = true;
      group.add(m.group);
      m.dispatch(0, new THREE.Vector3(b.x, 0, b.z));
      return { m, ...b };
    });

    // Sailing boats crossing the bay.
    const boats = [];
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? -1 : 1;
      const m = new Mover(new THREE.Vector3(dir * (0.12 + 0.05 * i) * C, 0, 0));
      m.add(G.box, { color: "#f4f1ea", ir: 0.5 }, { pos: [0, SEA + 0.3, 0], scale: [5, 0.8, 1.8] });
      m.add(G.box, { color: BRIGHT[i + 1], ir: 0.5 }, { pos: [0, SEA + 0.75, 0], scale: [5.05, 0.15, 1.85] });
      m.add(G.cyl, { color: "#e8e4dc", ir: 0.4 }, { pos: [0.3, SEA + 3.2, 0], scale: [0.06, 5, 0.06] });
      const sail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.35, SEA + 1.2, 0), new THREE.Vector3(0.35, SEA + 5.5, 0), new THREE.Vector3(2.6 * dir, SEA + 1.2, 0)]);
      sail.computeVertexNormals();
      m.add(sail, { color: i % 2 ? "#fff6e8" : "#ffd6e0", ir: 0.6, uv: 0.4, doubleSided: true });
      m.add(G.ball, { color: dir > 0 ? "#30ff60" : "#ff3030", emissive: 1, ir: 1, uv: 0.4, switched: true }, { pos: [0.3, SEA + 5.8, 0], scale: 0.12 });
      m.withGhost();
      m.group.userData.dynamic = true;
      group.add(m.group);
      const z = -200 - i * 30;
      m.dispatch(0, new THREE.Vector3(-150 + i * 70, 0, z));
      boats.push({ m, dir, z });
    }

    // Fireworks barge, and distant headlands with their own village lights.
    group.add(box(10, 1, 6, { color: "#2b2d33", ir: 0.3 }, [BARGE.x, SEA + 0.4, BARGE.z]));
    const fw = new Fireworks(group, flashes, { c: C });
    const log = new EventLog();
    let nextShell = 0, nextTwin = 0;
    const twins = [];
    for (const [x, z, s] of [[-260, -420, 60], [-120, -520, 40], [240, -460, 70], [330, -300, 45]]) {
      group.add(mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: "#6a5068", ir: 0.6 }), { pos: [x, SEA, z], scale: [s * 2.2, s * 0.5, s] }));
      for (let k = 0; k < 8; k++) {
        group.add(mesh(G.ball, mat({ color: "#ffd59a", emissive: 1, ir: 1, switched: true }), { pos: [x + (rand() - 0.5) * s * 2.6, SEA + 1 + rand() * 4, z + s * 0.75 + rand() * 4], scale: 0.5 }));
      }
    }

    // Shooting gallery on the end platform.
    const gallery = new Gallery(group, { origin: new THREE.Vector3(-20, 0, -132), width: 16, depth: 8, c: C, toast });
    const GALLERY_LINE = new THREE.Vector3(-20, 0, -130.8);

    const goals = [
      { group: "Sunset", text: "As the sun sets, watch the pier lights come on: all at once, but you see them ripple away from you", done: false, at: [0, 30, 0, 0.05], day: LIGHTS_ON - 0.07 },
      { group: "Fireworks", text: "From the middle of the pier, watch the twin shells burst together", done: false, at: [0, -118, 0, 0.25] },
      { group: "Fireworks", text: "Move to one side: now the nearer shell flashes first", done: false, at: [-26, -160, 0, 0.25] },
      { group: "Fireworks", text: "Notice the bang arrives long before the flash", done: false, at: [0, -166, 0, 0.3] },
      { group: "Rides", text: "Stand before the Ferris wheel: bent spokes, one side bluer, one redder", done: false, at: [-16, -122, 0, 0.12] },
      { group: "Rides", text: "Ride the roller coaster (E at its station, right of the stalls)", done: false, at: [24.4, -128, Math.PI, 0] },
      { group: "Rides", text: "Ride the Ferris wheel (E under it) and come off younger", done: false, at: [-16, -142, 0, 0] },
      { group: "Shooting gallery", text: "Knock down 5 targets: aim where they are, not where you see them (F to throw)", done: false, at: [-20, -130.8, 0, 0.02] },
      { group: "Lighthouse", text: "After dark, watch the lighthouse beam curl into a spiral over the sea", done: false, at: [10, -165, -0.61, 0.15] },
    ];
    let note = "Light here moves at 6 m/s, about a jog. The sun is setting; the fireworks start after dark.";
    let wheelWatch = 0, beamWatch = 0, lastLapS = 0, ridingLap = 0, lightsSeen = false;
    const fwd = new THREE.Vector3(), toward = new THREE.Vector3();

    // Ferris wheel seat: carried round with a gondola, which stays level.
    let wheelStart = null;
    const wheelSeat = {
      velocity: new THREE.Vector3(),
      r0: null,
      carry(p, t) {
        const a = angleOf(wr, t), c = Math.cos(a), s = Math.sin(a);
        const r = new THREE.Vector3(this.r0.x * c - this.r0.y * s, this.r0.x * s + this.r0.y * c, 0);
        p.set(WHEEL.x + r.x, WHEEL.y + r.y - 2.9, WHEEL.z); // seated, eyes just above the rim
        this.velocity.set(-r.y, r.x, 0).multiplyScalar(wr.uOmega.value);
      },
    };

    let riding = null;
    const seat = {
      velocity: new THREE.Vector3(),
      heading: null,
      carry: (p, t) => {
        const pt = carPath(0)(t);
        p.set(pt.x, pt.y - 0.25, pt.z);
        seat.velocity.copy(carVel(0, t));
        const tan = curve.getTangentAt(carS(0)(t) / prof.L);
        const heading = Math.atan2(-tan.x, -tan.z);
        if (seat.heading !== null) player.yaw += ((heading - seat.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        seat.heading = heading;
      },
    };
    const inStation = (t) => ((ct(t) % prof.T) + prof.T) % prof.T < 4;

    log.onSeen((e) => {
      const twin = twins.find((w) => w.events.includes(e));
      if (!twin) return;
      const [l, r] = twin.events;
      if (l.seenTau === null || r.seenTau === null) return;
      const gap = l.seenTau - r.seenTau, frame = l.frameTau - r.frameTau;
      const together = Math.abs(gap) < 0.12;
      note = together
        ? "The twin shells flashed together: from the middle of the pier, both are the same distance away."
        : `The ${gap < 0 ? "left" : "right"} shell flashed ${Math.abs(gap).toFixed(2)} s first, but they burst ${Math.abs(frame) < 0.12 ? "at the same moment" : `${Math.abs(frame).toFixed(2)} s apart`}.`;
      if (together && Math.abs(player.pos.x) < 1.2) goals[1].done = true;
      if (!together && Math.abs(gap) > 0.3) goals[2].done = true;
    });

    const env = {
      night: 0, stars: 0, clouds: DAY[0].clouds, sun: [-0.4, Math.sin(DAY[0].elev), -0.9], sunColor: DAY[0].sun, sky: DAY[0].sky, ground: DAY[0].ground,
      fog: DAY[0].fog, fogRange: [DAY[0].fogNear, DAY[0].fogFar], skyTop: DAY[0].top, skyHorizon: DAY[0].hor,
    };

    return {
      group,
      gallery,
      day,
      colliders,
      mirrorY: SEA,
      shadows: true,
      map: {
        paths: [
          { pts: Array.from({ length: 121 }, (_, i) => { const q = curve.getPointAt(i / 120); return [q.x, q.z]; }), color: "rgba(46, 196, 182, 0.9)", closed: true },
          { pts: [[WHEEL.x - WHEEL_R, WHEEL.z], [WHEEL.x + WHEEL_R, WHEEL.z]], color: "rgba(255, 107, 139, 0.95)" },
        ],
        rings: [
          { x: SWING.x, z: SWING.z, r: SWING_R, color: "rgba(255, 190, 11, 0.9)" },
          { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 3, color: "rgba(255, 240, 192, 0.9)", fill: true },
          { x: BARGE.x, z: BARGE.z, r: 3, color: "rgba(255, 120, 200, 0.8)", fill: true },
        ],
      },
      walk: [[-4.6, -120, 4.6, 44], [-31, -170, 31, -120], [-110, 40, 110, 57]],
      spawn: [0, 30, 0],
      env,
      ambience: "sea",
      post: { bloom: { strength: DAY[0].bloom[0], radius: 0.5, threshold: DAY[0].bloom[1] } },
      bloomNow: null,
      goals,
      log,
      tips: [
        "The sun sets over a few minutes. At dusk every light on the pier switches on at the same moment, but the news reaches you lamp by lamp at 6 m/s.",
        "Fireworks burst 70 m off the end of the pier. Their light takes over 10 seconds to get here; the bang takes a fifth of a second.",
        "The Ferris wheel's rim moves at 80% of light speed. Light from its rising and falling sides left at different times, so the spokes look bent.",
        "The kids running up and down the pier are going at half the speed of light.",
      ],
      get note() { return note; },
      onThrow(b) {
        if (player.pos.distanceTo(GALLERY_LINE) < 6) gallery.throwBall(b);
      },
      readouts() {
        const rows = [
          ["time of day", ["golden hour", "sunset", "dusk", "blue hour", "night"][Math.min(4, Math.floor(day.now * 5))]],
          ["wheel rim", "80% c"],
          ["coaster top", `${((prof.vMax / C) * 100).toFixed(0)}% c`],
          ["swings", "60% c"],
        ];
        if (player.pos.distanceTo(GALLERY_LINE) < 6) rows.push(["gallery score", `${gallery.score} from ${gallery.throws}`]);
        return rows;
      },
      action() {
        if (riding === wheelSeat) {
          return {
            label: "Step off the wheel",
            run: () => {
              riding = null;
              if (wheelSeat.rider) wheelSeat.rider.visible = true;
              player.alight();
              player.pos.set(WHEEL.x, 0, WHEEL.z + 4);
              sfx.alight();
              const ride = player.tau - wheelStart.tau, out = world.t - wheelStart.t;
              if (out - ride > 1) goals[6].done = true;
              toast(`${ride.toFixed(1)} s on your watch, ${out.toFixed(1)} s on the pier. You came off ${(out - ride).toFixed(1)} s younger.`, 8);
            },
          };
        }
        if (riding) return { label: "Step off the coaster", run: () => { riding = null; player.alight(); player.pos.set(24.4, 0, -131); sfx.alight(); } };
        if (Math.hypot(player.pos.x - WHEEL.x, player.pos.z - WHEEL.z) < 6) {
          return {
            label: "Ride the Ferris wheel",
            run: () => {
              const a = angleOf(wr, world.t);
              const best = cabinPivots.map((p0, i) => ({ p0, i, y: p0.x * Math.sin(a) + p0.y * Math.cos(a) })).sort((m, n) => m.y - n.y)[0];
              wheelSeat.r0 = best.p0;
              // Whoever was in this gondola hops out to make room.
              wheelSeat.rider = riders[best.i] ?? null;
              if (wheelSeat.rider) wheelSeat.rider.visible = false;
              riding = wheelSeat;
              wheelStart = { tau: player.tau, t: world.t };
              player.yaw = 0;
              player.pitch = -0.1;
              player.board(wheelSeat);
              sfx.board();
              toast("The rim moves at 80% of light speed. Look out to sea, then down at the pier as you swing round.", 7);
            },
          };
        }
        const near = Math.abs(player.pos.x - 24.4) < 3 && Math.abs(player.pos.z + 131) < 8;
        if (near && inStation(world.t)) {
          return {
            label: "Board the coaster",
            run: () => {
              const tan = curve.getTangentAt(carS(0)(world.t) / prof.L);
              player.yaw = Math.atan2(-tan.x, -tan.z);
              player.pitch = 0;
              riding = seat;
              seat.heading = null;
              player.board(seat);
              sfx.board();
              lastLapS = carS(0)(world.t);
              ridingLap = 0;
            },
          };
        }
        if (near) return { label: "Wait for the coaster to come in", run: () => {} };
        return null;
      },
      update({ eye, camera, t, dTau }) {
        // Sky, light and the moment the lamps come on.
        const p = day.apply(t);
        this.bloomNow = day.bloom;
        const lightsAt = day.timeOf(LIGHTS_ON);
        shared.uLightsOn.value = lightsAt;
        spiral.uSpiralColor.value.copy(beamColor).multiplyScalar(day.dark);

        strollers.update(t);
        strollers2.update(t);
        balloons.rotation.z = Math.sin(retardedTime(eye, new THREE.Vector3(2.4, 3, 26)) * 0.9) * 0.02;
        for (const b of blimps) {
          const x = b.m.at(t).x;
          if (b.dir > 0 ? x > 260 : x < -260) b.m.dispatch(t, new THREE.Vector3(b.dir > 0 ? -260 : 260, 0, b.z));
        }
        for (const b of boats) {
          const x = b.m.at(t).x;
          if (b.dir > 0 ? x > 180 : x < -180) b.m.dispatch(t, new THREE.Vector3(b.dir > 0 ? -180 : 180, 0, b.z));
        }
        cars.forEach((car, k) => {
          const path = carPath(k);
          const te = riding && k === 0 ? t : seenTimeOf(path, eye, t, 40);
          car.position.copy(path(te));
          const tan = curve.getTangentAt(carS(k)(te) / prof.L);
          car.lookAt(car.position.clone().add(tan));
          car.rotateY(Math.PI);
          car.sv.value.copy(carVel(k, te));
          car.visible = !(riding === seat && k === 0);
        });
        if (riding === seat) {
          const s = carS(0)(t);
          if (s < lastLapS - prof.L / 2) {
            goals[5].done = true;
            if (!ridingLap++) toast("A lap at up to 90% of light speed. At the bottom of the drop the whole bay crowds into a circle ahead.", 8);
          }
          lastLapS = s;
        }

        // The lights-on ripple, seen looking along the pier.
        camera.getWorldDirection(fwd);
        if (!lightsSeen && Math.abs(fwd.z) > 0.8 && Math.abs(eye.x) < 6) {
          const near = t - 5 / world.c, far = t - 60 / world.c;
          if (near >= lightsAt && far < lightsAt) {
            lightsSeen = true;
            goals[0].done = true;
            note = "Every lamp switched on at the same instant. The ones near you show it first; the far ones are still catching up.";
          }
        }

        // Lighthouse lamp flares when the beam that left it points at you.
        const toEye = Math.atan2(eye.z - LIGHTHOUSE.z, eye.x - LIGHTHOUSE.x);
        const te = retardedTime(eye, new THREE.Vector3(LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z));
        const dAng = (((BEAM_OMEGA * te - toEye) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        const flare = Math.exp(-((dAng / 0.12) ** 2)) * (0.3 + 0.7 * day.dark);
        lamp.scale.setScalar(0.9 + 2.5 * flare);
        lampMat.uniforms.uSpec.value.z = 0.5 + flare;

        // Fireworks once it's dark: a steady show, with twin shells now and then.
        const showAt = day.timeOf(SHOW_FROM);
        if (nextShell < showAt) nextShell = showAt;
        if (nextTwin < showAt + 8) nextTwin = showAt + 8;
        while (t + 12 > nextShell) {
          const at = new THREE.Vector3(BARGE.x + (fw.rand() - 0.5) * 60, 28 + fw.rand() * 16, BARGE.z + (fw.rand() - 0.5) * 16);
          fw.shell(BARGE.clone().setY(SEA + 1), at, nextShell);
          nextShell += 3 + fw.rand() * 3;
        }
        if (t + 12 > nextTwin) {
          TWIN.forEach((q) => fw.shell(new THREE.Vector3(q.x, SEA + 1, q.z), q, nextTwin, { color: "#ffd166", count: 180 }));
          twins.push({ t: nextTwin, events: [log.add("Left shell", nextTwin, TWIN[0], "twin"), log.add("Right shell", nextTwin, TWIN[1], "twin")] });
          if (twins.length > 6) twins.shift();
          nextTwin += 30;
        }
        fw.update(eye);
        if (!goals[3].done) {
          const b = fw.bangs.find((x) => x.heard && t >= x.t + x.at.distanceTo(eye) / world.c && x.at.distanceTo(eye) > 20);
          if (b) {
            goals[3].done = true;
            const d = b.at.distanceTo(eye);
            note = `That shell was ${d.toFixed(0)} m away: you heard it after ${(d / SOUND_SPEED).toFixed(2)} s and saw it ${(d / world.c).toFixed(1)} s after it burst.`;
          }
        }

        toward.subVectors(WHEEL, eye).normalize();
        if (eye.z > WHEEL.z && eye.distanceTo(WHEEL) < 40 && fwd.dot(toward) > 0.85 && !riding) wheelWatch += dTau;
        if (wheelWatch > 3) goals[4].done = true;
        toward.set(LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z).sub(eye).normalize();
        if (fwd.dot(toward) > 0.85 && day.dark > 0.6) beamWatch += dTau;
        if (beamWatch > 5) goals[8].done = true;
        gallery.update(t);
        if (gallery.score >= 5 && !goals[7].done) {
          goals[7].done = true;
          toast(`Five down in ${gallery.throws} throws. You were aiming metres ahead of what you could see.`, 7);
        }
        log.update(player, eye);
      },
    };
  },
};
