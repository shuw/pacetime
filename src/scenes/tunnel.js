import * as THREE from "three";
import { Train } from "../rail.js";
import { EventLog } from "../events.js";
import { COSMIC, door, Flashes, marker, PALETTE } from "../world.js";
import { box } from "../geo.js";
import { retardedTime, world } from "../relativity.js";
import { carMarker, service, station } from "./common.js";
import { sfx } from "../audio.js";

const P = 110;
const ENTRY = -50, EXIT = -10, MID = (ENTRY + EXIT) / 2; // a 40 m tunnel

export default {
  id: "tunnel",
  title: "Train and Tunnel",
  tag: "length contraction",
  blurb: "A 62 m train, a 40 m tunnel. At speed it fits, with both doors shut. Ride it, and the tunnel is the short one.",

  build({ player, toast }) {
    world.c = 5;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const { walk } = station(group, { P, flashes });
    group.add(marker(MID, 17));

    // Glass tunnel with ribs, and a door at each end.
    const glass = { color: "#2a3a66", additive: true, opacity: 0.16, ir: 0.1, uv: 0.3 };
    const rib = { color: "#6f7fd6", emissive: 0.7, ir: 0.3, uv: 0.5 };
    for (const s of [-1, 1]) group.add(box(EXIT - ENTRY, 5, 0.05, glass, [MID, 2.5, s * 2.9]));
    group.add(box(EXIT - ENTRY, 0.05, 5.8, glass, [MID, 5, 0]));
    for (let x = ENTRY; x <= EXIT; x += 8) {
      for (const s of [-1, 1]) group.add(box(0.05, 5, 0.05, rib, [x, 2.5, s * 2.9]));
      group.add(box(0.05, 0.05, 5.8, rib, [x, 5, 0]));
    }
    for (const s of [-1, 1]) for (const y of [0.05, 5]) group.add(box(EXIT - ENTRY, 0.05, 0.05, rib, [MID, y, s * 2.9]));
    group.add(box(EXIT - ENTRY, 0.06, 0.06, { color: PALETTE.edge, emissive: 1 }, [MID, 5.05, 2.95]));
    // Length markings along the tunnel, every 10 m.
    for (let x = ENTRY; x <= EXIT; x += 10) group.add(box(0.08, 0.02, 1.2, { color: PALETTE.warm, emissive: 1, unlit: true }, [x, 0.03, 3.4]));
    const entry = door(ENTRY, 0), exit = door(EXIT, 0);
    group.add(entry, exit);
    const entryPos = new THREE.Vector3(ENTRY, 2.5, 0), exitPos = new THREE.Vector3(EXIT, 2.5, 0);

    const train = new Train({ cars: 5, fraction: Math.sqrt(3) / 2, clip: [-P, -50, P, 50] });
    group.add(train.group);
    carMarker(train);

    const log = new EventLog();
    let pass = null;
    const goals = [
      { text: "Watch from the ring: the whole train is inside with both doors shut", done: false },
      { text: "Board the train (E) and ride through the tunnel", done: false },
      { text: "Check the log: on board, the exit opened before the entry door shut", done: false },
    ];
    let note = "Doors shut behind the train and open ahead of it. Watch the lamps: red is shut.";

    const run = service(train, player, {
      P, toast,
      onRun: () => {
        const hl = train.halfLength;
        const shut = train.timeAt(ENTRY + hl) + 0.15; // tail just inside
        const open = train.timeAt(EXIT - hl) - 0.15; // head about to reach the exit
        const clear = train.timeAt(EXIT + hl) + 0.6; // tail out of the tunnel
        pass = {
          shut, open, clear,
          events: [log.add("Entry door shuts", shut, entryPos, "door"), log.add("Exit door opens", open, exitPos, "door")],
        };
      },
    });
    const entryClosed = (t) => pass && t >= pass.shut && t < pass.clear;
    const exitClosed = (t) => !pass || t < pass.open || t >= pass.clear;

    log.onSeen(() => {
      sfx.door();
      const [s, o] = pass.events;
      if (s.seenTau === null || o.seenTau === null) return;
      const seenGap = o.seenTau - s.seenTau;
      const frameGap = o.frameTau - s.frameTau;
      const where = s.riding ? "On the train" : "From the platform";
      note = `${where}: you saw the exit open ${Math.abs(seenGap).toFixed(2)} s ${seenGap > 0 ? "after" : "before"} the entry shut. In your frame it opened ${Math.abs(frameGap).toFixed(2)} s ${frameGap > 0 ? "after" : "before"}.`;
      if (!s.riding && seenGap > 0 && Math.abs(player.pos.x - MID) < 2) goals[0].done = true;
      if (s.riding) {
        goals[1].done = true;
        if (frameGap < 0) {
          goals[2].done = true;
          toast("In the train's frame the tunnel is only 20 m long, so the exit has to open before the back of the train is in. Both stories are true.", 10);
        }
      }
    });

    return {
      group,
      train,
      walk,
      spawn: [MID, 21, 0],
      env: COSMIC.env,
      post: COSMIC.post,
      goals,
      log,
      tips: [
        "The train is 62 m long when it's still. Moving at 87% of light speed it measures 31 m on the platform, so it fits.",
        "To the passengers, the train is 62 m and the tunnel is the one squashed, to 20 m.",
        "Both doors are shut at the same time in the platform's frame, but not in the train's.",
      ],
      get note() { return note; },
      readouts() {
        return [
          ["train", `${(train.fraction * 100).toFixed(1)}% c · γ ${train.gamma.toFixed(2)}`],
          ["train length", `${train.length.toFixed(0)} m own · ${(train.halfLength * 2).toFixed(0)} m here`],
          ["tunnel", `${EXIT - ENTRY} m · ${((EXIT - ENTRY) / train.gamma).toFixed(0)} m to passengers`],
        ];
      },
      action: (eye) => run.action(eye),
      update({ eye, t }) {
        run.update(eye);
        // Each door flashes as it moves, so you can watch the news spread.
        if (pass && !pass.shutFlash && t >= pass.shut) { pass.shutFlash = true; flashes.add(new THREE.Vector3(ENTRY, 0.2, 3.2), pass.shut, PALETTE.danger); }
        if (pass && !pass.openFlash && t >= pass.open) { pass.openFlash = true; flashes.add(new THREE.Vector3(EXIT, 0.2, 3.2), pass.open, "#5dff9a"); }
        entry.show(entryClosed(retardedTime(eye, entryPos)));
        exit.show(exitClosed(retardedTime(eye, exitPos)));
        log.update(player, eye);
      },
    };
  },
};
