import * as THREE from "three";
import { box, G, mesh, rng } from "../geo.js";
import { mat, shared, sparkField } from "../shaders.js";
import { bolt, Flashes } from "../world.js";
import { building, Emitter, lampPost, neon, reflection, SOUND_SPEED, stringLights, surface } from "../earth.js";
import { Mover, taxi } from "../movers.js";
import { Train } from "../rail.js";
import { dopplerFactor, effects, gammaOf, retardedTime, world } from "../relativity.js";
import { kmh } from "../format.js";
import { blobShadow, personGeometry, personMat, randomLook } from "../people.js";
import { sfx } from "../audio.js";

// A rainy neon crossroads, and the hardest street in the world to cross:
// taxis at up to 85% of light speed, seen where they were, not where they are.
const C = 10; // light speed, m/s
const TAXI = 0.85; // the fast lanes, as a fraction of c
const AVE = 7; // half-width of the avenue
const WALK = 4.5; // sidewalk width
const LEN = 260; // the avenue runs z in [-LEN, LEN]
const LOOP = 230; // taxis run round a loop from -LOOP to LOOP, out of sight at the ends
// Two lanes each way: northbound (toward -z) on the east side, southbound on the
// west; the inner lanes are fast, the outer ones slower.
const LANES = [
  { x: 5.25, dir: -1, beta: 0.55, clumps: [2, 2] },
  { x: 1.75, dir: -1, beta: TAXI, clumps: [3, 2, 1] },
  { x: -1.75, dir: 1, beta: TAXI, clumps: [2, 3, 1] },
  { x: -5.25, dir: 1, beta: 0.55, clumps: [2, 1, 1] },
];
const CROSSING_Z = AVE + 1.8; // the zebra the crossing guard looks after
const SAFE_WINDOW = 3.2; // seconds the guard wants clear before she says GO
const SURGE_EVERY = 16; // power surges blink every lamp and sign at once
const SIGNAL = { green: 7, yellow: 2, red: 9 };

const NIGHT = {
  env: {
    night: 1, stars: 0, sun: [0.3, 0.6, -0.7], sunColor: [0.1, 0.1, 0.16], sky: [0.08, 0.07, 0.13], ground: [0.04, 0.03, 0.04],
    fog: "#1a1222", fogRange: [30, 240], skyTop: "#05040e", skyHorizon: "#2e1834",
  },
  post: { bloom: { strength: 0.6, radius: 0.5, threshold: 0.68 }, vignette: 0.4, warm: 0.02 },
};

// Every signal runs on the same clock. Phase of the cycle at world time t.
function signalAt(t) {
  const T = SIGNAL.green + SIGNAL.yellow + SIGNAL.red;
  const p = ((t % T) + T) % T;
  return p < SIGNAL.green ? "green" : p < SIGNAL.green + SIGNAL.yellow ? "yellow" : "red";
}
const surgeAt = (t) => { const p = ((t % SURGE_EVERY) + SURGE_EVERY) % SURGE_EVERY; return p > SURGE_EVERY - 0.9; };

function signalHead(group, x, z, rotY) {
  const g = new THREE.Group();
  g.add(box(0.15, 4.2, 0.15, { color: "#22252c", ir: 0.2, surface: "metal" }, [0, 2.1, 0]));
  g.add(box(0.5, 1.5, 0.45, { color: "#15171c", ir: 0.1, surface: "paint" }, [0, 4.6, 0]));
  const lamps = {};
  [["red", 5.05, "#ff3030"], ["yellow", 4.6, "#ffb020"], ["green", 4.15, "#30ff80"]].forEach(([k, y, c]) => {
    const m = mat({ color: c, emissive: 1, ir: 1.2, uv: 0.4, unique: true });
    g.add(mesh(G.sphere, m, { pos: [0, y, 0.24], scale: [0.16, 0.16, 0.05] }));
    lamps[k] = { m, color: new THREE.Color(c) };
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  group.add(g);
  const head = new THREE.Vector3(x, 4.6, z);
  return {
    head,
    show(state) {
      for (const [k, { m, color }] of Object.entries(lamps)) {
        const on = k === state;
        m.uniforms.uColor.value.copy(color).multiplyScalar(on ? 1 : 0.08);
        m.uniforms.uSpec.value.set(on ? 1.2 : 0.05, on ? 0.4 : 0.02, on ? 1 : 0.1);
      }
    },
  };
}

// A creature under an umbrella, built facing -z around its feet.
function umbrellaFolk(look, color, scale = 1) {
  const h = 1.5 * scale;
  return {
    geo: personGeometry(look, { scale }),
    parts: [
      [G.cyl, { color: "#2b2622", ir: 0.2 }, { pos: [0.28 * scale, h * 0.85, 0], scale: [0.02, h * 0.75, 0.02] }],
      [new THREE.ConeGeometry(0.85, 0.38, 14), { color, ir: 0.5, uv: 0.3, surface: "fabric" }, { pos: [0.28 * scale, h * 1.25, 0] }],
    ],
  };
}

// A cherry tree in a planter, pink against the neon.
function sakura(group, colliders, x, z, seed) {
  const r = rng(seed);
  colliders.push({ x, z, r: 0.85 });
  group.add(box(1.5, 0.6, 1.5, { color: "#3a3440", ir: 0.3, surface: "stone" }, [x, 0.48, z]));
  group.add(mesh(G.cyl, mat({ color: "#3a2a24", ir: 0.4, surface: "wood" }), { pos: [x, 2, z], scale: [0.16, 3, 0.16] }));
  const petals = mat({ color: "#ffb7d5", ir: 0.6, uv: 0.5, surface: "fabric", vary: 0.12 });
  for (let k = 0; k < 6; k++) {
    const a = k * 1.9 + r(), rr = 0.5 + r() * 0.6;
    group.add(mesh(G.sphere, petals, { pos: [x + Math.cos(a) * rr, 3.6 + r() * 0.9, z + Math.sin(a) * rr], scale: 0.75 + r() * 0.45 }));
  }
}

// A shop at street level: a glowing window, a door, and a striped awning.
function shopfront(group, lights, xf, z, facing, width, color, seed) {
  const r = rng(seed);
  const out = -facing; // toward the street
  const wz = z - width * 0.12, ww = width * 0.62;
  lights.add(box(0.06, 2.0, ww, { color, emissive: 0.32, ir: 0.6, uv: 0.4 }, [xf + out * 0.04, 1.35, wz]));
  for (let k = 0; k <= 3; k++) group.add(box(0.1, 2.1, 0.08, { color: "#1d1b22", surface: "paint" }, [xf + out * 0.07, 1.35, wz - ww / 2 + (k * ww) / 3]));
  group.add(box(0.1, 0.08, ww, { color: "#1d1b22", surface: "paint" }, [xf + out * 0.07, 2.38, wz]));
  group.add(box(0.06, 2.3, 1.1, { color: "#1d1b22", ir: 0.2, surface: "wood" }, [xf + out * 0.04, 1.33, z + width * 0.33]));
  const awn = ["#e8423f", "#2a8f6a", "#f2c14e", "#4a5fe8", "#c04ad8"][Math.floor(r() * 5)];
  const stripe = new THREE.Group();
  for (let k = 0; k < 8; k++) stripe.add(box(1.6, 0.06, width / 8, { color: k % 2 ? "#f4efe6" : awn, ir: 0.5, surface: "fabric" }, [0, 0, -width / 2 + (k + 0.5) * (width / 8)]));
  stripe.position.set(xf + out * 0.78, 2.85, z);
  stripe.rotation.z = out * -0.32;
  group.add(stripe);
  const glow = new THREE.Group();
  glow.userData.lamp = { pos: new THREE.Vector3(xf + out * 1.6, 1.6, z), color: new THREE.Color(color), range: 5.5, power: 0.45 };
  group.add(glow);
}

/** @type {import("../place.js").PlaceModule} */
export default {
  id: "city",
  title: "Neon Crossroads",
  tag: "light delay · Doppler · aberration",
  blurb: "Rain, neon, and the hardest street in the world to cross: taxis at 85% of light speed, seen where they were. Trust the crossing guard, not your eyes.",

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const lights = new THREE.Group();
    const rand = rng(23);
    const flashes = new Flashes();
    const colliders = []; // people and things you can't walk through

    // Wet asphalt mirrors every light; sidewalks are paved.
    group.add(surface({ color: "#1c1d24", water: 0.08, surface: "asphalt", ir: 0.15, uv: 0.1, flashes }, { y: 0, reflective: true }));
    const curb = { color: "#4c4d57", ir: 0.3, uv: 0.1, surface: "paving" };
    const edge = { color: "#8a8a92", ir: 0.3, surface: "stone" };
    const outer = AVE + WALK;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      group.add(box(WALK, 0.18, LEN - AVE, curb, [sx * (AVE + WALK / 2), 0.09, sz * (AVE + (LEN - AVE) / 2)]));
      group.add(box(140 - outer, 0.18, WALK, curb, [sx * (outer + (140 - outer) / 2), 0.09, sz * (AVE + WALK / 2)]));
      group.add(box(0.25, 0.2, LEN - AVE, edge, [sx * (AVE + 0.12), 0.1, sz * (AVE + (LEN - AVE) / 2)]));
      group.add(box(140 - outer, 0.2, 0.25, edge, [sx * (outer + (140 - outer) / 2), 0.1, sz * (AVE + 0.12)]));
    }
    // Lane markings: a double yellow line, white dashes between lanes, zebras.
    const white = { color: "#d8d6cc", emissive: 0.12, ir: 0.3, surface: "paint" };
    const yellow = { color: "#f2c14e", emissive: 0.15, ir: 0.4, surface: "paint" };
    for (const s of [-0.12, 0.12]) group.add(box(0.1, 0.02, 2 * LEN, yellow, [s, 0.01, 0]));
    for (let z = -LEN; z < LEN; z += 6) if (Math.abs(z + 1.5) > AVE + 4) for (const s of [-3.5, 3.5]) group.add(box(0.12, 0.02, 3, white, [s, 0.011, z + 1.5]));
    for (const s of [-1, 1]) for (let k = -6; k <= 6; k++) {
      group.add(box(0.8, 0.022, 3, white, [k * 1.1, 0.013, s * CROSSING_Z]));
      group.add(box(3, 0.022, 0.8, white, [s * CROSSING_Z, 0.013, k * 1.1]));
    }

    // Towers of brick and plaster, lit windows, and shops along the avenue.
    const winColors = ["#ffcf8a", "#bfe2ff", "#ffe6b0", "#ffd0a0", "#ffb0d8"];
    const towerLooks = [
      ["#5a3a34", "brick"], ["#3a3d48", "plaster"], ["#4a3848", "plaster"], ["#6a4436", "brick"], ["#2e3644", "plaster"], ["#58404a", "brick"],
    ].map(([color, surf], i) => ({ color, surface: surf, lit: 0.25 + (i % 3) * 0.1, window: winColors[i % winColors.length], seed: i, cell: [[1.6, 2.8], [2.1, 3.1], [1.8, 2.6]][i % 3] }));
    const look = () => towerLooks[Math.floor(rand() * towerLooks.length)];
    const shopColors = ["#ffd9a8", "#ffb3d9", "#a8f0ff", "#c4ffb0", "#ffe08a", "#d0b8ff"];
    let shopN = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let z = AVE + WALK + 1; z < LEN; ) {
        const d = 11 + rand() * 6, h = 14 + rand() * 46;
        group.add(building(sx * (outer + 6), sz * (z + d / 2), 12, d, h, look()));
        if (z < 110) shopfront(group, lights, sx * outer, sz * (z + d / 2), sx, d - 1.4, shopColors[shopN++ % shopColors.length], shopN);
        z += d + 0.3;
      }
      for (let x = outer + 1; x < 140; ) {
        const w = 11 + rand() * 6, h = 14 + rand() * 40;
        group.add(building(sx * (x + w / 2), sz * (outer + 6), w, 12, h, look()));
        x += w + 0.3;
      }
    }

    // Neon signs, each spilling its color onto the wet street.
    const signs = [
      ["HOTEL", [-(outer - 0.12), 7, -30], Math.PI / 2, "#ff4fa3"],
      ["NOODLES", [outer - 0.12, 4.6, -24], -Math.PI / 2, "#40e0ff"],
      ["BAR", [outer - 0.12, 6, 30], -Math.PI / 2, "#ffb020"],
      ["OPEN 24", [-(outer - 0.12), 4.2, 34], Math.PI / 2, "#7dff8a"],
      ["TAXI", [-(outer - 0.12), 3.6, 14], Math.PI / 2, "#ffd84a"],
      ["SLOWLIGHT", [-(outer - 0.12), 16, -70], Math.PI / 2, "#b48cff"],
      ["RAMEN", [outer - 0.12, 9, -80], -Math.PI / 2, "#ff6a4a"],
      ["ARCADE", [outer - 0.12, 7, 62], -Math.PI / 2, "#4fffd0"],
      ["KARAOKE", [-(outer - 0.12), 9, 76], Math.PI / 2, "#ff4fa3"],
      ["CINEMA", [-30, 8, -(outer - 0.12)], 0, "#ff4f6a"],
      ["MOTEL", [36, 6, outer - 0.12], Math.PI, "#4fffd0"],
      ["DONUTS", [-34, 5, outer - 0.12], Math.PI, "#ffb020"],
    ];
    const signMeshes = [];
    for (const [text, pos, rot, color] of signs) {
      const s = neon(text.replace(" ", ""), { pos, rotY: rot, size: text === "SLOWLIGHT" ? 0.55 : 0.34, color, width: 0.09 });
      const n = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)); // out of the wall
      const at = new THREE.Vector3(...pos).addScaledVector(n, 1).add(new THREE.Vector3(n.z * s.textWidth / 2, 0.6, -n.x * s.textWidth / 2));
      const power = text === "SLOWLIGHT" ? 0.9 : 0.6;
      s.userData.lamp = { pos: at, color: new THREE.Color(color), range: 7, power };
      lights.add(s);
      signMeshes.push({ s, pos: at, color: new THREE.Color(color), lamp: s.userData.lamp, power });
    }

    // Street lamps all along the avenue: they flicker together in a power surge.
    const lamps = [];
    for (let z = -LEN + 10; z < LEN; z += 16) {
      for (const sx of [-1, 1]) {
        const zz = z + (sx > 0 ? 8 : 0);
        if (Math.abs(zz) < outer) continue; // not in the crossings
        const p = lampPost(sx * (AVE + 0.6), zz, { h: 6, color: "#ffd9a0", range: 8, power: 0.75 });
        const bulb = p.children[1];
        bulb.material = mat({ color: "#ffd9a0", emissive: 1, ir: 1.2, uv: 0.2, unique: true });
        lights.add(p);
        lamps.push({ bulb, pos: new THREE.Vector3(sx * (AVE + 0.6), 6.2, zz), light: p.userData.lamp });
        colliders.push({ x: sx * (AVE + 0.6), z: zz, r: 0.15 });
      }
    }
    // Strings of bulbs zigzagging over the avenue near the crossroads.
    for (const z of [-40, -26, 24, 40, 56]) lights.add(stringLights([-(outer - 0.3), 8.5, z], [outer - 0.3, 8.5, z + 7], { n: 26, sag: 1.2, colors: ["#ff8fd8", "#ffd166", "#7fe8ff", "#b48cff"], size: 0.09, wire: "#1d1b22" }));

    // Traffic signals at the four corners, all on one clock.
    const signals = [
      signalHead(lights, AVE + 0.8, AVE + 0.8, 0), signalHead(lights, -(AVE + 0.8), -(AVE + 0.8), Math.PI),
      signalHead(lights, -(AVE + 0.8), AVE + 0.8, -Math.PI / 2), signalHead(lights, AVE + 0.8, -(AVE + 0.8), Math.PI / 2),
    ];

    // Cherry trees, vending machines and a noodle cart with steam.
    for (let z = 21; z < 110; z += 22) for (const sx of [-1, 1]) for (const sz of [-1, 1]) sakura(group, colliders, sx * (outer - 1.2), sz * (z + (sx > 0 ? 6 : 0)), z * 7 + sx * 3 + sz);
    for (const [x, z, rot, c] of [[-(outer - 0.5), -16, Math.PI / 2, "#5fa8ff"], [-(outer - 0.5), -17.2, Math.PI / 2, "#ff5a6a"], [outer - 0.5, 18, -Math.PI / 2, "#7dff8a"]]) {
      group.add(box(0.75, 1.9, 1.0, { color: "#e8e8ee", ir: 0.4, surface: "metal" }, [x, 1.05, z], [0, rot, 0]));
      colliders.push({ x, z, r: 0.55 });
      lights.add(box(0.05, 1.1, 0.8, { color: c, emissive: 0.9, ir: 0.5, uv: 0.6 }, [x + Math.sin(rot) * 0.4, 1.25, z + Math.cos(rot) * 0.4], [0, rot, 0]));
    }
    const CART = new THREE.Vector3(outer - 2.2, 0, -(outer + 9));
    group.add(box(2.2, 1.0, 1.2, { color: "#8a2a24", ir: 0.4, surface: "wood" }, [CART.x, 0.68, CART.z]));
    for (const dx of [-0.6, 0.6]) colliders.push({ x: CART.x + dx, z: CART.z, r: 0.7 });
    group.add(box(2.4, 0.1, 1.5, { color: "#3a2a20", ir: 0.4, surface: "wood" }, [CART.x, 2.4, CART.z]));
    for (const x of [-1, 1]) group.add(box(0.08, 1.4, 0.08, { color: "#3a2a20", surface: "wood" }, [CART.x + x * 1.05, 1.75, CART.z]));
    for (let k = 0; k < 3; k++) lights.add(mesh(G.sphere, mat({ color: "#ff5a3a", emissive: 0.9, ir: 1, uv: 0.2 }), { pos: [CART.x - 0.8 + k * 0.8, 2.15, CART.z - 0.7], scale: [0.18, 0.24, 0.18] }));
    group.add(mesh(personGeometry({ body: "#ffd166", belly: "#fff3c4", top: "hat", topColor: "#ffffff", eyes: "round", cheeks: true, wide: 1.1 }, { scale: 0.95 }), personMat(), { pos: [CART.x, 0.18, CART.z + 1.0], rot: [0, Math.PI, 0] }));
    const holes = [[-3.5, 0.05, -26], [3.5, 0.05, 34], [-3.5, 0.05, 78], [0, 0.05, -95], [-30, 0.05, 3.5], [44, 0.05, -3.5]];
    for (const [x, , z] of holes) group.add(mesh(G.cyl, mat({ color: "#26272c", ir: 0.2, surface: "metal" }), { pos: [x, 0.02, z], scale: [0.6, 0.04, 0.6] }));
    const steamVents = new Emitter(group, [...holes, [CART.x, 1.3, CART.z]], { every: 0.22, rise: 1.2, drift: [0.4, 0, 0.1], life: 5, color: "#9aa0b4", size: 1.2, intensity: 0.22 });

    // Folk walking under umbrellas, and a crowd waiting at each corner.
    const umbrellas = ["#e8423f", "#2a2a33", "#f2c14e", "#4a8fe8", "#ff8fd8", "#5ce1c6", "#f4efe6"];
    const walkers = [];
    for (let i = 0; i < 10; i++) {
      const north = i % 2 === 0;
      const m = new Mover(new THREE.Vector3(0, 0, (north ? -1 : 1) * (0.12 + 0.03 * (i % 3)) * C), { clip: [-60, -LEN, 60, LEN] });
      const x = (north ? 1 : -1) * (AVE + 1.6 + (i % 3) * 0.9);
      const f = umbrellaFolk(randomLook(rand), umbrellas[i % umbrellas.length], 0.9 + rand() * 0.2);
      m.group.add(mesh(f.geo, m.mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.2 }), { rot: [0, north ? 0 : Math.PI, 0] }));
      for (const [geo, opts, tr] of f.parts) m.add(geo, opts, tr);
      m.group.userData.dynamic = true;
      group.add(m.group);
      m.dispatch(0, new THREE.Vector3(x, 0.18, (rand() - 0.5) * LEN * 1.6));
      walkers.push({ m, north, x });
    }
    const crowds = { "-1": [], "1": [] }; // by side of the avenue
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) {
      if (sx < 0 && sz > 0 && k === 0) continue; // leave room for the crossing guard
      const x = sx * (AVE + 1.6 + (k % 2) * 1.2 + rand() * 0.4), z = sz * (CROSSING_Z + 2.0 + Math.floor(k / 2) * 1.2 + rand() * 0.5);
      colliders.push({ x, z, r: 0.42 });
      const f = umbrellaFolk(randomLook(rand), umbrellas[(k + (sx > 0 ? 3 : 0)) % umbrellas.length], 0.85 + rand() * 0.25);
      const g = new THREE.Group();
      g.add(mesh(f.geo, personMat()));
      for (const [geo, opts, tr] of f.parts) g.add(mesh(geo, mat(opts), tr));
      g.position.set(x, 0.18, z);
      g.rotation.y = (-sx * Math.PI) / 2 + (rand() - 0.5) * 0.5; // facing across the avenue
      g.userData.dynamic = true;
      group.add(g, blobShadow([x, 0.2, z], 0.45));
      crowds[sx].push({ g, phase: rand() * 6 });
    }

    // The crossing guard: she goes by the taxi timetable, not by her eyes.
    const GUARD = new THREE.Vector3(-(AVE + 0.95), 0.18, CROSSING_Z + 2.2);
    const guardBody = mesh(personGeometry({ body: "#ff9f40", belly: "#fff1c4", top: "hat", topColor: "#2a8f6a", eyes: "round", cheeks: true, wide: 1.15 }, { scale: 1.05, pose: "wave" }), personMat(), { pos: GUARD.toArray(), rot: [0, -Math.PI / 2, 0] });
    guardBody.userData.dynamic = true;
    group.add(guardBody, blobShadow([GUARD.x, 0.2, GUARD.z], 0.5));
    colliders.push({ x: GUARD.x, z: GUARD.z, r: 0.45 });
    group.add(box(0.36, 0.06, 0.62, { color: "#d8ff3a", emissive: 0.5, ir: 0.6 }, [GUARD.x + 0.02, 1.0, GUARD.z])); // a hi-vis sash
    group.add(mesh(G.cyl, mat({ color: "#e8e8ee", surface: "metal" }), { pos: [GUARD.x + 0.25, 1.55, GUARD.z - 0.45], scale: [0.025, 1.6, 0.025] }));
    const paddle = new THREE.Group();
    paddle.position.set(GUARD.x + 0.25, 2.55, GUARD.z - 0.45);
    paddle.rotation.y = Math.PI / 2; // facing across the avenue and back toward the curb
    const goMat = mat({ color: "#3bff8a", emissive: 0.35, ir: 0.8, uv: 0.6, doubleSided: true, unique: true });
    paddle.add(mesh(new THREE.CircleGeometry(0.48, 32), goMat));
    paddle.add(mesh(new THREE.TorusGeometry(0.48, 0.04, 6, 32), mat({ color: "#f4f1ea" })));
    // GO in letters; STOP as a no-entry bar, which reads from anywhere.
    const labels = { GO: new THREE.Group(), STOP: new THREE.Group() };
    for (const side of [1, -1]) {
      const n = neon("GO", { size: 0.11, color: "#ffffff", width: 0.045 });
      n.glow.uniforms.uSpec.value.z = 0.3; // readable, not a bloom of white
      n.position.set((-side * n.textWidth) / 2, -0.22, side * 0.02);
      n.rotation.y = side > 0 ? 0 : Math.PI;
      labels.GO.add(n);
    }
    labels.STOP.add(box(0.66, 0.16, 0.06, { color: "#ffffff", emissive: 0.3 }, [0, 0, 0]));
    paddle.add(labels.GO, labels.STOP);
    paddle.userData.dynamic = true;
    group.add(paddle);
    let guardGo = false;

    // A thunderstorm: strikes land out among the towers. Thunder (at 343 m/s)
    // reaches you long before the flash (at 10 m/s).
    const bolts = [0, 1, 2].map((k) => { const b = bolt(new THREE.Vector3(0, 0, 0), 30 + k, "#e6ecff"); group.add(b); return b; });
    let nextStrike = 9, strikeN = 0;
    const strikes = [];

    // An elevated train crossing over the avenue, and a billboard painted in
    // inks you can't see: infrared that shows when you run toward it,
    // ultraviolet when you run away.
    const VIADUCT_Z = -45, VY = 9;
    group.add(box(400, 0.8, 5, { color: "#3a3c44", ir: 0.2, surface: "stone" }, [0, VY - 0.4, VIADUCT_Z]));
    for (let x = -190; x <= 190; x += 14) if (Math.abs(x) > outer + 1) group.add(box(0.8, VY - 0.8, 0.8, { color: "#44464e", ir: 0.2, surface: "stone" }, [x, (VY - 0.8) / 2, VIADUCT_Z]));
    for (const s of [-0.75, 0.75]) group.add(box(400, 0.08, 0.08, { color: "#5a6a9a", emissive: 0.3, ir: 0.2, uv: 0.3, surface: "metal" }, [0, VY + 0.05, VIADUCT_Z + s]));
    const BOARD = new THREE.Vector3(0, VY + 4.2, VIADUCT_Z + 2.6);
    group.add(box(16, 4.4, 0.3, { color: "#121318", ir: 0.1, uv: 0.05 }, [0, BOARD.y, VIADUCT_Z + 2.4]));
    for (const dy of [2.25, -2.25]) group.add(box(16.4, 0.12, 0.12, { color: "#3a3d48", ir: 0.2, surface: "metal" }, [0, BOARD.y + dy, VIADUCT_Z + 2.6]));
    for (const [word, ink, dy] of [["FASTER", { ir: 3.2, uv: 0 }, 0.35], ["SLOWER", { ir: 0, uv: 3.2 }, -1.4]]) {
      const n = neon(word, { size: 0.42, color: "#000000", additive: true, width: 0.16, ...ink });
      n.position.set(-n.textWidth / 2, BOARD.y + dy - 0.2, VIADUCT_Z + 2.62);
      group.add(n);
    }
    let boardNear = false, boardFar = false;
    const el = new Train({ cars: 4, fraction: 0.8, z: VIADUCT_Z, clip: [-190, -300, 190, 300], look: { body: "#2a8f6a", roof: "#e8e4dc", trim: "#f2c14e", seed: 9 } });
    el.group.position.y = VY;
    group.add(el.group);
    el.dispatch(0, -120);
    let elRuns = 0;

    // Taxis, in clumps, round each lane's loop. Most are yellow; a few aren't.
    const cabs = [];
    const bodies = ["#f2c230", "#f2c230", "#f2c230", "#5ce1c6", "#ff8fd8", "#f4f1ea"];
    LANES.forEach((lane, li) => {
      let z = -LOOP + rand() * 60;
      for (const n of lane.clumps) {
        for (let k = 0; k < n; k++) {
          const m = new Mover(new THREE.Vector3(0, 0, lane.dir * lane.beta * C), { clip: [-60, -LEN - 20, 60, LEN + 20] });
          taxi(m, { heading: lane.dir < 0 ? 0 : Math.PI, body: lane.beta < 0.7 ? bodies[Math.floor(rand() * bodies.length)] : "#f2c230" }).withGhost();
          group.add(m.group);
          m.dispatch(0, new THREE.Vector3(lane.x, 0, z));
          cabs.push({ m, lane, li });
          z += 9 + rand() * 9;
        }
        z += (2 * LOOP) / lane.clumps.length - 10;
      }
    });
    group.add(lights);
    group.add(reflection(lights, 0, 0.45, { stretch: 2.2 }));
    cabs.forEach(({ m }) => group.add(reflection(m.group, 0, 0.45, { stretch: 2.2 })));

    // Rain: falling streaks, wrapped around you.
    const RAIN_V = 0.62 * C;
    const rain = sparkField(2600, { lines: true, periodic: true, wrap: [70, 0, 70], intensity: 0.32 });
    const rc = new THREE.Color("#a8b8d8");
    for (let i = 0; i < rain.count; i++) {
      const y0 = 18 + rand() * 6;
      rain.set({ origin: new THREE.Vector3(rand() * 70 - 35, y0, rand() * 70 - 35), vel: new THREE.Vector3(0.6, -RAIN_V, 0.2), birth: -rand() * 4, life: y0 / RAIN_V, color: rc, tail: 0.05 }, i);
    }
    group.add(rain);
    // Stars that circle your head when a taxi bonks you.
    const dizzy = sparkField(60, { gravity: 0, intensity: 2.2, ir: 0.4, uv: 0.4 });
    group.add(dizzy);

    // Your own cab ride.
    const ride = new Mover(new THREE.Vector3(0, 0, -TAXI * C), { clip: [-60, -LEN - 40, 60, LEN + 40] });
    taxi(ride, { body: "#f2c230" });
    ride.group.userData.dynamic = true;
    group.add(ride.group);
    const dash = new THREE.Group();
    dash.userData.dynamic = true;
    dash.add(ride.add(G.box, { color: "#15161a", ir: 0.1 }, { pos: [0, 0.72, -1.25], scale: [1.7, 0.3, 0.5] }));
    dash.add(ride.add(G.box, { color: "#ff5040", emissive: 1, ir: 1 }, { pos: [0.3, 0.9, -1.0], scale: [0.22, 0.07, 0.04] }));
    dash.add(ride.add(G.box, { color: "#2a2c33", ir: 0.1 }, { pos: [0, 1.6, -0.7], scale: [1.8, 0.05, 0.05] }));
    group.add(dash);
    dash.visible = false;
    let riding = false;
    const seat = {
      velocity: ride.vel,
      carry: (p, t) => {
        const q = ride.at(t);
        p.set(q.x - 0.45, -0.25, q.z + 0.4);
        if (q.z < -LEN + 15) end();
      },
    };
    const end = () => {
      riding = false;
      ride.group.visible = true;
      dash.visible = false;
      player.alight();
      player.pos.set(AVE + 1.5, 0, -LEN + 18);
      sfx.alight();
      toast("End of the avenue. Press T to go back to the crossroads.");
      ride.dispatch(world.t, new THREE.Vector3(1.75, 0, 1e5));
    };
    ride.dispatch(0, new THREE.Vector3(1.75, 0, 1e5));

    // Crossing the avenue: where you stepped off, and what you saw then.
    let lastCurb = 0, crossing = null, cheer = null, bonks = 0, crossings = 0;
    const curbOf = (p) => (p.x <= -AVE ? -1 : p.x >= AVE ? 1 : 0);
    const halfLength = (beta) => 2.2 / (effects.dilation ? gammaOf(beta) : 1);
    // Whether any taxi will be in the guard's zebra within the next few seconds.
    const clearAt = (t) => cabs.every(({ m }) => {
      const z = m.at(t).z, vz = m.vel.z, half = 1.5 + 2.4 + 1.2;
      const a = (CROSSING_Z - half - z) / vz, b = (CROSSING_Z + half - z) / vz;
      return Math.max(a, b) < 0 || Math.min(a, b) > SAFE_WINDOW;
    });

    const goals = [
      { group: "Crossing", text: "Step into the avenue when it looks clear… and get bonked", done: false, at: [-(AVE + 0.8), CROSSING_Z, -Math.PI / 2 + 0.6, 0] },
      { group: "Crossing", text: "Cross at the zebra when the crossing guard shows GO: she trusts the timetable, not her eyes", done: false, at: [-(AVE + 0.8), CROSSING_Z, -Math.PI / 2, 0] },
      { group: "Crossing", text: "Watch a fast taxi come at you, then leave: it races in at nearly 7× light speed and crawls away into the infrared", done: false, at: [AVE + 1.5, -20, Math.PI, 0] },
      { group: "Light delay", text: "Stand on the centre line in the middle of the crossroads: all four signals change together", done: false, at: [0, 0, 0, 0.1] },
      { group: "Light delay", text: "Look up the avenue during a power flicker: it rolls toward you", done: false, at: [-(AVE + 2), 40, 0, 0] },
      { group: "Light delay", text: "Hear thunder, then wait: the lightning comes seconds later", done: false, at: [-(AVE + 2), 14, 0, 0.35] },
      { group: "Fun", text: "Read the secret billboard on the bridge: run at it, then away and look back", done: false, at: [0, 30, 0, 0.15] },
      { group: "Fun", text: "Hail a taxi (E at the yellow TAXI sign) and ride up the avenue", done: false, at: [-(AVE + 0.6), 14, 0, 0] },
    ];
    let note = "Taxis here do up to 85% of light speed, and you see each one where it was when its light left it. Cross carefully.";
    let lastSurge = false;
    const cabWatch = { near: false };
    const fwd = new THREE.Vector3();

    const bonk = (cab, t, eye) => {
      bonks++;
      const q = cab.m.at(t);
      const snap = crossing?.snaps.get(cab);
      player.pos.x = (crossing?.from ?? (Math.sign(player.pos.x) || -1)) * (AVE + 0.9);
      player.u.set(0, 0, 0);
      player.v.set(0, 0, 0);
      crossing = null;
      sfx.horn(q);
      sfx.bonk();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        dizzy.set({ origin: eye.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3)), vel: new THREE.Vector3(-Math.sin(a) * 0.8, 0.15, Math.cos(a) * 0.8), birth: t, life: 1.4, color: new THREE.Color(i % 2 ? "#ffd166" : "#ffffff"), size: 0.07 });
      }
      for (const c of [...crowds["-1"], ...crowds["1"]]) c.gasp = t;
      note = snap && snap.seen > snap.real + 3
        ? `BONK! When you stepped out, that taxi looked ${Math.round(snap.seen)} m away. It was really ${Math.round(snap.real)} m away: its light was still on its way to you.`
        : "BONK! Taxis are always closer than they look here: you see each one where it was, not where it is.";
      if (!goals[0].done) {
        goals[0].done = true;
        toast("Bonked! Try the crossing guard by the zebra: she goes by the timetable, not by what she sees.", 8);
      }
    };

    return {
      group,
      cabs,
      walk: [[-outer, -LEN, outer, LEN], [-140, -outer, 140, outer]],
      colliders,
      spawn: [-(AVE + 1), CROSSING_Z + 7.5, -Math.PI / 4],
      env: NIGHT.env,
      ambience: "rain",
      post: NIGHT.post,
      goals,
      tips: [
        "A taxi coming at you is seen where it was. Its light and the taxi race toward you almost together, so in the fast lanes it looks nearly 7× farther away than it is, and seems to cover ground 7× faster than light.",
        "The crossing guard doesn't trust what she sees. She knows where every taxi really is from the timetable, and holds up GO only when the zebra will stay clear.",
        "The centre line is a safe spot: taxis pass on both sides.",
        "Every signal and every lamp switches at the same instant. You see the near ones first, so changes ripple outward from wherever you stand.",
        "Rain falls at 21.6 km/h here, more than half the speed of light. Run, and watch the streaks tilt toward you.",
      ],
      get note() { return note; },
      get guardGo() { return guardGo; },
      get bonks() { return bonks; },
      get crossings() { return crossings; },
      readouts() {
        const near = cabs.map((c) => ({ c, s: c.m.seen(player.eye) })).sort((a, b) => a.s.pos.distanceTo(player.eye) - b.s.pos.distanceTo(player.eye))[0];
        const toward = near ? near.c.m.vel.clone().normalize().dot(player.eye.clone().sub(near.s.pos).normalize()) : 0;
        const b = near ? near.c.lane.beta : TAXI;
        return [
          ["light speed", kmh(world.c)],
          ["taxis", `${(TAXI * 100).toFixed(0)}% c fast lanes · 55% slow`],
          ["nearest taxi looks", `${(b / (1 - b * toward)).toFixed(2)} c ${toward > 0 ? "toward you" : "away"}`],
          ["bonks / crossings", `${bonks} / ${crossings}`],
        ];
      },
      sound(eye) {
        if (riding) return { pos: eye, D: 1, riding: true };
        // You hear a taxi where it really is (sound is fast here), with an
        // ordinary sound Doppler shift.
        const near = cabs.map(({ m }) => ({ m, p: m.at(world.t) })).sort((a, b) => a.p.distanceTo(eye) - b.p.distanceTo(eye))[0];
        if (!near) return null;
        const toward = near.m.vel.dot(eye.clone().sub(near.p).normalize());
        return { pos: near.p, D: SOUND_SPEED / (SOUND_SPEED - toward), riding: false };
      },
      action() {
        if (riding) return { label: "Get out of the taxi", run: end };
        const atStand = player.pos.x < -AVE + 0.5 && player.pos.x > -outer && Math.abs(player.pos.z - 14) < 4;
        if (!atStand) return null;
        return {
          label: "Hail a taxi",
          run: () => {
            ride.dispatch(world.t, new THREE.Vector3(1.75, 0, Math.min(player.pos.z, 30)));
            riding = true;
            crossing = null;
            ride.group.visible = false;
            dash.visible = true;
            player.yaw = 0;
            player.pitch = 0;
            player.board(seat);
            sfx.board();
            goals[7].done = true;
            toast("Off you go at 85% of light speed. Look ahead: the whole street folds into a bright blue tunnel.", 8);
          },
        };
      },
      update({ eye, camera, t }) {
        steamVents.update(t);
        for (const w of walkers) {
          const z = w.m.at(t).z;
          if (w.north ? z < -LEN + 5 : z > LEN - 5) w.m.dispatch(t, new THREE.Vector3(w.x, 0.18, w.north ? LEN - 5 : -LEN + 5));
        }

        // Taxis go round their loop once their image has left the far end.
        for (const c of cabs) {
          const s = c.m.seen(eye);
          if (c.lane.dir < 0 ? s.pos.z < -LOOP - 15 : s.pos.z > LOOP + 15) c.m.dispatch(t, c.m.at(t).add(new THREE.Vector3(0, 0, -c.lane.dir * 2 * LOOP)));
        }

        // The crossing guard, and you crossing.
        guardGo = clearAt(t);
        goMat.uniforms.uColor.value.set(guardGo ? "#3bff8a" : "#ff3b3b");
        labels.GO.visible = guardGo;
        labels.STOP.visible = !guardGo;
        guardBody.rotation.z = guardGo ? Math.sin(t * 6) * 0.06 : 0;
        paddle.rotation.y = Math.atan2(eye.x - paddle.position.x, eye.z - paddle.position.z); // she holds it up to you
        const p = player.pos, side = curbOf(p);
        if (riding) { crossing = null; lastCurb = 0; }
        else if (side !== 0) {
          if (crossing && side !== crossing.from) {
            crossings++;
            cheer = { side, t };
            sfx.goal();
            if (crossing.viaGuard && !goals[1].done) {
              goals[1].done = true;
              note = "Made it! The guard knew where the taxis really were. What you see of a fast taxi is where it was a moment ago.";
            } else note = crossing.viaGuard ? "Safely across, on the guard's GO." : "Across, and not a scratch. Lucky, or clever?";
          }
          crossing = null;
          lastCurb = side;
        } else if (!crossing && lastCurb) {
          // Stepped off the curb: remember where every taxi looked, and was.
          const snaps = new Map(cabs.map((c) => [c, { seen: c.m.seen(eye).pos.distanceTo(eye), real: c.m.at(t).distanceTo(eye) }]));
          crossing = { from: lastCurb, t, viaGuard: guardGo && Math.abs(p.z - CROSSING_Z) < 3, snaps };
        }
        if (crossing && Math.abs(p.x) < AVE) {
          for (const c of cabs) {
            const q = c.m.at(t);
            if (Math.abs(p.x - q.x) < 0.95 + 0.4 && Math.abs(p.z - q.z) < halfLength(c.lane.beta) + 0.4) { bonk(c, t, eye); break; }
          }
        }
        // The crowds: a cheer on the side you reach, a gasp at a bonk.
        for (const [s, list] of Object.entries(crowds)) for (const c of list) {
          const cheering = cheer && String(cheer.side) === s && t - cheer.t < 1.6;
          const gasp = c.gasp !== undefined && t - c.gasp < 0.5;
          c.g.position.y = 0.18 + (cheering ? Math.abs(Math.sin((t - cheer.t) * 9 + c.phase)) * 0.3 : gasp ? Math.sin(((t - c.gasp) / 0.5) * Math.PI) * 0.2 : 0);
        }

        // Thunderstorm.
        if (t > nextStrike) {
          const b = bolts[strikeN++ % bolts.length];
          const sgn = rand() < 0.5 ? -1 : 1;
          const pos = rand() < 0.5
            ? new THREE.Vector3(sgn * (30 + rand() * 60), 0, (rand() - 0.5) * 30)
            : new THREE.Vector3((rand() - 0.5) * 30, 0, sgn * (50 + rand() * 90));
          b.position.copy(pos);
          b.strike = t;
          flashes.add(pos.clone().setY(0.5), t, "#dfe6ff");
          strikes.push({ pos, t, heard: false, seen: false });
          nextStrike = t + 14 + rand() * 14;
        }
        let glow = 0;
        for (const s of strikes) {
          const d = s.pos.distanceTo(eye);
          if (!s.heard && t >= s.t + d / SOUND_SPEED) { s.heard = true; sfx.strike(s.pos); s.heardAt = t; }
          const since = t - (s.t + d / world.c);
          if (since >= 0 && since < 0.6) glow = Math.max(glow, Math.exp(-since * 7) * (since % 0.12 < 0.07 ? 1 : 0.4));
          if (!s.seen && since >= 0) {
            s.seen = true;
            if (s.heardAt !== undefined && since < 1) {
              note = `Thunder first, then ${(d / world.c - d / SOUND_SPEED).toFixed(1)} s later the flash. Here, sound outruns light by a factor of 34.`;
              goals[5].done = true;
            }
          }
        }
        while (strikes.length > 6) strikes.shift();
        bolts.forEach((b) => b.update(eye));
        // The sky lights up when the flash's light reaches you.
        shared.uSky.value.setRGB(0.08 + glow * 0.9, 0.07 + glow * 0.95, 0.13 + glow * 1.1);
        shared.uSkyTop.value.set("#05040e").lerp(new THREE.Color("#8a96c8"), glow * 0.6);
        shared.uSkyHorizon.value.set("#2e1834").lerp(new THREE.Color("#b0b8e0"), glow * 0.6);

        el.update();
        if (el.centerAt(t) - el.halfLength > 200 && t > 0) el.dispatch(t, -200 - el.halfLength - (elRuns++ % 2) * 60);

        // Signals, lamps and signs show whatever their light says.
        let changed = false;
        signals.forEach((s) => {
          const st = signalAt(retardedTime(eye, s.head));
          s.show(st);
          if (s.last !== undefined && s.last !== st) changed = true;
          s.last = st;
        });
        const states = signals.map((s) => s.last);
        if (changed) {
          const together = states.every((x) => x === states[0]);
          if (together && Math.hypot(eye.x, eye.z) < 1.5) {
            goals[3].done = true;
            note = "From the very middle, all four signals are the same distance away, so their changes reach you together.";
          } else if (!together && !crossing) {
            note = "The signals all change at the same instant. The nearest one's news reaches you first.";
          }
        }
        for (const l of lamps) {
          const off = surgeAt(retardedTime(eye, l.pos));
          l.bulb.material.uniforms.uSpec.value.z = off ? 0.03 : 1;
          l.light.power = off ? 0 : 0.75;
          l.bulb.material.uniforms.uColor.value.set(off ? "#2a2018" : "#ffd9a0");
        }
        const surging = surgeAt(retardedTime(eye, new THREE.Vector3(eye.x, 6, eye.z - 40)));
        camera.getWorldDirection(fwd);
        if (surging && !lastSurge && Math.abs(fwd.z) > 0.8 && Math.abs(eye.x) < outer) {
          goals[4].done = true;
          note = "Every lamp blinked at the same moment. The wave you saw is just the news travelling up the street at 36 km/h.";
        }
        lastSurge = surging;
        for (const { s, pos, color, lamp, power } of signMeshes) {
          const off = surgeAt(retardedTime(eye, pos));
          s.glow.uniforms.uColor.value.copy(color).multiplyScalar(off ? 0.05 : 1);
          lamp.power = off ? 0 : power;
        }

        // The secret billboard.
        {
          const D = dopplerFactor(eye, player.v, BOARD);
          const toBoard = BOARD.clone().sub(eye).normalize();
          if (fwd.dot(toBoard) > 0.85 && eye.distanceTo(BOARD) < 90) {
            if (D > 1.3 && !boardNear) { boardNear = true; note = "Running at the bridge, its infrared ink shifts into view: FASTER."; }
            if (D < 0.8 && !boardFar) { boardFar = true; note = "Running away, the ultraviolet ink shifts down into view: SLOWER."; }
          }
          if (boardNear && boardFar && !goals[6].done) {
            goals[6].done = true;
            toast("Two messages in one billboard, painted in light just beyond each end of the rainbow. Your speed decides which one you see.", 9);
          }
        }

        // Watching a fast taxi come at you, then leave.
        for (const c of cabs) {
          if (c.lane.beta < 0.8) continue;
          const s = c.m.seen(eye);
          const d = s.pos.distanceTo(eye);
          const toEye = eye.clone().sub(s.pos).normalize();
          const toward = c.m.vel.clone().normalize().dot(toEye);
          const lookingAt = fwd.dot(toEye.clone().negate()) > 0.8;
          if (lookingAt && toward > 0.7 && d < 60 && d > 15) cabWatch.near = true;
          if (lookingAt && toward < -0.7 && d > 35 && cabWatch.near && !goals[2].done) {
            goals[2].done = true;
            note = "Coming at you it seemed to outrun light; going away it crawls, and its taillights slide down into the infrared and vanish.";
          }
        }
      },
    };
  },
};
