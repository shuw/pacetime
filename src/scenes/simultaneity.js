import * as THREE from "three";
import { Train } from "../rail.js";
import { EventLog } from "../events.js";
import { bolt, COSMIC, Flashes, marker, PALETTE } from "../world.js";
import { G } from "../geo.js";
import { world } from "../relativity.js";
import { carMarker, service, station } from "./common.js";
import { sfx } from "../audio.js";

const P = 110;
const STRIKE_X = -10; // the train's middle passes here when lightning hits both ends

export default {
  id: "simultaneity",
  title: "Einstein's Train",
  tag: "simultaneity",
  blurb: "Lightning hits both ends of a passing train at the same instant. Board it, and the strikes come apart.",

  build({ player, toast }) {
    world.c = 5;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const { walk } = station(group, { P, flashes });
    group.add(marker(STRIKE_X, 6.5));

    const train = new Train({ cars: 5, fraction: Math.sqrt(3) / 2, clip: [-P, -50, P, 50] });
    group.add(train.group);
    carMarker(train);
    // Scorch marks the strikes leave on the train's ends, appearing only in
    // light that left after the strike.
    const scorchGeo = new THREE.CircleGeometry(0.8, 32);
    scorchGeo.rotateY(Math.PI / 2);
    const scorchFront = train.lifeMat({ color: "#ff8a3d", emissive: 1, ir: 1.5, unlit: true, doubleSided: true });
    const scorchRear = train.lifeMat({ color: "#ff8a3d", emissive: 1, ir: 1.5, unlit: true, doubleSided: true });
    train.carry(scorchGeo, scorchFront, train.length / 2 + 0.1, 2.2);
    train.carry(scorchGeo, scorchRear, -train.length / 2 - 0.1, 2.2);

    const front = bolt(new THREE.Vector3(STRIKE_X + train.halfLength, 0, 0), 4);
    const rear = bolt(new THREE.Vector3(STRIKE_X - train.halfLength, 0, 0), 9);
    group.add(front, rear);

    const log = new EventLog();
    let pass = null;
    const goals = [
      { text: "Stand in the ring on the platform and watch the strikes", done: false },
      { text: "Board the train (E), stand in the middle car, ride through the strikes", done: false },
      { text: "Watch from the far end of the platform: you see them apart, but they still happened together", done: false },
    ];
    let note = "The next train is on its way. Lightning strikes both ends as its middle passes the ring.";

    const run = service(train, player, {
      P, toast,
      onRun: () => {
        const ts = train.timeAt(STRIKE_X);
        const hl = train.halfLength;
        front.strike = rear.strike = ts;
        const fp = new THREE.Vector3(STRIKE_X + hl, 0.4, 0), rp = new THREE.Vector3(STRIKE_X - hl, 0.4, 0);
        pass = { ts, events: [log.add("Front strike", ts, fp, "strike"), log.add("Rear strike", ts, rp, "strike")], fp, rp, flashed: false };
        scorchFront.uniforms.uLife.value.set(ts, 1e9);
        scorchRear.uniforms.uLife.value.set(ts, 1e9);
      },
    });

    log.onSeen((e) => {
      sfx.strike();
      const [f, r] = pass.events;
      if (f.seenTau === null || r.seenTau === null) return;
      const seenGap = f.seenTau - r.seenTau;
      const frameGap = f.frameTau - r.frameTau;
      const together = Math.abs(seenGap) < 0.08;
      const where = f.riding ? "on the train" : "on the platform";
      const seenText = together ? "reached you together" : `reached you ${Math.abs(seenGap).toFixed(2)} s apart, ${seenGap < 0 ? "front" : "rear"} first`;
      const frameText = Math.abs(frameGap) < 0.08 ? "they happened at the same moment" : `the ${frameGap < 0 ? "front" : "rear"} strike happened ${Math.abs(frameGap).toFixed(2)} s earlier`;
      note = `Watching ${where}: the flashes ${seenText}. Taking out the light travel time, ${frameText} in your frame.`;
      const local = player.pos.x - train.centerAt(world.t);
      if (!f.riding && together && Math.abs(player.pos.x - STRIKE_X) < 1.5) goals[0].done = true;
      if (f.riding && Math.abs(local) < 8 && frameGap < -0.5) {
        goals[1].done = true;
        toast("On the train, the front strike really did happen first. Whether two events are simultaneous depends on who's asking.", 9);
      }
      if (!f.riding && !together && Math.abs(frameGap) < 0.08) goals[2].done = true;
    });

    return {
      group,
      train,
      walk,
      spawn: [STRIKE_X - 6, 10, -0.35],
      env: COSMIC.env,
      post: COSMIC.post,
      goals,
      log,
      tips: [
        "The two strike points are the same distance from the ring, so from there the flashes arrive together.",
        "Riding toward the front strike, you meet its light sooner. Take out the travel time and it still came first.",
        "Watch the floor: each flash's light spreads as a ring at 5 m/s, and you see the flash when the ring reaches you.",
      ],
      get note() { return note; },
      readouts() {
        const t = pass ? pass.ts - world.t : 0;
        return [
          ["train", `${(train.fraction * 100).toFixed(1)}% c · γ ${train.gamma.toFixed(2)}`],
          ["train length", `${train.length.toFixed(0)} m own · ${(train.halfLength * 2).toFixed(0)} m on the platform`],
          ["strikes in", t > 0 ? `${t.toFixed(1)} s (platform time)` : "struck"],
        ];
      },
      action: (eye) => run.action(eye),
      update({ eye, t }) {
        run.update(eye);
        front.update(eye);
        rear.update(eye);
        if (pass && !pass.flashed && t >= pass.ts) {
          pass.flashed = true;
          flashes.add(pass.fp, pass.ts);
          flashes.add(pass.rp, pass.ts);
        }
        log.update(player, eye);
      },
    };
  },
};
