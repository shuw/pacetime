import * as THREE from "three";
import { box, G, mesh, rng } from "../geo.js";
import { mat, sparkField } from "../shaders.js";
import { Mover, taxi } from "../movers.js";
import { Train } from "../rail.js";
import { building, lampPost, neon, reflection, surface } from "../earth.js";
import { retardedTime, world } from "../relativity.js";
import { sfx } from "../audio.js";

const C = 10; // light speed, m/s
const TAXI = 0.85; // fraction of c
const AVE = 7; // half-width of the avenue
const WALK = 4; // sidewalk width
const LEN = 260; // the avenue runs z in [-LEN, LEN]
const SURGE_EVERY = 16; // power surges blink every lamp and sign at once
const SIGNAL = { green: 7, yellow: 2, red: 9 };

const NIGHT = {
  env: {
    night: 1, stars: 0, sun: [0.3, 0.6, -0.7], sunColor: [0.12, 0.12, 0.18], sky: [0.07, 0.07, 0.12], ground: [0.03, 0.025, 0.03],
    fog: "#120f18", fogRange: [25, 240], skyTop: "#04050b", skyHorizon: "#221626",
  },
  post: { bloom: { strength: 0.85, radius: 0.5, threshold: 0.55 } },
};

// Every signal runs on the same clock. Phase of the cycle at world time t.
function signalAt(t, offset = 0) {
  const T = SIGNAL.green + SIGNAL.yellow + SIGNAL.red;
  const p = (((t + offset) % T) + T) % T;
  return p < SIGNAL.green ? "green" : p < SIGNAL.green + SIGNAL.yellow ? "yellow" : "red";
}
const surgeAt = (t) => { const p = ((t % SURGE_EVERY) + SURGE_EVERY) % SURGE_EVERY; return p > SURGE_EVERY - 0.9; };

function signalHead(group, x, z, rotY) {
  const g = new THREE.Group();
  g.add(box(0.15, 4.2, 0.15, { color: "#22252c", ir: 0.2 }, [0, 2.1, 0]));
  g.add(box(0.5, 1.5, 0.45, { color: "#15171c", ir: 0.1 }, [0, 4.6, 0]));
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

export default {
  id: "city",
  title: "Neon Crossroads",
  tag: "light delay · Doppler · aberration",
  blurb: "Rain, neon and taxis at 85% of light speed that seem to outrun light coming toward you. Hail one and watch the city fold.",
  tour: { from: [-2, 120, 0], dir: [0, -1], length: 220 },

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const lights = new THREE.Group();
    const rand = rng(23);

    // Wet asphalt mirrors every light, sidewalks are dry-ish concrete.
    group.add(surface({ color: "#0b0c10", water: 0.12, ir: 0.15, uv: 0.1 }, { y: 0, reflective: true }));
    const curb = { color: "#3b3c42", ir: 0.3, uv: 0.1, grid: { color: "#2b2c31", spacing: 1.5, width: 1, glow: 0 } };
    // Four corner blocks of pavement, so the roads stay clear where they cross.
    const outer = AVE + WALK;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      group.add(box(WALK, 0.18, LEN - AVE, curb, [sx * (AVE + WALK / 2), 0.09, sz * (AVE + (LEN - AVE) / 2)]));
      group.add(box(140 - outer, 0.18, WALK, curb, [sx * (outer + (140 - outer) / 2), 0.09, sz * (AVE + WALK / 2)]));
    }
    // Lane markings and crosswalks.
    const paint = { color: "#9c988e", emissive: 0.08, ir: 0.3 };
    for (let z = -LEN; z < LEN; z += 6) if (Math.abs(z) > AVE + 3) group.add(box(0.15, 0.02, 3, paint, [0, 0.01, z + 1.5]));
    for (const s of [-1, 1]) for (let k = -6; k <= 6; k++) {
      group.add(box(0.8, 0.02, 3, paint, [k * 1.1, 0.012, s * (AVE + 1.8)]));
      group.add(box(3, 0.02, 0.8, paint, [s * (AVE + 1.8), 0.012, k * 1.1]));
    }

    // City blocks of towers with lit windows, and neon above the shops.
    const towers = ["#2a2d36", "#30303a", "#26272e", "#353a44", "#2c2a33"];
    const winColors = ["#ffcf8a", "#bfe2ff", "#ffe6b0", "#ffd0a0"];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // Along the avenue
      for (let z = AVE + WALK + 2; z < LEN; z += 14 + rand() * 8) {
        const h = 14 + rand() * 46, d = 10 + rand() * 4;
        group.add(building(sx * (AVE + WALK + 7), sz * (z + d / 2), 12, d, h, { color: towers[(z | 0) % 5], lit: 0.18 + rand() * 0.3, window: winColors[(z | 0) % 4], seed: z * sx + sz, cell: [1.6 + rand() * 0.6, 2.7 + rand() * 0.5] }));
      }
      // Along the cross street
      for (let x = AVE + WALK + 2; x < 140; x += 14 + rand() * 8) {
        const h = 14 + rand() * 40, w = 10 + rand() * 4;
        group.add(building(sx * (x + w / 2), sz * (AVE + WALK + 7), w, 12, h, { color: towers[(x | 0) % 5], lit: 0.18 + rand() * 0.3, window: winColors[(x | 0) % 4], seed: x * sz - sx, cell: [1.6 + rand() * 0.6, 2.7 + rand() * 0.5] }));
      }
    }
    const signs = [
      ["HOTEL", [-(AVE + WALK + 0.9), 7, -30], Math.PI / 2, "#ff4fa3"],
      ["NOODLES", [AVE + WALK + 0.9, 5, -24], -Math.PI / 2, "#40e0ff"],
      ["BAR", [AVE + WALK + 0.9, 6, 30], -Math.PI / 2, "#ffb020"],
      ["OPEN 24", [-(AVE + WALK + 0.9), 4, 22], Math.PI / 2, "#7dff8a"],
      ["TAXI", [-(AVE + WALK + 0.9), 3.4, 12], Math.PI / 2, "#ffd84a"],
      ["PACETIME", [-(AVE + WALK + 0.9), 16, -70], Math.PI / 2, "#b48cff"],
      ["RAMEN", [AVE + WALK + 0.9, 9, -80], -Math.PI / 2, "#ff6a4a"],
      ["CINEMA", [-30, 8, -(AVE + WALK + 0.9)], 0, "#ff4f6a"],
      ["MOTEL", [36, 6, AVE + WALK + 0.9], Math.PI, "#4fffd0"],
    ];
    const signMeshes = [];
    for (const [text, pos, rot, color] of signs) {
      const s = neon(text.replace(" ", ""), { pos, rotY: rot, size: text === "PACETIME" ? 0.55 : 0.32, color });
      lights.add(s);
      signMeshes.push({ s, pos: new THREE.Vector3(...pos), color: new THREE.Color(color) });
    }

    // Street lamps all along the avenue: they flicker together in a power surge.
    const lamps = [];
    for (let z = -LEN + 10; z < LEN; z += 16) {
      for (const sx of [-1, 1]) {
        const p = lampPost(sx * (AVE + 0.6), z + (sx > 0 ? 8 : 0), { h: 6, color: "#ffd9a0", range: 8, power: 0.85 });
        const bulb = p.children[1];
        bulb.material = mat({ color: "#ffd9a0", emissive: 1, ir: 1.2, uv: 0.2, unique: true });
        lights.add(p);
        lamps.push({ bulb, pos: new THREE.Vector3(sx * (AVE + 0.6), 6.2, z + (sx > 0 ? 8 : 0)), light: p.userData.lamp });
      }
    }

    // Traffic signals at the four corners, all on one clock.
    const signals = [
      signalHead(lights, AVE + 0.8, AVE + 0.8, 0), signalHead(lights, -(AVE + 0.8), -(AVE + 0.8), Math.PI),
      signalHead(lights, -(AVE + 0.8), AVE + 0.8, -Math.PI / 2), signalHead(lights, AVE + 0.8, -(AVE + 0.8), Math.PI / 2),
    ];

    // People waiting under umbrellas.
    const coats = ["#3a4a6a", "#6a3a3a", "#2f4f3f", "#5a4a3a"];
    for (let i = 0; i < 10; i++) {
      const sx = i % 2 ? 1 : -1, z = -60 + i * 13 + rand() * 4, x = sx * (AVE + 1.5 + rand() * 2);
      group.add(box(0.5, 1.5, 0.35, { color: coats[i % 4], ir: 0.4 }, [x, 0.95, z]));
      group.add(mesh(G.sphere, mat({ color: "#e0b898" }), { pos: [x, 1.85, z], scale: 0.2 }));
      group.add(box(0.03, 0.9, 0.03, { color: "#222" }, [x, 2.2, z]));
      group.add(mesh(new THREE.ConeGeometry(0.85, 0.4, 12), mat({ color: ["#e8423f", "#2a2a33", "#f2c14e", "#4a8fe8"][i % 4], ir: 0.4 }), { pos: [x, 2.65, z] }));
    }

    // An elevated train crossing over the avenue.
    const VIADUCT_Z = -45, VY = 9;
    group.add(box(400, 0.8, 5, { color: "#24262c", ir: 0.2 }, [0, VY - 0.4, VIADUCT_Z]));
    for (let x = -190; x <= 190; x += 14) if (Math.abs(x) > AVE + 1) group.add(box(0.8, VY - 0.8, 0.8, { color: "#2c2e35", ir: 0.2 }, [x, (VY - 0.8) / 2, VIADUCT_Z]));
    for (const s of [-0.75, 0.75]) group.add(box(400, 0.08, 0.08, { color: "#5a6a9a", emissive: 0.3, ir: 0.2, uv: 0.3 }, [0, VY + 0.05, VIADUCT_Z + s]));
    const el = new Train({ cars: 4, fraction: 0.8, z: VIADUCT_Z, clip: [-190, -300, 190, 300] });
    el.group.position.y = VY;
    group.add(el.group);
    el.dispatch(0, -120);
    let elRuns = 0;

    // Taxis: northbound on the east side, southbound on the west, never stopping.
    const cabs = [];
    for (let i = 0; i < 8; i++) {
      const north = i % 2 === 0;
      const m = new Mover(new THREE.Vector3(0, 0, (north ? -1 : 1) * TAXI * C), { clip: [-60, -LEN - 20, 60, LEN + 20] });
      taxi(m, { heading: north ? 0 : Math.PI, body: i === 3 ? "#f2f2f2" : "#f2c230" });
      group.add(m.group);
      const lane = north ? 3.6 : -3.6;
      m.dispatch(0, new THREE.Vector3(lane, 0, north ? LEN - (i / 2) * 120 : -LEN + ((i - 1) / 2) * 120));
      cabs.push({ m, north, lane });
    }
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

    // Your own cab ride.
    const ride = new Mover(new THREE.Vector3(0, 0, -TAXI * C), { clip: [-60, -LEN - 40, 60, LEN + 40] });
    taxi(ride, { body: "#f2c230" });
    ride.group.userData.dynamic = true;
    group.add(ride.group);
    // From inside: a dashboard and a fare meter, carried with you.
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
      ride.dispatch(world.t, new THREE.Vector3(3.6, 0, 1e5));
    };
    ride.dispatch(0, new THREE.Vector3(3.6, 0, 1e5));

    const goals = [
      { group: "Light delay", text: "Stand in the middle of the crossroads: all four signals change together", done: false, at: [0, 0, 0, 0.1] },
      { group: "Light delay", text: "Look down the avenue during a power flicker: it rolls toward you", done: false, at: [1, 40, 0, 0] },
      { group: "Moving lights", text: "Watch a taxi come at you: it seems to outrun light. Then watch it crawl away", done: false, at: [1.5, -20, Math.PI, 0] },
      { group: "Moving lights", text: "Watch a taxi's taillights fade out as it leaves: redshifted into infrared", done: false, at: [1.5, -20, Math.PI, 0] },
      { group: "Ride", text: "Hail a taxi (E at the yellow TAXI sign) and ride up the avenue", done: false, at: [-7.6, 12, 0, 0] },
    ];
    let note = "Light here moves at 10 m/s, slower than a sprinter. The taxis do 8.5 m/s, so you see them where they were seconds ago.";
    let lastSignal = null, lastSurge = false, cabWatch = { near: false, far: false };
    const fwd = new THREE.Vector3();

    return {
      group,
      cabs,
      walk: [[-(AVE + WALK), -LEN, AVE + WALK, LEN], [-140, -(AVE + WALK), 140, AVE + WALK]],
      spawn: [1, 14, 0],
      env: NIGHT.env,
      ambience: "rain",
      post: NIGHT.post,
      goals,
      tips: [
        "An approaching taxi is seen where it was. Its light and the taxi race toward you almost together, so it seems to cover ground nearly 6× faster than light.",
        "Every signal and every lamp switches at the same instant. You see the near ones first, so changes ripple outward from wherever you stand.",
        "A taxi heading away at 85% of light speed has its taillights shifted far into the infrared. They don't dim, they vanish.",
        "Rain falls at 6 m/s here, more than half the speed of light. Run, and watch the streaks tilt toward you.",
      ],
      get note() { return note; },
      readouts() {
        const near = cabs.map((c) => ({ c, s: c.m.seen(player.eye) })).sort((a, b) => a.s.pos.distanceTo(player.eye) - b.s.pos.distanceTo(player.eye))[0];
        const toward = near ? near.c.m.vel.clone().normalize().dot(player.eye.clone().sub(near.s.pos).normalize()) : 0;
        const apparent = TAXI / (1 - TAXI * toward);
        return [
          ["light speed", `${world.c.toFixed(1)} m/s`],
          ["taxis", `${(TAXI * 100).toFixed(0)}% c · ${(TAXI * C).toFixed(1)} m/s`],
          ["nearest taxi looks", `${apparent.toFixed(2)} c ${toward > 0 ? "toward you" : "away"}`],
          ["signals", signalAt(retardedTime(player.eye, signals[0].head))],
        ];
      },
      sound(eye) {
        const near = cabs.map(({ m }) => ({ m, s: m.seen(eye) })).sort((a, b) => a.s.pos.distanceTo(eye) - b.s.pos.distanceTo(eye))[0];
        if (riding) return { pos: eye, D: 1, riding: true };
        return near ? { pos: near.s.pos, D: near.m.doppler(eye, player.v), riding: false } : null;
      },
      action() {
        if (riding) return { label: "Get out of the taxi", run: end };
        const atStand = player.pos.x < -AVE + 0.5 && Math.abs(player.pos.z - 12) < 4;
        const atStand2 = player.pos.x > AVE - 0.5 && player.pos.z > 4 && player.pos.z < 30;
        if (atStand || atStand2) {
          return {
            label: "Hail a taxi",
            run: () => {
              ride.dispatch(world.t, new THREE.Vector3(3.6, 0, Math.min(player.pos.z, 30)));
              riding = true;
              ride.group.visible = false;
              dash.visible = true;
              player.yaw = 0;
              player.pitch = 0;
              player.board(seat);
              sfx.board();
              goals[4].done = true;
              toast("Off you go at 85% of light speed. Look ahead: the whole street folds into a bright blue tunnel.", 8);
            },
          };
        }
        return null;
      },
      update({ eye, camera, t }) {
        // Taxis loop once their image has left the far end of the avenue.
        for (const c of cabs) {
          const s = c.m.seen(eye);
          const gone = c.north ? s.pos.z < -LEN - 10 : s.pos.z > LEN + 10;
          if (gone) {
            const back = c.m.at(t);
            back.z = c.north ? LEN + 10 + rand() * 60 : -LEN - 10 - rand() * 60;
            c.m.dispatch(t, back);
          }
        }
        el.update();
        if (el.centerAt(t) - el.halfLength > 200 && t > 0) el.dispatch(t, -200 - el.halfLength - (elRuns++ % 2) * 60);

        // Signals and lamps show whatever their light says.
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
            goals[0].done = true;
            note = "From the very middle, all four signals are the same distance away, so their changes reach you together.";
          } else if (!together) {
            note = "The signals all change at the same instant. The nearest one's news reaches you first.";
          }
        }
        for (const l of lamps) {
          const off = surgeAt(retardedTime(eye, l.pos));
          l.bulb.material.uniforms.uSpec.value.z = off ? 0.03 : 1;
          l.light.power = off ? 0 : 0.85;
          l.bulb.material.uniforms.uColor.value.set(off ? "#2a2018" : "#ffd9a0");
        }
        const surging = surgeAt(retardedTime(eye, new THREE.Vector3(eye.x, 6, eye.z - 40)));
        camera.getWorldDirection(fwd);
        if (surging && !lastSurge && Math.abs(fwd.z) > 0.8 && Math.abs(eye.x) < AVE + WALK) {
          goals[1].done = true;
          note = "Every lamp blinked at the same moment. The wave you saw is just the news travelling up the street at 10 m/s.";
        }
        lastSurge = surging;
        for (const { s, pos, color } of signMeshes) {
          const off = surgeAt(retardedTime(eye, pos));
          s.glow.uniforms.uColor.value.copy(color).multiplyScalar(off ? 0.05 : 1);
        }

        // Taxi watching.
        for (const c of cabs) {
          const s = c.m.seen(eye);
          const d = s.pos.distanceTo(eye);
          const toEye = eye.clone().sub(s.pos).normalize();
          const toward = c.m.vel.clone().normalize().dot(toEye);
          const lookingAt = fwd.dot(toEye.clone().negate()) > 0.8;
          if (lookingAt && toward > 0.7 && d < 60 && d > 15) cabWatch.near = true;
          if (lookingAt && toward < -0.7 && d > 20 && cabWatch.near) {
            goals[2].done = true;
            if (d > 35) {
              goals[3].done = true;
            }
          }
        }
      },
    };
  },
};
