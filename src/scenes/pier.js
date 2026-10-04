import * as THREE from "three";
import { box, G, mesh, rng } from "../geo.js";
import { mat } from "../shaders.js";
import { EventLog } from "../events.js";
import { Flashes } from "../world.js";
import { birdGeometry, building, Fireworks, lampPost, orbiting, reflection, rotor, SOUND_SPEED, stringLights, surface } from "../earth.js";
import { Mover } from "../movers.js";
import { gammaOf, retardedTime, seenTimeOf, world } from "../relativity.js";
import { sfx } from "../audio.js";
import { Gallery } from "../gallery.js";

const C = 6; // light speed here, m/s
const SEA = -2.4;
const WHEEL = new THREE.Vector3(-16, 14.5, -146), WHEEL_R = 12;
const LIGHTHOUSE = new THREE.Vector3(70, 0, -250), LAMP_Y = 22, BEAM_OMEGA = 0.6;
const BARGE = new THREE.Vector3(0, SEA, -228);
const TWIN = [new THREE.Vector3(-36, 30, -224), new THREE.Vector3(36, 30, -224)];

const DUSK = {
  env: {
    night: 0, stars: 0, sun: [-0.55, -0.004, -0.83], sunColor: [0.75, 0.42, 0.3], sky: [0.2, 0.2, 0.32], ground: [0.14, 0.1, 0.1],
    fog: "#7a5568", fogRange: [90, 750], skyTop: "#101c3f", skyHorizon: "#d9714f",
  },
  post: { bloom: { strength: 0.75, radius: 0.5, threshold: 0.5 } },
};

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
  // Integrate a timetable: 4 s waiting in the station, then one lap.
  const ts = [0, 4], ss = [0, 0];
  let s = 0, t = 4;
  while (s < L) {
    const dt = 0.01;
    s += speed(s) * dt;
    t += dt;
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

function coasterCar(color) {
  const g = new THREE.Group();
  const sv = { value: new THREE.Vector3() };
  const m = (o) => mat({ ...o, sourceVel: sv });
  g.add(mesh(G.box, m({ color, ir: 0.4, uv: 0.2 }), { pos: [0, 0.55, 0], scale: [1.5, 0.7, 2] }));
  g.add(mesh(G.box, m({ color: "#1b1c22" }), { pos: [0, 0.95, 0.15], scale: [1.3, 0.35, 1.2] }));
  g.add(mesh(G.box, m({ color: "#fff2c8", emissive: 1, ir: 1, uv: 0.4 }), { pos: [0, 0.6, -1.02], scale: [1.2, 0.12, 0.05] }));
  g.add(mesh(G.box, m({ color: "#ff3030", emissive: 1, ir: 1 }), { pos: [0, 0.6, 1.02], scale: [1.2, 0.1, 0.05] }));
  g.sv = sv;
  g.userData.dynamic = true;
  return g;
}

export default {
  id: "pier",
  title: "Seaside Funfair",
  tag: "light delay · Doppler",
  blurb: "A pier at dusk. A Ferris wheel near light speed, a coaster, a spiralling lighthouse beam, and fireworks you hear before you see.",
  intro: true,
  tour: { from: [0, 30, 0], dir: [0, -1], length: 150 },

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const lights = new THREE.Group(); // glowing things, mirrored in the sea
    const flashes = new Flashes();
    const rand = rng(17);

    group.add(surface({ color: "#0d2a3f", water: true, flashes, ir: 0.15, uv: 0.2 }, { y: SEA, reflective: true }));

    // Shore: sand, a promenade, beach huts and a town climbing the hill.
    group.add(box(400, 1.6, 40, { color: "#c9a77c", ir: 0.6, uv: 0.2 }, [0, SEA - 0.2, 52]));
    group.add(box(240, 0.5, 18, { color: "#8b7d6e", ir: 0.4 }, [0, -0.25, 49]));
    const huts = ["#e85d5d", "#f2c14e", "#5db0e8", "#7fd17f", "#f28fb3", "#ffffff"];
    for (let i = 0; i < 22; i++) {
      const x = -105 + i * 10;
      if (Math.abs(x) < 8) continue;
      group.add(box(3, 2.6, 2.6, { color: huts[i % huts.length], ir: 0.5 }, [x, 1.3, 45]));
      group.add(box(3.4, 0.25, 3, { color: "#ffffff", ir: 0.5 }, [x, 2.7, 45]));
    }
    for (let i = 0; i < 26; i++) {
      const x = -130 + i * 10 + rand() * 4, z = 70 + rand() * 50, h = 6 + rand() * 14;
      group.add(building(x, z, 7 + rand() * 4, 7, h, { color: ["#c9b7a4", "#b9a08a", "#e2d3c1", "#a68f7a"][i % 4], lit: 0.35, seed: i, cell: [1.8, 2.6] }));
    }
    for (let x = -100; x <= 100; x += 12) lights.add(lampPost(x, 41, { h: 4.2 }));

    // The pier, its pilings, railings, lamps and strings of bulbs.
    const plank = { color: "#6e5440", ir: 0.6, uv: 0.1, grid: { color: "#4e3a2c", spacing: 0.7, width: 1, glow: 0 } };
    group.add(box(10, 0.5, 164, plank, [0, -0.25, -38]));
    group.add(box(64, 0.5, 52, plank, [0, -0.25, -146]));
    for (let z = 40; z >= -170; z -= 8) {
      for (const x of z > -118 ? [-4.6, 4.6] : [-31, -15, 0, 15, 31]) group.add(box(0.5, 6, 0.5, { color: "#3a2c22", ir: 0.4 }, [x, -3.2, z]));
    }
    const rail = { color: "#e9e1d4", ir: 0.5, uv: 0.2 };
    for (const x of [-4.9, 4.9]) group.add(box(0.12, 0.12, 160, rail, [x, 1.05, -40]));
    for (let z = 40; z > -120; z -= 2) for (const x of [-4.9, 4.9]) group.add(box(0.08, 1.05, 0.08, rail, [x, 0.52, z]));
    let prev = null;
    for (let z = 36; z > -118; z -= 10) {
      const side = (z / 10) % 2 === 0 ? -4.6 : 4.6;
      lights.add(lampPost(side, z, { h: 4 }));
      if (prev) lights.add(stringLights([prev[0], 4.2, prev[1]], [side, 4.2, z], { n: 12, sag: 0.9 }));
      prev = [side, z];
    }

    // Stalls with striped awnings on the end platform.
    [[-27, -124, "#e85d5d"], [-6, -124, "#5db0e8"], [8, -124, "#f2c14e"]].forEach(([x, z, c]) => {
      group.add(box(5, 2.4, 3, { color: "#f4ece0", ir: 0.5 }, [x, 1.2, z]));
      for (let k = 0; k < 5; k++) group.add(box(1, 0.2, 3.6, { color: k % 2 ? "#ffffff" : c, ir: 0.5 }, [x - 2 + k, 2.7, z + 0.2]));
      lights.add(box(4.6, 0.12, 0.05, { color: "#ffd38a", emissive: 1, ir: 1 }, [x, 2.3, z + 1.55]));
    });

    // Ferris wheel: the rim moves at 80% of light speed.
    const wheelOmega = (0.8 * C) / WHEEL_R;
    const wr = rotor([WHEEL.x, WHEEL.y, WHEEL.z], [0, 0, 1], wheelOmega);
    const spin = (o) => mat({ ...o, rotor: wr });
    const steel = "#d9dde6";
    for (const dz of [-0.9, 0.9]) {
      const rim = mesh(new THREE.TorusGeometry(WHEEL_R, 0.16, 8, 160), spin({ color: steel, ir: 0.4, uv: 0.3 }), { pos: [WHEEL.x, WHEEL.y, WHEEL.z + dz] });
      group.add(rim);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const spoke = mesh(G.box, spin({ color: steel, ir: 0.4 }), { pos: [WHEEL.x + Math.cos(a) * WHEEL_R / 2, WHEEL.y + Math.sin(a) * WHEEL_R / 2, WHEEL.z + dz], scale: [WHEEL_R, 0.08, 0.08], rot: [0, 0, a] });
        group.add(spoke);
      }
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      lights.add(mesh(G.ball, spin({ color: ["#ffd38a", "#ff6b8a", "#8fd8ff", "#c7ff8a"][i % 4], emissive: 1, ir: 1, uv: 2.2 }), { pos: [WHEEL.x + Math.cos(a) * WHEEL_R, WHEEL.y + Math.sin(a) * WHEEL_R, WHEEL.z + 1.05], scale: 0.13 }));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pivot = [WHEEL.x + Math.cos(a) * WHEEL_R, WHEEL.y + Math.sin(a) * WHEEL_R, WHEEL.z];
      const gr = orbiting(wr, pivot);
      const cabin = new THREE.Group();
      cabin.add(mesh(G.box, mat({ color: ["#e85d5d", "#f2c14e", "#5db0e8"][i % 3], ir: 0.5, uv: 0.2, rotor: gr }), { pos: [pivot[0], pivot[1] - 1.4, pivot[2]], scale: [1.6, 1.4, 1.4] }));
      cabin.add(mesh(G.box, mat({ color: "#ffe2a8", emissive: 0.9, ir: 1, uv: 2.4, rotor: gr }), { pos: [pivot[0], pivot[1] - 1.3, pivot[2]], scale: [1.3, 0.5, 1.45] }));
      group.add(cabin);
      lights.add(cabin.children[1]);
    }
    for (const dz of [-2.2, 2.2]) for (const sx of [-1, 1]) {
      const foot = new THREE.Vector3(WHEEL.x + sx * 7, 0, WHEEL.z + dz);
      const leg = mesh(G.box, mat({ color: "#bfc4ce", ir: 0.4 }), { scale: [0.35, foot.distanceTo(WHEEL), 0.35] });
      leg.position.copy(foot).add(WHEEL).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), WHEEL.clone().sub(foot).normalize());
      group.add(leg);
    }
    group.add(mesh(G.sphere, mat({ color: "#ffd38a", emissive: 1, ir: 1 }), { pos: [WHEEL.x, WHEEL.y, WHEEL.z], scale: 0.7 }));

    // Roller coaster.
    const curve = new THREE.CatmullRomCurve3(TRACK.map((p) => new THREE.Vector3(...p)), true, "catmullrom", 0.4);
    const prof = coasterProfile(curve);
    const railMat = mat({ color: "#e8e3da", ir: 0.4, uv: 0.2 });
    for (const off of [-0.55, 0.55]) {
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const u = i / 600, p = curve.getPointAt(u), tan = curve.getTangentAt(u);
        const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        pts.push(p.clone().addScaledVector(side, off));
      }
      group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, 0.09, 6, true), railMat));
    }
    for (let i = 0; i < 90; i++) {
      const u = i / 90, p = curve.getPointAt(u);
      const ground = p.z < -170 ? SEA : 0;
      group.add(box(0.22, p.y - ground, 0.22, { color: "#bdb5a8", ir: 0.4 }, [p.x, (p.y + ground) / 2, p.z]));
      if (i % 3 === 0) lights.add(mesh(G.ball, mat({ color: i % 2 ? "#ff9a6b" : "#ffe1a0", emissive: 1, ir: 1 }), { pos: [p.x, p.y - 0.25, p.z], scale: 0.09 }));
    }
    group.add(box(4, 0.3, 14, { color: "#6e5440", ir: 0.5 }, [24.4, 0.6, -131]));
    group.add(box(4.2, 0.12, 0.12, { color: "#ffd38a", emissive: 1 }, [24.4, 3.4, -131]));
    lights.add(box(0.12, 0.12, 14, { color: "#ffd38a", emissive: 1, ir: 1 }, [26.4, 3.2, -131]));
    const cars = ["#e85d5d", "#f2c14e", "#5db0e8"].map((c) => { const car = coasterCar(c); group.add(car); return car; });
    const carS = (k) => (t) => ((prof.sAt(t) - k * 2.3) % prof.L + prof.L) % prof.L;
    const carPath = (k) => (t) => curve.getPointAt(carS(k)(t) / prof.L);
    const carVel = (k, t) => curve.getTangentAt(carS(k)(t) / prof.L).multiplyScalar(prof.speed(carS(k)(t)) * (((t % prof.T) + prof.T) % prof.T > 4 ? 1 : 0));

    // Lighthouse on a rock, its beam turning through the evening mist.
    group.add(mesh(new THREE.DodecahedronGeometry(9, 0), mat({ color: "#3b3a3f", ir: 0.4 }), { pos: [LIGHTHOUSE.x, SEA, LIGHTHOUSE.z], scale: [1.4, 0.6, 1.4] }));
    for (let i = 0; i < 6; i++) {
      group.add(mesh(G.cyl, mat({ color: i % 2 ? "#c9382f" : "#f2efe8", ir: 0.5 }), { pos: [LIGHTHOUSE.x, 1 + i * 3.2 + 1.6, LIGHTHOUSE.z], scale: [2.4 - i * 0.18, 3.2, 2.4 - i * 0.18] }));
    }
    group.add(mesh(G.cyl, mat({ color: "#22252c" }), { pos: [LIGHTHOUSE.x, LAMP_Y - 1.2, LIGHTHOUSE.z], scale: [2.2, 0.3, 2.2] }));
    const lampMat = mat({ color: "#fff3c4", emissive: 1, ir: 1.2, uv: 0.6, unique: true });
    const lamp = mesh(G.sphere, lampMat, { pos: [LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z], scale: 0.9 });
    lamp.userData.dynamic = true;
    group.add(lamp);
    lights.add(lamp);
    group.add(mesh(new THREE.ConeGeometry(1.4, 1.4, 12), mat({ color: "#22252c" }), { pos: [LIGHTHOUSE.x, LAMP_Y + 1.4, LIGHTHOUSE.z] }));
    const spiral = { uSpiral: { value: new THREE.Vector4(LIGHTHOUSE.x, LIGHTHOUSE.z, BEAM_OMEGA, 0.07) }, uSpiralColor: { value: new THREE.Color("#fff0c0") } };
    // The beam lies in a thin layer of sea mist at the lamp's height. From the
    // pier you see it edge-on as arcs; from the top of the Ferris wheel, as a spiral.
    const mist = mesh(new THREE.RingGeometry(2, 320, 360, 120), mat({ color: "#000000", unlit: true, additive: true, doubleSided: true, ir: 0, uv: 0, spiral }), { pos: [LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z], rot: [-Math.PI / 2, 0, 0] });
    mist.renderOrder = 4;
    group.add(mist);

    // Shooting gallery on the shore end of the pier, facing back along it.
    const gallery = new Gallery(group, { origin: new THREE.Vector3(-20, 0, -132), width: 16, depth: 8, c: C, toast });
    const GALLERY_LINE = new THREE.Vector3(-20, 0, -130.8);

    // Gulls circling over the pier, fast enough to look a little bent.
    const bird = birdGeometry(1.1);
    for (let i = 0; i < 9; i++) {
      const center = [(rand() - 0.5) * 60, 12 + rand() * 14, -60 - rand() * 120];
      const r = 8 + rand() * 14, speed = (0.25 + rand() * 0.25) * C * (i % 2 ? 1 : -1);
      const br = rotor(center, [0, 1, 0], speed / r);
      const a = rand() * Math.PI * 2;
      const pos = new THREE.Vector3(center[0] + Math.cos(a) * r, center[1], center[2] - Math.sin(a) * r);
      const gull = mesh(bird, mat({ color: "#e8e4dc", ir: 0.6, uv: 0.3, doubleSided: true, rotor: br }), { pos: pos.toArray() });
      gull.rotation.y = a + (speed > 0 ? 0 : Math.PI);
      group.add(gull);
    }

    // Little boats crossing the bay with their lights on.
    const boats = [];
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? -1 : 1;
      const m = new Mover(new THREE.Vector3(dir * (0.12 + 0.05 * i) * C, 0, 0));
      m.add(G.box, { color: "#f2efe8", ir: 0.5 }, { pos: [0, SEA + 0.3, 0], scale: [5, 0.8, 1.8] });
      m.add(G.box, { color: "#2a3a5a", ir: 0.4 }, { pos: [-0.6, SEA + 1.1, 0], scale: [2, 0.8, 1.4] });
      m.add(G.box, { color: "#ffd38a", emissive: 1, ir: 1, uv: 1 }, { pos: [-0.6, SEA + 1.15, 0.71], scale: [1.6, 0.3, 0.02] });
      m.add(G.ball, { color: dir > 0 ? "#30ff60" : "#ff3030", emissive: 1, ir: 1, uv: 0.4 }, { pos: [2.4, SEA + 1.6, 0], scale: 0.12 });
      m.add(G.cyl, { color: "#e8e4dc", ir: 0.4 }, { pos: [0.5, SEA + 2.2, 0], scale: [0.05, 3.2, 0.05] });
      m.withGhost();
      m.group.userData.dynamic = true;
      group.add(m.group);
      const z = -200 - i * 30;
      m.dispatch(0, new THREE.Vector3(-150 + i * 70, 0, z));
      boats.push({ m, dir, z });
    }

    // Fireworks barge.
    group.add(box(10, 1, 6, { color: "#2b2d33", ir: 0.3 }, [BARGE.x, SEA + 0.4, BARGE.z]));
    const fw = new Fireworks(group, flashes, { mirrorY: SEA, c: C });
    const log = new EventLog();
    let nextShell = 3, nextTwin = 14;
    const twins = [];

    group.add(lights);
    group.add(reflection(lights, SEA, 0.5));

    // Distant headlands.
    for (const [x, z, s] of [[-260, -420, 60], [-120, -520, 40], [240, -460, 70], [330, -300, 45]]) {
      group.add(mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: "#4a3b46", ir: 0.6 }), { pos: [x, SEA, z], scale: [s * 2.2, s * 0.5, s] }));
    }

    const goals = [
      { group: "Fireworks", text: "From the middle of the pier, watch the twin shells burst together", done: false, at: [0, -118, 0, 0.25] },
      { group: "Fireworks", text: "Move to one side: now the nearer shell flashes first", done: false, at: [-26, -160, 0, 0.25] },
      { group: "Fireworks", text: "Notice the bang arrives long before the flash", done: false, at: [0, -166, 0, 0.3] },
      { group: "Rides", text: "Stand before the Ferris wheel: bent spokes, one side bluer, one redder", done: false, at: [-16, -122, 0, 0.12] },
      { group: "Rides", text: "Ride the roller coaster (E at its station, right of the stalls)", done: false, at: [24.4, -128, Math.PI, 0] },
      { group: "Rides", text: "Ride the Ferris wheel (E under it) and come off younger", done: false, at: [-16, -142, 0, 0] },
      { group: "Shooting gallery", text: "Knock down 5 targets: aim where they are, not where you see them (F to throw)", done: false, at: [-20, -130.8, 0, 0.02] },
      { group: "Lighthouse", text: "Watch the lighthouse beam curl into a spiral over the sea", done: false, at: [10, -165, -0.61, 0.15] },
    ];
    let note = "Light here moves at 6 m/s, about a jog. Sound still moves at 343 m/s, so it wins every race.";
    let wheelWatch = 0, beamWatch = 0, lastLapS = 0, ridingLap = 0;
    const fwd = new THREE.Vector3(), toward = new THREE.Vector3();

    // Ferris wheel seat: carried round with a cabin, which stays upright.
    let wheelStart = null;
    const wheelSeat = {
      velocity: new THREE.Vector3(),
      r0: null,
      carry(p, t) {
        const a = wheelOmega * t, c = Math.cos(a), s = Math.sin(a);
        const r = new THREE.Vector3(this.r0.x * c - this.r0.y * s, this.r0.x * s + this.r0.y * c, 0);
        p.set(WHEEL.x + r.x, WHEEL.y + r.y - 2.75, WHEEL.z);
        this.velocity.set(-r.y, r.x, 0).multiplyScalar(wheelOmega);
      },
    };
    const cabinPivots = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 0); });

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
    const inStation = (t) => ((t % prof.T) + prof.T) % prof.T < 4;

    log.onSeen((e) => {
      const twin = twins.find((w) => w.events.includes(e));
      if (!twin) return;
      const [l, r] = twin.events;
      if (l.seenTau === null || r.seenTau === null) return;
      const gap = l.seenTau - r.seenTau, frame = l.frameTau - r.frameTau;
      const together = Math.abs(gap) < 0.12;
      note = together
        ? "The twin shells flashed together: from the middle of the pier, both are the same distance away."
        : `The ${gap < 0 ? "left" : "right"} shell flashed ${Math.abs(gap).toFixed(2)} s first, but taking out the light's travel time they burst ${Math.abs(frame) < 0.12 ? "at the same moment" : `${Math.abs(frame).toFixed(2)} s apart`}.`;
      if (together && Math.abs(player.pos.x) < 1.2) goals[0].done = true;
      if (!together && Math.abs(gap) > 0.3) goals[1].done = true;
    });

    return {
      group,
      gallery,
      walk: [[-4.6, -120, 4.6, 44], [-31, -170, 31, -120], [-110, 40, 110, 57]],
      spawn: [0, -60, 0],
      env: DUSK.env,
      ambience: "sea",
      post: DUSK.post,
      goals,
      log,
      tips: [
        "Fireworks burst near the barge, 70 m off the end of the pier. Their light takes over 10 seconds to get here; the bang takes a fifth of a second.",
        "The Ferris wheel's rim moves at 80% of light speed. Light from its rising side and falling side left at different times, so the spokes look bent.",
        "The lighthouse beam turns once every ten seconds, but its light crawls outward at 6 m/s, so the beam lies on the mist as a spiral.",
        "Ride the coaster and look around at the bottom of the drop: at 90% of light speed the whole bay squeezes forward.",
      ],
      get note() { return note; },
      onThrow(b) {
        if (player.pos.distanceTo(GALLERY_LINE) < 6) gallery.throwBall(b);
      },
      readouts() {
        const next = Math.min(nextShell, nextTwin) - world.t;
        if (player.pos.distanceTo(GALLERY_LINE) < 6) {
          return [
            ["gallery score", `${gallery.score}`],
            ["throws", `${gallery.throws}`],
            ["light delay to targets", `${(8 / world.c).toFixed(1)} s`],
            ["ball flight", `${(8 / (0.6 * world.c)).toFixed(1)} s`],
          ];
        }
        return [
          ["light speed", `${world.c.toFixed(1)} m/s`],
          ["wheel rim", `${(0.8 * 100).toFixed(0)}% c`],
          ["coaster top", `${((prof.vMax / C) * 100).toFixed(0)}% c`],
          ["twin shells in", `${Math.max(0, nextTwin - world.t).toFixed(0)} s`],
          ["next bang", next > 0 ? `${next.toFixed(1)} s` : "now"],
        ];
      },
      action() {
        if (riding === wheelSeat) {
          return {
            label: "Step off the wheel",
            run: () => {
              riding = null;
              player.alight();
              player.pos.set(WHEEL.x, 0, WHEEL.z + 4);
              sfx.alight();
              const ride = player.tau - wheelStart.tau, out = world.t - wheelStart.t;
              if (out - ride > 1) goals[5].done = true;
              toast(`Your ride lasted ${ride.toFixed(1)} s by your watch and ${out.toFixed(1)} s by the pier's clocks. You came off ${(out - ride).toFixed(1)} s younger.`, 9);
            },
          };
        }
        if (riding) return { label: "Step off the coaster", run: () => { riding = null; player.alight(); player.pos.set(24.4, 0, -131); sfx.alight(); } };
        if (Math.hypot(player.pos.x - WHEEL.x, player.pos.z - WHEEL.z) < 6) {
          return {
            label: "Ride the Ferris wheel",
            run: () => {
              // Hop into whichever cabin is passing closest to the bottom.
              const a = wheelOmega * world.t;
              const best = cabinPivots.map((p0) => ({ p0, y: p0.x * Math.sin(a) + p0.y * Math.cos(a) })).sort((m, n) => m.y - n.y)[0].p0;
              wheelSeat.r0 = best;
              riding = wheelSeat;
              wheelStart = { tau: player.tau, t: world.t };
              player.yaw = 0;
              player.pitch = -0.1;
              player.board(wheelSeat);
              sfx.board();
              toast("You're on a wheel whose rim moves at 80% of light speed. Look out to sea, then down at the pier as you swing round.", 8);
            },
          };
        }
        const near = Math.abs(player.pos.x - 24.4) < 3 && Math.abs(player.pos.z + 131) < 8;
        if (near && inStation(world.t)) {
          return {
            label: "Board the coaster",
            run: () => {
              const tan = curve.getTangentAt(carS(0)(world.t) / prof.L);
              player.yaw = Math.atan2(-tan.x, -tan.z); // face the way the car goes
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
        for (const b of boats) {
          const x = b.m.at(t).x;
          if (b.dir > 0 ? x > 180 : x < -180) b.m.dispatch(t, new THREE.Vector3(b.dir > 0 ? -180 : 180, 0, b.z));
        }
        // Coaster cars, each drawn where you see it.
        cars.forEach((car, k) => {
          const path = carPath(k);
          const te = riding && k === 0 ? t : seenTimeOf(path, eye, t, 40);
          car.position.copy(path(te));
          const tan = curve.getTangentAt(carS(k)(te) / prof.L);
          car.lookAt(car.position.clone().add(tan));
          car.rotateY(Math.PI);
          car.sv.value.copy(carVel(k, te));
        });
        if (riding) {
          const s = carS(0)(t);
          if (s < lastLapS - prof.L / 2) {
            goals[4].done = true;
            if (!ridingLap++) toast("A lap at up to 90% of light speed. At the bottom of the drop, everything ahead crowds into a bright, blue-shifted circle.", 9);
          }
          lastLapS = s;
        }

        // Lighthouse lamp flares when the beam that left it points at you.
        const toEye = Math.atan2(eye.z - LIGHTHOUSE.z, eye.x - LIGHTHOUSE.x);
        const te = retardedTime(eye, new THREE.Vector3(LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z));
        const dAng = (((BEAM_OMEGA * te - toEye) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        const flare = Math.exp(-((dAng / 0.12) ** 2));
        lamp.scale.setScalar(0.9 + 2.5 * flare);
        lampMat.uniforms.uSpec.value.z = 0.6 + flare;

        // Fireworks: a steady show, with twin shells now and then.
        while (t + 12 > nextShell) {
          const at = new THREE.Vector3(BARGE.x + (fw.rand() - 0.5) * 60, 28 + fw.rand() * 16, BARGE.z + (fw.rand() - 0.5) * 16);
          fw.shell(BARGE.clone().setY(SEA + 1), at, nextShell);
          nextShell += 3 + fw.rand() * 3;
        }
        if (t + 12 > nextTwin) {
          const color = "#ffd166";
          TWIN.forEach((p) => fw.shell(new THREE.Vector3(p.x, SEA + 1, p.z), p, nextTwin, { color, count: 180 }));
          twins.push({ t: nextTwin, events: [log.add("Left shell", nextTwin, TWIN[0], "twin"), log.add("Right shell", nextTwin, TWIN[1], "twin")] });
          if (twins.length > 6) twins.shift();
          nextTwin += 30;
        }
        fw.update(eye);
        if (!goals[2].done) {
          const b = fw.bangs.find((x) => x.heard && t >= x.t + x.at.distanceTo(eye) / world.c && x.at.distanceTo(eye) > 20);
          if (b) {
            goals[2].done = true;
            const d = b.at.distanceTo(eye);
            note = `That shell was ${d.toFixed(0)} m away: you heard it after ${(d / SOUND_SPEED).toFixed(2)} s, and saw it ${(d / world.c).toFixed(1)} s after it burst.`;
          }
        }

        camera.getWorldDirection(fwd);
        toward.subVectors(WHEEL, eye).normalize();
        if (eye.z > WHEEL.z && eye.distanceTo(WHEEL) < 40 && fwd.dot(toward) > 0.85 && !riding) wheelWatch += dTau;
        if (wheelWatch > 3) goals[3].done = true;
        toward.set(LIGHTHOUSE.x, LAMP_Y, LIGHTHOUSE.z).sub(eye).normalize();
        if (fwd.dot(toward) > 0.85) beamWatch += dTau;
        if (beamWatch > 5) goals[7].done = true;
        gallery.update(t);
        if (gallery.score >= 5 && !goals[6].done) {
          goals[6].done = true;
          toast(`Five down in ${gallery.throws} throws. You were aiming metres ahead of what you could see.`, 8);
        }
        log.update(player, eye);
      },
    };
  },
};
