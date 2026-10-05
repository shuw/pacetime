import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { followDisc, G, mesh } from "../geo.js";
import { mat } from "../shaders.js";
import { world } from "../relativity.js";
import { sfx } from "../audio.js";
import { formatBeta, kmh } from "../format.js";

const C = 20; // light speed here, m/s
const L = 40; // one tile of road
const AHEAD = 24, BEHIND = 110; // tiles kept around you (most of what you see at speed is behind you)
const KM_TILES = 25; // a gate every kilometre
const BIOME_TILES = 125; // the scenery changes every 5 km

// A small integer hash, so every tile looks the same each time you pass it.
function hash(i, k = 0) {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(k + 1, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BIOMES = [
  { name: "Rainbow Arches", sky: "#7f9bff", rock: "#3a2f4a" },
  { name: "Pylon Fields", sky: "#ff9b6b", rock: "#4a2a2a" },
  { name: "Halo Plains", sky: "#7fffd0", rock: "#22383a" },
];

const TRACK_X = -11; // the Comet's track, left of the road

// The Comet: a six-car maglev, built around its own centre and facing -z.
// Parts are merged per material so it costs a handful of draw calls.
function cometTrain(material) {
  const parts = new Map();
  const add = (key, geo, opts, m) => {
    if (!parts.has(key)) parts.set(key, { opts, geos: [] });
    const g = geo.clone();
    g.applyMatrix4(m);
    parts.get(key).geos.push(g.index ? g.toNonIndexed() : g);
  };
  const M = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  const box = new THREE.BoxGeometry(1, 1, 1, 1, 1, 6), ball = new THREE.SphereGeometry(1, 16, 10);
  const looks = ["#ffbe0b", "#ff8fd8", "#5ce1c6", "#8338ec", "#3a86ff", "#fb5607"];
  const CARS = 6, LEN = 11.4, GAP = 0.7;
  for (let i = 0; i < CARS; i++) {
    const cz = (i - (CARS - 1) / 2) * (LEN + GAP);
    add("body", box, { color: "#f4f1ea", ir: 0.4, uv: 0.3, surface: "paint", rough: 0.25 }, M(0, 1.95, cz, 2.8, 2.5, LEN));
    add("roof", box, { color: "#ff6b6b", ir: 0.5, uv: 0.4, surface: "paint" }, M(0, 3.25, cz, 2.6, 0.18, LEN - 0.4));
    // A band of dark glass down each side, with a lit window per passenger.
    add("band", box, { color: "#1a1d2a", ir: 0.2, uv: 0.2, surface: "paint", rough: 0.08 }, M(0, 2.32, cz, 2.82, 0.78, LEN - 0.8));
    for (let k = 0; k < 4; k++) add("glow", box, { color: "#bfe6ff", emissive: 0.3, ir: 0.6, uv: 1 }, M(0, 2.32, cz - LEN / 2 + 2.1 + k * 2.4, 2.84, 0.6, 1.8));
    // A stripe of livery, and a door near each end.
    add("stripe", box, { color: "#ff5cf0", emissive: 0.25, ir: 0.5, uv: 0.8 }, M(0, 1.45, cz, 2.82, 0.14, LEN - 0.4));
    for (const dz of [-LEN / 2 + 0.7, LEN / 2 - 0.7]) for (const e of [-0.48, 0.48]) add("seam", box, { color: "#8a8780", ir: 0.3 }, M(0, 1.85, cz + dz + e, 2.83, 2.0, 0.035));
    add("skirt", box, { color: "#2b2d33", ir: 0.2, surface: "metal" }, M(0, 0.8, cz, 2.5, 0.4, LEN - 0.4));
    add("under", box, { color: "#ff5cf0", emissive: 1, ir: 0.6, uv: 1.2 }, M(0, 0.55, cz, 1.8, 0.06, LEN - 1));
    // Passengers at the windows, each side.
    for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) {
      const look = looks[(i * 7 + k * 3 + (sx > 0 ? 1 : 0)) % looks.length];
      add("p" + look, ball, { color: look, ir: 0.4, uv: 0.3 }, M(sx * 1.38, 2.32, cz - LEN / 2 + 2.1 + k * 2.4, 0.3, 0.3, 0.3));
    }
  }
  // A rounded nose with a headlight, and red lamps at the tail.
  const front = -((CARS - 1) / 2) * (LEN + GAP) - LEN / 2, back = -front;
  add("body", ball, { color: "#f4f1ea", ir: 0.4, uv: 0.3, surface: "paint", rough: 0.25 }, M(0, 1.95, front, 1.4, 1.25, 3.2));
  add("head", ball, { color: "#fff6d8", emissive: 1, ir: 1, uv: 1 }, M(0, 1.9, front - 3.0, 0.35, 0.35, 0.35));
  add("body", ball, { color: "#f4f1ea", ir: 0.4, uv: 0.3, surface: "paint", rough: 0.25 }, M(0, 1.95, back, 1.4, 1.25, 1.2));
  for (const sx of [-0.7, 0.7]) add("tail", ball, { color: "#ff2a2a", emissive: 1, ir: 1.2, uv: 0.2 }, M(sx, 2.1, back + 1.1, 0.18, 0.18, 0.18));
  const g = new THREE.Group();
  for (const { opts, geos } of parts.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), material(opts));
    m.frustumCulled = false;
    m.layers.set(2);
    g.add(m);
  }
  g.userData.dynamic = true;
  g.length = back - front + 4.4;
  return g;
}

function instanced(geo, opts, count) {
  const m = new THREE.InstancedMesh(geo, mat({ ...opts, unique: true }), count);
  m.frustumCulled = false;
  m.userData.dynamic = true;
  m.count = 0;
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  return m;
}

// Soft colour bands across a planet or its rings: `at` maps a vertex to a
// position through the list of colours.
function banded(geo, colors, at) {
  const p = geo.attributes.position, out = new Float32Array(p.count * 3), q = new THREE.Vector3();
  const cs = colors.map((c) => new THREE.Color(c)), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const f = at(q.fromBufferAttribute(p, i)), k = Math.floor(f), w = THREE.MathUtils.smoothstep(f - k, 0.3, 0.7);
    const n = cs.length, a = cs[((k % n) + n) % n], b = cs[(((k + 1) % n) + n) % n];
    c.copy(a).lerp(b, w);
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geo;
}

/** @type {import("../place.js").PlaceModule} */
export default {
  id: "highway",
  title: "Endless Road",
  tag: "approaching light speed",
  blurb: "A road that never ends. Hold the throttle: 90%, 99%, 99.99%… of light speed, as the world folds into the way ahead. Race a train, and chase a beam of light you can never catch.",

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    let base = 0; // the road's distance coordinate of local z = 0 (grows negative as you go)

    // Desert floor with the road painted on; it follows you.
    const ground = mat({ color: "#2a2433", ir: 0.25, uv: 0.15, road: { half: 6, color: "#24242f", line: "#7fe8ff" } });
    group.add(followDisc(2e5, ground));
    const P = 40000; // the ground's texture repeats every 40 km of road
    // The nearest street lamps light the road round you. They fade out at
    // speed, where they'd only flicker past.
    const lampLights = Array.from({ length: 8 }, () => {
      const o = new THREE.Group();
      o.userData.lamp = { pos: new THREE.Vector3(), color: new THREE.Color("#ffd9a0"), range: 12, power: 0 };
      group.add(o);
      return o.userData.lamp;
    });

    const n = AHEAD + BEHIND + 2;
    const arches = instanced(new THREE.TorusGeometry(7.5, 0.22, 10, 72, Math.PI), { color: "#ffffff", emissive: 1, ir: 0.8, uv: 1.2 }, n);
    const poles = instanced(new THREE.BoxGeometry(0.16, 5, 0.16, 1, 4, 1), { color: "#2b2d33", ir: 0.2 }, n * 4);
    const bulbs = instanced(new THREE.SphereGeometry(0.22, 12, 8), { color: "#ffe2a8", emissive: 1, ir: 1, uv: 0.6 }, n * 4);
    const pylons = instanced(new THREE.BoxGeometry(0.7, 22, 0.7, 1, 8, 1), { color: "#2a2433", ir: 0.3 }, n * 2);
    const beacons = instanced(new THREE.OctahedronGeometry(0.9, 0), { color: "#ffffff", emissive: 1, ir: 0.8, uv: 1 }, n * 2);
    const halos = instanced(new THREE.TorusGeometry(5, 0.3, 10, 64), { color: "#ffffff", emissive: 1, ir: 0.6, uv: 1.2 }, n);
    const rocks = instanced(new THREE.ConeGeometry(1, 1, 6, 3), { color: "#ffffff", ir: 0.5, uv: 0.2 }, n * 2);
    const towers = instanced(new THREE.BoxGeometry(1.6, 26, 1.6, 1, 8, 1), { color: "#2a2433", ir: 0.3 }, 16);
    const lintels = instanced(new THREE.BoxGeometry(32, 2.4, 1.6, 12, 1, 1), { color: "#ffb36b", emissive: 0.9, ir: 1, uv: 0.4 }, 8);
    const rails = instanced(new THREE.BoxGeometry(0.5, 0.16, L, 1, 1, 20), { color: "#ff5cf0", emissive: 0.5, ir: 0.4, uv: 0.8 }, n);
    const sleepers = instanced(new THREE.BoxGeometry(3.4, 0.12, L, 1, 1, 20), { color: "#2b2d33", ir: 0.2 }, n);
    const all = [arches, poles, bulbs, pylons, beacons, halos, rocks, towers, lintels, rails, sleepers];
    for (const m of all) group.add(m);

    // A ringed planet low in the sky behind you, too far away to get closer
    // to. Above 99.9% it swings round into view ahead.
    const sky = new THREE.Group();
    sky.follow = true;
    sky.userData.dynamic = true;
    const planetAt = [-250, 95, 430];
    sky.add(mesh(banded(new THREE.SphereGeometry(1, 96, 64), ["#f0c08a", "#c98a58", "#e8b07a", "#a8704a", "#f4d2a2"], (q) => q.y * 9 + Math.sin(q.x * 6 + q.z * 4) * 0.35), mat({ color: "#ffffff", vertexColors: true, ir: 0.7, uv: 0.3 }), { pos: planetAt, rot: [0.25, 0, 0.3], scale: 62 }));
    sky.add(mesh(banded(new THREE.RingGeometry(84, 128, 160, 24), ["#e2cfa8", "#a8906a", "#d8c09a", "#6a5a48", "#c8b28a"], (q) => Math.hypot(q.x, q.y) / 4.3), mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.3, doubleSided: true, opacity: 0.92 }), { pos: planetAt, rot: [-1.2, 0.35, 0.25] }));
    sky.add(mesh(new THREE.SphereGeometry(1, 48, 32), mat({ color: "#9fb4d8", ir: 0.4, uv: 0.4 }), { pos: [-120, 160, 470], scale: 11 }));
    group.add(sky);

    // The Comet runs on the next track at a steady 99% of light speed. Its
    // state lives in your own frame, so it stays exact however close to light
    // speed you get: how far ahead it is (dz, metres) and its rapidity relative
    // to you (zeta). Go faster and you overtake it; slower and it pulls away.
    const cometU = { uVel: { value: new THREE.Vector3() }, uNow: { value: new THREE.Vector3() } };
    const train = cometTrain((o) => mat({ ...o, mover: cometU, comoving: true }));
    group.add(train);
    const DZ0 = 14; // alongside: its middle a little ahead of you
    const ETA_C = Math.atanh(0.99); // the Comet's steady speed, as a rapidity
    const comet = { dz: -110, zeta: ETA_C };

    // A small blue planet ahead and to the right. Racing toward it, it only
    // shrinks and slides toward the middle of the view.
    sky.add(mesh(banded(new THREE.SphereGeometry(1, 64, 40), ["#4f8ef0", "#6fa8ff", "#e8f2ff", "#5a9aff", "#3f7ad8"], (q) => q.y * 4 + Math.sin(q.x * 5 + q.y * 7) * 0.8 + Math.sin(q.z * 9) * 0.4), mat({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.6 }), { pos: [260, 140, -440], scale: 34 }));

    // Your craft: a sleek nose ahead of you, carried along (so not bent).
    const cockpit = new THREE.Group();
    {
      const hood = new THREE.BufferGeometry();
      // A low wedge: wide at the windscreen, coming to a point ahead.
      const v = [-0.75, 0, 0, 0.75, 0, 0, 0, -0.06, -2.6, -0.75, -0.18, 0, 0.75, -0.18, 0, 0, -0.14, -2.6];
      hood.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      hood.setIndex([0, 2, 1, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
      hood.computeVertexNormals();
      const glow = mat({ color: "#7fe8ff", emissive: 1, unlit: true, comoving: true });
      const parts = [mesh(hood, mat({ color: "#3b4258", comoving: true, ir: 0.2, unlit: true }), { pos: [0, -0.55, -0.7] })];
      for (const sx of [-1, 1]) {
        const a = new THREE.Vector3(sx * 0.75, -0.55, -0.7), b = new THREE.Vector3(0, -0.61, -3.3);
        const edge = mesh(G.box, glow, { pos: a.clone().lerp(b, 0.5).toArray(), scale: [0.025, 0.025, a.distanceTo(b)] });
        edge.lookAt(edge.position.clone().add(b.clone().sub(a)));
        parts.push(edge);
      }
      for (const o of parts) { o.layers.set(2); o.renderOrder = 6; cockpit.add(o); }
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const right = new THREE.Vector3(1, 0, 0);
    const put = (m, x, y, z, s = [1, 1, 1], rot = null, color = null) => {
      const i = m.count++;
      if (rot) q.setFromAxisAngle(rot[0], rot[1]); else q.identity();
      m.setMatrixAt(i, m4.compose(v.set(x, y, z), q, sc.set(...s)));
      if (color) m.setColorAt(i, color);
    };

    // Lay out every tile from just behind the horizon ahead to far behind you.
    // Each tile's contents depend only on its number, so the road is the same
    // every time, however far you've come.
    const layout = () => {
      for (const m of all) m.count = 0;
      const here = Math.floor(-(base + player.pos.z) / L);
      for (let i = here - BEHIND; i <= here + AHEAD; i++) {
        const z = -i * L - base;
        const biome = Math.floor(hash(Math.floor(i / BIOME_TILES), 7) * BIOMES.length);
        put(rails, TRACK_X, 0.12, z - L / 2);
        put(sleepers, TRACK_X, 0.05, z - L / 2);
        for (const sx of [-1, 1]) for (const dz of [0, -L / 2]) {
          put(poles, sx * 8, 2.5, z + dz);
          put(bulbs, sx * 8, 5.15, z + dz);
        }
        if (biome === 0 && i % 2 === 0) put(arches, 0, 0, z, [1, 1, 1], null, col.setHSL(((i * 0.045) % 1 + 1) % 1, 0.85, 0.6));
        if (biome === 1) for (const sx of [-1, 1]) {
          put(pylons, sx * 13, 11, z);
          put(beacons, sx * 13, 22.9, z, [1, 1.6, 1], null, col.setHSL(0.03 + 0.1 * hash(i, sx + 3), 0.95, 0.6));
        }
        if (biome === 2 && i % 2 === 0) put(halos, 0, 9, z, [1, 1, 1], [right, Math.PI / 2], col.setHSL(0.42 + 0.12 * hash(i, 9), 0.8, 0.6));
        // Distant mesas and spires.
        for (const sx of [-1, 1]) {
          if (hash(i, sx + 11) < 0.4) {
            const dist = 60 + hash(i, sx + 21) * 500, h = 15 + hash(i, sx + 31) * 90, w = 10 + hash(i, sx + 41) * 40;
            const rock = BIOMES[biome].rock;
            put(rocks, sx * dist, h / 2 - 1, z - hash(i, sx + 51) * L, biome === 1 ? [w * 0.35, h * 1.4, w * 0.35] : [w, h, w], null, col.set(rock).offsetHSL(0, 0, hash(i, sx + 61) * 0.08));
          }
        }
        // A kilometre gate.
        if (((i % KM_TILES) + KM_TILES) % KM_TILES === 0) {
          for (const sx of [-1, 1]) put(towers, sx * 15, 13, z);
          put(lintels, 0, 25, z);
        }
      }
      for (const m of all) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    };

    const alongside = () => Math.abs(comet.dz - DZ0) < 60 && Math.abs(comet.zeta) < 0.3; // near it, within a few tenths of a percent of its speed
    // A beam of light along the right of the road (F): a beacon there sends
    // out pulse after pulse, each a few metres long, in the colours of the
    // rainbow. You see them only by the dust they light up, and that glow has
    // to come back to you, so for each bit of the beam we work out whether
    // the light reaching you now left it while a pulse was passing.
    const BEAM_X = 5.4, BEAM_Y = 1.1, BEAM_H = 0.45; // where the beam runs, and how tall its glow looks
    const SEG = 1.6, SPACE = 4; // each pulse's length, and the spacing of the pulses, in the road's frame
    const RAINBOW = ["#ff5a5a", "#ff9b3d", "#ffe45c", "#6dff8a", "#38d6ff", "#6f8bff", "#b48cff"].map((h) => new THREE.Color(h));
    const MAX_RUNS = 200;
    const segMat = mat({ color: "#ffffff", vertexColors: true, emissive: 0.9, ir: 0.6, uv: 1.2, pulse: true, additive: true, unlit: true, depthWrite: false, doubleSided: true });
    const segGeometry = () => {
      const geo = new THREE.BufferGeometry(), n = MAX_RUNS * 4;
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 0 ? -1 : 0)), 3));
      const idx = [];
      for (let i = 0; i < MAX_RUNS; i++) idx.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 1, 4 * i + 3, 4 * i + 2);
      geo.setIndex(idx);
      geo.setDrawRange(0, 0);
      return geo;
    };
    const pulses = [];
    const roadAt = () => -(base + player.pos.z); // how far along the road you are
    const ahead = () => Math.sqrt((2 - player.omb) / player.omb); // e^η: lengths ahead in your frame, per metre in the road's
    let cruiseFor = 0, lastEta = 0;
    const fire = (quiet = false) => {
      // Fired 1.5 m ahead of the nose in your frame: in the road's frame that
      // event is further ahead and a little later.
      // Pressing it again sets the beacon down afresh here.
      const g = player.gamma;
      const segs = new THREE.Mesh(segGeometry(), segMat);
      segs.frustumCulled = false; segs.userData.dynamic = true; segs.renderOrder = 5;
      const beacon = new THREE.Group();
      beacon.userData.dynamic = true;
      beacon.add(mesh(G.box, mat({ color: "#2b2d33", ir: 0.2, surface: "metal" }), { pos: [0, BEAM_Y / 2, 0], scale: [0.25, BEAM_Y, 0.25] }));
      beacon.add(mesh(G.sphere, mat({ color: "#ffffff", emissive: 1, ir: 1, uv: 1.5 }), { pos: [0, BEAM_Y, 0], scale: 0.28 }));
      group.add(segs, beacon);
      pulses.push({ sEm: roadAt() + g * 1.5, tEm: world.t + (g * player.beta * 1.5) / C, segs, beacon, slow: player.beta < 0.3, tau: player.tau, gap: null, rate: 0 });
      if (pulses.length > 1) {
        const old = pulses.shift();
        group.remove(old.segs, old.beacon);
        old.segs.geometry.dispose();
      }
      if (!quiet) sfx.zap(player.eye);
    };
    const newest = () => pulses[pulses.length - 1];
    fire(true); // the beam is always on: a beacon at the start of the road, which F moves to wherever you are
    // In your own frame, how far ahead the pulse is.
    const gapOf = (p) => (p.sEm + C * (world.t - p.tEm) - roadAt()) * ahead();
    // The road's-frame distance to the pulse that most recently passed you.
    const nextGap = () => { const g = newest().sEm + C * (world.t - newest().tEm) - roadAt(); return g < SPACE ? g : ((g % SPACE) + SPACE) % SPACE; };

    const goals = [
      { text: "Hold W (or click and hold) to speed up. Pass 90% of light speed", done: false, test: () => player.beta > 0.9 },
      { text: "Stand still and watch the rainbow light pulses on the right: they seem to crawl away at half speed", done: false, test: () => { const p = newest(); return !!p && p.slow && player.beta < 0.3 && player.tau - p.tau > 5; } },
      { text: "Catch the Comet (a steady 99% of light speed) and ride alongside: it looks perfectly ordinary", done: false, test: () => player.beta > 0.95 && alongside() },
      { text: "Brake hard (S) at speed and watch the Comet shoot ahead", done: false, test: () => comet.dz > DZ0 + 25 && player.beta > 0.5 },
      { text: "Pass 99.9%: the stars crowd into a ring ahead of you", done: false, test: () => player.omb < 1e-3 },
      { text: "Chase the beam at 99.99%: every pulse still pulls away at exactly light speed", done: false, test: () => { const p = newest(); return !!p && player.omb < 1e-4 && cruiseFor > 1.5 && Math.abs(p.rate - C) < 0.03 * C; } },
      { text: "Glance back (hold B) above 99%: behind you is almost empty", done: false, test: () => player.looking && player.omb < 0.01 },
      { text: "Cross 1,000 km of road before your watch shows a minute", done: false, test: () => -(base + player.pos.z) > 1e6 && player.tau < 60 },
    ];
    const dist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: m < 1e4 ? 1 : 0 })} km`);
    const fine = (m) => (m < 10 ? `${m.toFixed(m < 1 ? 2 : 1)} m` : dist(m));
    const fmtG = () => Math.round(player.gamma).toLocaleString("en-US");
    const perSecond = () => dist(Math.sqrt(player.u.lengthSq()));
    const milestones = [
      [1e-1, () => "90% of light speed. The lamps and arches ahead have pulled together, and the stars are crowding forward."],
      [1e-2, () => `99%. One second for you is about ${fmtG()} for the world outside.`],
      [1e-3, () => "99.9%. Everything you can see has crowded into the way ahead. Even the planet behind you has swung round into view."],
      [1e-4, () => `99.99%. Each of your seconds is more than a minute out there, and the road is ${fmtG()} times shorter than it looks standing still.`],
      [1e-5, () => `99.999%. Each tick of your watch you cover ${perSecond()} of road.`],
      [1e-7, () => `99.99999%. The road is ${fmtG()} times shorter to you than to the world. Light still passes you at exactly ${kmh(world.c)}.`],
      [1e-9, () => `Nine nines. ${perSecond()} per second of yours, and still not light speed.`],
    ];
    let note = "The road goes on forever: W speeds up, Shift pushes harder, S brakes. The rainbow pulses on the right are light. The train on the left, the Comet, does 99% of light speed.";
    let nextMilestone = 0, lastBiome = -1;

    return {
      group,
      rocket: true,
      fire,
      cockpit,
      noMap: true, // a straight line forever
      comet,
      walk: [[-5, -1e12, 5, 1e12]],
      spawn: [0, 0, 0],
      env: {
        vary: 0, night: 1, space: 1, sun: [0.55, 0.18, -0.82], sunColor: [0.5, 0.5, 0.6], sky: [0.06, 0.06, 0.1], ground: [0.02, 0.02, 0.03],
        fog: "#05060c", fogRange: [700, 6000], skyTop: "#000000", skyHorizon: "#000000",
      },
      post: { bloom: { strength: 0.6, radius: 0.4, threshold: 0.72 } },
      goals,
      tips: [
        "A beacon on the right of the road sends out rainbow pulses of light, and F moves it to wherever you are. You see the pulses only by the dust they light up, so from a standstill they seem to crawl away at half speed.",
        "Chase the pulses at 99.99%: from the roadside you're right on one's heels, yet from your seat it pulls away at exactly light speed. Your watch runs slow and your rulers shrink by just enough. At speed the pulses ahead spread out and the ones behind bunch up: the Doppler effect, in the spacing.",
        "The Comet on the next track runs at a steady 99% of light speed. Catch it and ride alongside and it looks perfectly ordinary. You can catch a train; you can never catch the light.",
        "W speeds up, Shift pushes harder. S brakes to a stop in about two seconds from any speed. X, or clicking Walk, eases you back to a walking pace and coasts there.",
        "Each second on the throttle adds the same amount of rapidity. Speed is the tanh of rapidity, so you get ever closer to light speed without reaching it.",
        "At 99.9% almost everything you can see is squeezed into a small circle ahead. Glance back and the road behind has spread across the sky.",
        "Your watch and the world's clock drift apart by γ: at 99.999%, 224 world seconds for each of yours.",
        "Planets never look stretched: a sphere stays round at any speed. What changes is where it appears, how big, and its colour and brightness. The road's edges stay straight because they run along your motion.",
        "Gentle (the default) shows the bending, colour and brightening as if you were going a little slower. In the Lab, True to life shows the real thing: at extreme speeds nearly everything goes dark apart from a ring ahead.",
        "The road is generated as you go and changes every 5 km. Keep going: it never ends.",
      ],
      get note() { return note; },
      readouts() {
        const km = -(base + player.pos.z) / 1000;
        const u = Math.sqrt(player.u.lengthSq());
        return [
          ["distance", `${km < 1000 ? km.toFixed(2) : Math.round(km).toLocaleString("en-US")} km`],
          ["per second of yours", `${u < 1000 ? u.toFixed(0) + " m" : (u / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " km"}`],
          ["light speed", kmh(world.c)],
          ["next light pulse", `${dist(nextGap() * ahead())} ahead of you`],
          ["from the roadside", `${fine(nextGap())} ahead`],
          ["the Comet", `99% c · ${dist(Math.abs(comet.dz - DZ0))} ${comet.dz > DZ0 ? "ahead" : "behind"}`],
          ["pulling away", newest() ? kmh(newest().rate) : "–"],
          ["scenery", BIOMES[lastBiome < 0 ? 0 : lastBiome].name],
        ];
      },
      // Keep you near the origin: when you're a tile or more along, move
      // everything back by whole tiles so numbers stay small and exact.
      rebase(p) {
        if (p.pos.z > -L) return 0;
        const k = Math.floor(-p.pos.z / L);
        const shift = k * L;
        p.pos.z += shift;
        base -= shift;
        return shift;
      },
      update({ eye, t, dTau }) {
        layout();
        ground.uniforms.uRoad.value.y = ((base % P) + P) % P;
        {
          const s0 = Math.floor(roadAt() / (L / 2)) * (L / 2), fade = 1 - THREE.MathUtils.smoothstep(player.beta, 0.25, 0.6);
          let k = 0;
          for (const ds of [-L / 2, 0, L / 2, L]) for (const sx of [-1, 1]) {
            const l = lampLights[k++];
            l.pos.set(sx * 8, 5.15, -(s0 + ds) - base);
            l.power = 0.9 * fade;
          }
        }
        // The Comet runs at a steady 99% of light speed; relative to you, the
        // difference of your rapidities. Once it's well out of sight it comes
        // round again: from behind if it's faster than you, from far ahead if you're faster.
        const c = world.c;
        comet.zeta = ETA_C - player.eta;
        comet.dz += c * Math.tanh(comet.zeta) * dTau;
        if (comet.dz > 1600 && comet.zeta > 0.01) comet.dz = -110;
        else if (comet.dz < -400 && comet.zeta < -0.01) comet.dz = 900;
        cometU.uVel.value.set(0, 0, -c * Math.tanh(comet.zeta));
        cometU.uNow.value.set(TRACK_X, 0, eye.z - comet.dz);
        const wasDone = goals.map((g) => g.done);

        // The beam: every stretch of it whose light reaching you now left it
        // while a pulse was passing, coloured by which pulse it was.
        cruiseFor = Math.abs(player.eta - lastEta) < 1e-9 ? cruiseFor + dTau : 0;
        lastEta = player.eta;
        const se = roadAt();
        for (const p of pulses) {
          p.beacon.position.set(BEAM_X, 0, -p.sEm - base);
          const r = Math.hypot(BEAM_X - eye.x, BEAM_Y - eye.y);
          const pos = p.segs.geometry.attributes.position, col = p.segs.geometry.attributes.color;
          let n = 0, run = null;
          const flush = () => {
            if (run && n < MAX_RUNS) {
              const c3 = RAINBOW[((run.k % RAINBOW.length) + RAINBOW.length) % RAINBOW.length];
              [[run.a, BEAM_Y - BEAM_H / 2], [run.a, BEAM_Y + BEAM_H / 2], [run.b, BEAM_Y - BEAM_H / 2], [run.b, BEAM_Y + BEAM_H / 2]].forEach(([sv, y], j) => {
                pos.setXYZ(4 * n + j, BEAM_X, y, -sv - base);
                col.setXYZ(4 * n + j, c3.r, c3.g, c3.b);
              });
              n++;
            }
            run = null;
          };
          const STEP = 0.1;
          for (let sv = Math.max(p.sEm, se - 400); sv <= se + 600; sv += STEP) {
            const te = t - Math.hypot(sv - se, r) / C; // when the light reaching you now left this bit of the beam
            const x = C * (te - p.tEm) - (sv - p.sEm); // how far behind the beam's front this bit was then
            const k = Math.floor(x / SPACE);
            const lit = x >= 0 && x - k * SPACE < SEG;
            if (lit && run && run.k === k) run.b = sv + STEP;
            else { flush(); if (lit) run = { a: sv, b: sv + STEP, k }; }
          }
          flush();
          pos.needsUpdate = true; col.needsUpdate = true;
          p.segs.geometry.setDrawRange(0, n * 6);
          // How fast it pulls away by your own watch, while you're cruising.
          const gap = gapOf(p);
          if (p.gap !== null && dTau > 0 && cruiseFor > 0.2) p.rate += ((gap - p.gap) / dTau - p.rate) * Math.min(1, dTau * 4);
          p.gap = gap;
        }
        const here = Math.floor(-(base + player.pos.z) / L);
        const biome = Math.floor(hash(Math.floor(here / BIOME_TILES), 7) * BIOMES.length);
        if (biome !== lastBiome) {
          if (lastBiome >= 0) toast(`${BIOMES[biome].name}`, 2);
          lastBiome = biome;
        }
        for (const g of goals) if (!g.done && g.test()) g.done = true;
        if (goals[1].done && !wasDone[1]) note = "Each pulse leaves at light speed but seems to crawl away at half that: each bit of road it lights up has farther for its glow to come back.";
        if (goals[5].done && !wasDone[5]) note = `You're doing ${formatBeta(player.beta, player.omb)} of light speed, and the pulses still pull away at ${Math.round(newest().rate * 3.6)} km/h: exactly light speed. Your clock runs slow and your rulers shrink by just enough.`;
        if (goals[2].done && !wasDone[2]) note = `The Comet is doing ${formatBeta(player.beta, player.omb)} of light speed too. Relative to you it's standing still, so it looks perfectly ordinary while the world around you bends.`;
        if (goals[3].done && !wasDone[3]) note = "You slowed down; the Comet kept going, so it shot ahead. Its back end looks squashed and reddened as it pulls away.";
        while (nextMilestone < milestones.length && player.omb < milestones[nextMilestone][0]) {
          note = milestones[nextMilestone][1]();
          sfx.ui();
          nextMilestone++;
        }
      },
    };
  },
};
