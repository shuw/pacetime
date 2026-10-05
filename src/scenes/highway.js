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
    add("body", box, { color: "#f4f1ea", ir: 0.4, uv: 0.3 }, M(0, 1.95, cz, 2.8, 2.5, LEN));
    add("roof", box, { color: "#ff6b6b", ir: 0.5, uv: 0.4 }, M(0, 3.25, cz, 2.6, 0.18, LEN - 0.4));
    add("glow", box, { color: "#8fdcff", emissive: 0.55, ir: 0.6, uv: 1 }, M(0, 2.3, cz, 2.84, 0.62, LEN - 1.2));
    add("skirt", box, { color: "#2b2d33", ir: 0.2 }, M(0, 0.8, cz, 2.5, 0.4, LEN - 0.4));
    add("under", box, { color: "#ff5cf0", emissive: 1, ir: 0.6, uv: 1.2 }, M(0, 0.55, cz, 1.8, 0.06, LEN - 1));
    // Passengers at the windows, each side.
    for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) {
      const look = looks[(i * 7 + k * 3 + (sx > 0 ? 1 : 0)) % looks.length];
      add("p" + look, ball, { color: look, ir: 0.4, uv: 0.3 }, M(sx * 1.38, 2.32, cz - LEN / 2 + 1.6 + k * 2.6, 0.3, 0.3, 0.3));
    }
  }
  // A rounded nose with a headlight, and red lamps at the tail.
  const front = -((CARS - 1) / 2) * (LEN + GAP) - LEN / 2, back = -front;
  add("body", ball, { color: "#f4f1ea", ir: 0.4, uv: 0.3 }, M(0, 1.95, front, 1.4, 1.25, 3.2));
  add("head", ball, { color: "#fff6d8", emissive: 1, ir: 1, uv: 1 }, M(0, 1.9, front - 3.0, 0.35, 0.35, 0.35));
  add("body", ball, { color: "#f4f1ea", ir: 0.4, uv: 0.3 }, M(0, 1.95, back, 1.4, 1.25, 1.2));
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

/** @type {import("../place.js").PlaceModule} */
export default {
  id: "highway",
  title: "Endless Road",
  tag: "approaching light speed",
  blurb: "A road that never ends. Hold the throttle: 90%, 99%, 99.99%… of light speed, as the world folds into the way ahead. Race a train, and fire a pulse of light you can never catch.",

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    let base = 0; // the road's distance coordinate of local z = 0 (grows negative as you go)

    // Desert floor with the road painted on; it follows you.
    group.add(followDisc(2e5, mat({ color: "#1b1824", ir: 0.25, uv: 0.15, road: { half: 6, color: "#0c0c12", line: "#7fe8ff" } })));

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
    sky.add(mesh(new THREE.SphereGeometry(1, 96, 64), mat({ color: "#e0a36a", ir: 0.7, uv: 0.3 }), { pos: planetAt, scale: 62 }));
    sky.add(mesh(new THREE.RingGeometry(84, 128, 160, 3), mat({ color: "#c8b28a", ir: 0.4, uv: 0.3, doubleSided: true }), { pos: planetAt, rot: [-1.2, 0.35, 0.25] }));
    sky.add(mesh(new THREE.SphereGeometry(1, 48, 32), mat({ color: "#9fb4d8", ir: 0.4, uv: 0.4 }), { pos: [-120, 160, 470], scale: 11 }));
    group.add(sky);

    // The Comet tries to keep pace beside you. Its state lives in your own
    // frame, where it's nearly at rest, so it stays exact however close to
    // light speed you get: how far ahead it is (dz, metres) and its rapidity
    // relative to you (zeta). Speed up faster than its engines can and it
    // drops back; cruise and it catches up; brake hard and it shoots ahead.
    const cometU = { uVel: { value: new THREE.Vector3() }, uNow: { value: new THREE.Vector3() } };
    const train = cometTrain((o) => mat({ ...o, mover: cometU, comoving: true }));
    group.add(train);
    const DZ0 = 14; // where it likes to be: its middle a little ahead of you
    const comet = { dz: DZ0, zeta: 0, eta: 0 };

    // A small blue planet ahead and to the right. Racing toward it, it only
    // shrinks and slides toward the middle of the view.
    sky.add(mesh(new THREE.SphereGeometry(1, 64, 40), mat({ color: "#6fa8ff", ir: 0.4, uv: 0.6 }), { pos: [260, 140, -440], scale: 34 }));

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

    const alongside = () => Math.abs(comet.dz - DZ0) < 12 && Math.abs(comet.zeta) < 0.03;
    // Pulses of light you fire down the road (F). You only see one by the
    // dust it lights up, and that glow has to come back to you.
    const pulseMat = mat({ color: "#dff8ff", emissive: 0.9, ir: 0.6, uv: 1.2, pulse: true, additive: true, unlit: true, depthWrite: false });
    const hoopGeo = new THREE.TorusGeometry(1, 0.025, 8, 160);
    const HOOP = 6.5, STRIP = 40, LEN = 1.2; // hoop radius; strip columns; the pulse's length in your frame
    const pulses = [];
    const roadAt = () => -(base + player.pos.z); // how far along the road you are
    const ahead = () => Math.sqrt((2 - player.omb) / player.omb); // e^η: lengths ahead in your frame, per metre in the road's
    let cruiseFor = 0, lastEta = 0;
    const fire = () => {
      // Fired 1.5 m ahead of the nose in your frame: in the road's frame that
      // event is further ahead and a little later.
      const g = player.gamma;
      const strip = new THREE.Mesh(new THREE.BufferGeometry(), pulseMat);
      strip.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((STRIP + 1) * 6), 3));
      strip.geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array((STRIP + 1) * 6).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const idx = [];
      for (let i = 0; i < STRIP; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
      strip.geometry.setIndex(idx);
      const hoop = mesh(hoopGeo, pulseMat);
      for (const o of [hoop, strip]) { o.frustumCulled = false; o.userData.dynamic = true; o.renderOrder = 5; o.visible = false; group.add(o); }
      pulses.push({ sEm: roadAt() + g * 1.5, tEm: world.t + (g * player.beta * 1.5) / C, hoop, strip, slow: player.beta < 0.3, tau: player.tau, gap: null, rate: 0 });
      if (pulses.length > 4) {
        const old = pulses.shift();
        group.remove(old.hoop, old.strip);
        old.strip.geometry.dispose();
      }
      sfx.zap(player.eye);
    };
    const newest = () => pulses[pulses.length - 1];
    // In your own frame, how far ahead the pulse is.
    const gapOf = (p) => (p.sEm + C * (world.t - p.tEm) - roadAt()) * ahead();

    const goals = [
      { text: "Hold W (or click and hold) to speed up. Pass 90% of light speed", done: false, test: () => player.beta > 0.9 },
      { text: "Stop, and fire a pulse of light down the road (F): its glow seems to crawl away at half speed", done: false, test: () => { const p = newest(); return !!p && p.slow && player.beta < 0.3 && player.tau - p.tau > 2; } },
      { text: "Cruise above 99% with the Comet alongside: it looks perfectly ordinary", done: false, test: () => player.omb < 0.01 && alongside() },
      { text: "Brake hard (S) at speed and watch the Comet shoot ahead", done: false, test: () => comet.dz > DZ0 + 25 && player.beta > 0.5 },
      { text: "Pass 99.9%: the stars crowd into a ring ahead of you", done: false, test: () => player.omb < 1e-3 },
      { text: "Fire a pulse at 99.99% and chase it: it still pulls away at exactly light speed", done: false, test: () => { const p = newest(); return !!p && player.omb < 1e-4 && cruiseFor > 1.5 && Math.abs(p.rate - C) < 0.03 * C; } },
      { text: "Glance back (hold B) above 99%: behind you is almost empty", done: false, test: () => player.looking && player.omb < 0.01 },
      { text: "Cross 1,000 km of road before your watch shows a minute", done: false, test: () => -(base + player.pos.z) > 1e6 && player.tau < 60 },
    ];
    const dist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: m < 1e4 ? 1 : 0 })} km`);
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
    let note = "The road goes on forever. Hold W to speed up and Shift to push harder. S brakes; X (or the Walk button) drops you back to a walking pace.";
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
      post: { bloom: { strength: 0.8, radius: 0.5, threshold: 0.5 } },
      goals,
      tips: [
        "F fires a pulse of light down the road. You see it only by the dust it lights up, so from a standstill its glow seems to crawl away at half speed. Chase it at 99.99% and it still pulls away at exactly light speed, by your own watch and rulers.",
        "W speeds up, Shift pushes harder. S brakes to a stop in about two seconds from any speed. X, or clicking Walk, eases you back to a walking pace and coasts there.",
        "Each second on the throttle adds the same amount of rapidity. Speed is the tanh of rapidity, so you get ever closer to light speed without reaching it.",
        "At 99.9% almost everything you can see is squeezed into a small circle ahead. Glance back and the road behind has spread across the sky.",
        "Your watch and the world's clock drift apart by γ: at 99.999%, 224 world seconds for each of yours.",
        "The Comet on the next track tries to keep pace. When it's alongside, it's at rest relative to you and looks perfectly ordinary, however fast you're both going.",
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
          ["pulse ahead", newest() ? `${dist(gapOf(newest()))} (your frame)` : "none yet (F)"],
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
        // Your own change of speed shows up as the Comet's change relative to you.
        const c = world.c;
        comet.zeta -= player.eta - comet.eta;
        comet.eta = player.eta;
        const want = THREE.MathUtils.clamp(-(comet.dz - DZ0) / 4, -0.8 * c, 0.8 * c);
        const A = 0.55; // its engines, in rapidity per second
        comet.zeta += THREE.MathUtils.clamp(Math.atanh(want / c) - comet.zeta, -A * dTau, A * dTau);
        comet.zeta = Math.max(comet.zeta, -player.eta); // it doesn't run backwards
        comet.dz += c * Math.tanh(comet.zeta) * dTau;
        cometU.uVel.value.set(0, 0, -c * Math.tanh(comet.zeta));
        cometU.uNow.value.set(TRACK_X, 0, eye.z - comet.dz);
        const wasDone = goals.map((g) => g.done);

        // The pulses: the dust glowing in a hoop round the road, and in a band
        // across it, wherever the light reaching you now left it.
        cruiseFor = Math.abs(player.eta - lastEta) < 1e-9 ? cruiseFor + dTau : 0;
        lastEta = player.eta;
        const se = roadAt();
        for (const p of pulses) {
          const front = p.sEm + C * (t - p.tEm);
          const D = front - se, back = D - LEN / ahead();
          // Dust r metres from your line of sight that you see lit up right now.
          const seen = (r, d) => se + (d * d - r * r) / (2 * d);
          const sHoop = seen(HOOP, D);
          p.hoop.visible = t >= p.tEm && D > 0 && sHoop >= p.sEm;
          p.hoop.position.set(eye.x, eye.y, -sHoop - base);
          p.hoop.scale.setScalar(HOOP);
          const pos = p.strip.geometry.attributes.position;
          let any = false;
          for (let i = 0; i <= STRIP; i++) {
            const x = -6 + (12 * i) / STRIP, r = Math.hypot(x - eye.x, eye.y - 0.03);
            const s1 = seen(r, D), s0 = back > 0 ? Math.max(seen(r, back), p.sEm) : s1;
            const lit = t >= p.tEm && s1 >= p.sEm;
            any ||= lit;
            pos.setXYZ(2 * i, x, 0.03, -s1 - base);
            pos.setXYZ(2 * i + 1, x, 0.03, -(lit ? s0 : s1) - base);
          }
          pos.needsUpdate = true;
          p.strip.visible = any;
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
        if (goals[1].done && !wasDone[1]) note = "A pulse leaving at light speed seems to crawl away at half that: each bit of road it lights up has farther for its glow to come back.";
        if (goals[5].done && !wasDone[5]) note = `You're doing ${formatBeta(player.beta, player.omb)} of light speed, and the pulse still pulls away at ${Math.round(newest().rate * 3.6)} km/h: exactly light speed. Your clock runs slow and your rulers shrink by just enough.`;
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
