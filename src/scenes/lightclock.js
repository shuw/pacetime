import * as THREE from "three";
import { Train } from "../rail.js";
import { box, G, mesh, Wake } from "../geo.js";
import { mat } from "../shaders.js";
import { COSMIC, Flashes, lightClockFrame, marker, PALETTE, photonBall } from "../world.js";
import { gammaOf, retardedTime, seenTimeOf, world } from "../relativity.js";
import { carMarker, service, station } from "./common.js";

const P = 90;
const H = 2.4; // mirror separation
const BASE = 0.3;
const PLATFORM_CLOCK = new THREE.Vector3(0, 0, 7);
const ONBOARD = -3; // where the clock sits on the train, from its middle

// Height of a photon bouncing between the mirrors after `s` seconds of the clock's own time.
const bounce = (s) => {
  const p = ((world.c * s) % (2 * H) + 2 * H) % (2 * H);
  return BASE + (p < H ? p : 2 * H - p);
};
const ticks = (s) => Math.floor((world.c * s) / (2 * H));

// A row of ten lamps that fill up as a clock ticks.
function tickLamps(parent, materialFor, x, y, z) {
  const lamps = [];
  for (let i = 0; i < 10; i++) {
    const m = materialFor();
    parent.add(mesh(G.box, m, { pos: [x - 0.9 + i * 0.2, y, z], scale: [0.12, 0.12, 0.12] }));
    lamps.push(m);
  }
  return (n) => lamps.forEach((m, i) => {
    const on = i < n % 10;
    m.uniforms.uColor.value.set(on ? PALETTE.warm : "#2a2d3c");
    m.uniforms.uSpec.value.z = on ? 1 : 0.2;
  });
}

export default {
  id: "lightclock",
  title: "The Light Clock",
  tag: "time dilation",
  blurb: "A photon bouncing between two mirrors is a clock. Put one on a train and watch it zigzag and fall behind.",

  build({ player, toast }) {
    world.c = 5;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const { walk } = station(group, { P, flashes });

    // The platform's clock.
    const still = lightClockFrame(H);
    still.position.copy(PLATFORM_CLOCK);
    group.add(still);
    group.add(marker(PLATFORM_CLOCK.x, PLATFORM_CLOCK.z + 3.5));
    const stillPhoton = photonBall();
    group.add(stillPhoton);
    const stillWake = new Wake("#fff1c9", { fade: 3 });
    group.add(stillWake.line);
    const stillLamps = tickLamps(group, () => mat({ color: "#2a2d3c", emissive: 0.2, unique: true }), PLATFORM_CLOCK.x, BASE + H + 0.6, PLATFORM_CLOCK.z);

    // The train's clock, in the middle car.
    const train = new Train({ cars: 3, fraction: Math.sqrt(3) / 2, clip: [-P, -50, P, 50] });
    group.add(train.group);
    const onboard = lightClockFrame(H, { mover: train.mover, rect: train.clip });
    onboard.position.x = ONBOARD;
    train.group.add(onboard);
    carMarker(train, 2.5);
    const movingPhoton = photonBall("#c9e6ff", train.mover.uVel);
    group.add(movingPhoton);
    const movingWake = new Wake("#c9e6ff", { fade: 3 });
    group.add(movingWake.line);
    const movingLamps = tickLamps(train.group, () => mat({ color: "#2a2d3c", emissive: 0.2, mover: train.mover, rect: train.clip }), ONBOARD, BASE + H + 0.4, 0);

    let runStart = 0;
    const run = service(train, player, { P, toast, onRun: (t) => { runStart = t; movingWake.clear(); } });

    // Where each photon really is at world time t.
    const stillPath = (t) => new THREE.Vector3(PLATFORM_CLOCK.x, bounce(t), PLATFORM_CLOCK.z);
    const movingPath = (t) => {
      const p = train.pointAt(ONBOARD, t);
      p.y = bounce((t - runStart) / train.gamma);
      return p;
    };

    const goals = [
      { text: "From the platform, watch the train's clock go by", done: false },
      { text: "Board the train (E) and watch your own clock: straight up and down", done: false },
      { text: "Ride past the platform clock: now it's the slow one", done: false },
    ];
    let riding = 0;
    const note = () => {
      const tick = (2 * H) / world.c;
      if (player.vehicle) return `On board, your clock ticks every ${tick.toFixed(2)} s. The platform clock, rushing past you, takes ${(tick * train.gamma).toFixed(2)} s per tick.`;
      return `Each tick, the photon travels ${(2 * H).toFixed(1)} m between the mirrors: ${tick.toFixed(2)} s. On the moving train its path is a longer zigzag, ${(tick * train.gamma).toFixed(2)} s per tick.`;
    };

    return {
      group,
      train,
      walk,
      spawn: [PLATFORM_CLOCK.x - 8, 12, -0.6],
      env: COSMIC.env,
      post: COSMIC.post,
      goals,
      tips: [
        "Light always moves at 5 m/s here. On the train, the photon has to go sideways too, so each bounce takes longer.",
        "The trails stay where the light passed. The train clock's trail is a zigzag; the platform clock's is a single upright line.",
        "Each clock is the slow one to whoever watches it rush by. Both are right.",
      ],
      get note() { return note(); },
      readouts() {
        const rel = gammaOf(player.beta) * train.gamma * (1 - (player.v.x * train.v) / world.c ** 2);
        const relStill = gammaOf(player.beta);
        const tick = (2 * H) / world.c;
        return [
          ["platform clock", `${tick * relStill < 10 ? (tick * relStill).toFixed(2) : "–"} s per tick to you`],
          ["train clock", `${(tick * rel).toFixed(2)} s per tick to you`],
          ["train", `${(train.fraction * 100).toFixed(1)}% c · γ ${train.gamma.toFixed(2)}`],
        ];
      },
      action: (eye) => run.action(eye),
      update({ eye, t, dTau }) {
        run.update(eye);
        stillWake.push(stillPath(t), t);
        movingWake.push(movingPath(t), t);
        const ts = seenTimeOf(stillPath, eye, t, 60);
        stillPhoton.position.copy(stillPath(ts));
        stillLamps(ticks(ts));
        const tm = seenTimeOf(movingPath, eye, t, 60);
        movingPhoton.position.copy(movingPath(tm));
        movingPhoton.visible = Math.abs(movingPhoton.position.x) < P;
        movingLamps(ticks((tm - runStart) / train.gamma));

        if (!player.vehicle && Math.abs(train.centerAt(retardedTime(eye, movingPhoton.position)) - player.pos.x) < 12) goals[0].done = true;
        if (player.vehicle) riding += dTau;
        if (riding > 4) goals[1].done = true;
        if (player.vehicle && Math.abs(player.pos.x - PLATFORM_CLOCK.x) < 10 && !goals[2].done) {
          goals[2].done = true;
          toast("From the train, the platform clock's photon is the one zigzagging. Each of you sees the other's clock running slow.", 9);
        }
      },
    };
  },
};
