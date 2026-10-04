import * as THREE from "three";
import { Train } from "../rail.js";
import { EventLog } from "../events.js";
import { box, G, mesh, Wake } from "../geo.js";
import { mat } from "../shaders.js";
import { bolt, COSMIC, door, Flashes, lightClockFrame, marker, PALETTE, photonBall } from "../world.js";
import { gammaOf, retardedTime, seenTimeOf, world } from "../relativity.js";
import { carMarker, station } from "./common.js";
import { sfx } from "../audio.js";

// One line, three thought experiments, in the order a train meets them.
const P = 170; // portals at ±P
const STRIKE_X = -90; // lightning hits both ends as a train's middle passes here
const ENTRY = -30, EXIT = 10, MID = (ENTRY + EXIT) / 2; // a 40 m glass tunnel
const CLOCK = new THREE.Vector3(60, 0, 7); // the platform's light clock
const HEADWAY = 45; // seconds between trains
const H = 2.4, BASE = 0.3; // light clock mirror gap and floor height
const ONBOARD = -3; // where each train's clock sits, from its middle

const bounce = (s) => {
  const p = ((world.c * s) % (2 * H) + 2 * H) % (2 * H);
  return BASE + (p < H ? p : 2 * H - p);
};
const ticks = (s) => Math.floor((world.c * s) / (2 * H));

function tickLamps(parent, materialFor, x, y, z) {
  const lamps = [];
  for (let i = 0; i < 10; i++) {
    const m = materialFor();
    parent.add(mesh(G.box, m, { pos: [x - 0.9 + i * 0.2, y, z], scale: 0.12 }));
    lamps.push(m);
  }
  return (n) => lamps.forEach((m, i) => {
    const on = i < n % 10;
    m.uniforms.uColor.value.set(on ? PALETTE.warm : "#2a2d3c");
    m.uniforms.uSpec.value.z = on ? 1 : 0.2;
  });
}

export default {
  id: "railway",
  title: "Einstein's Railway",
  tag: "simultaneity · contraction · dilation",
  blurb: "Glass trains at 87% of light speed: lightning, a tunnel too short for the train, and a clock made of light.",
  tour: { from: [-150, 10, -Math.PI / 2], dir: [1, 0], length: 260 },

  build({ player, toast }) {
    world.c = 5;
    const group = new THREE.Group();
    const flashes = new Flashes();
    const { walk } = station(group, { P, flashes });
    group.add(marker(STRIKE_X, 6.5));
    group.add(marker(MID, 17, PALETTE.danger));
    group.add(marker(CLOCK.x, CLOCK.z + 3.5, PALETTE.edge));

    // Tunnel: glass walls, ribs of light, a door at each end.
    const glass = { color: "#2a3a66", additive: true, opacity: 0.16, ir: 0.1, uv: 0.3 };
    const rib = { color: "#6f7fd6", emissive: 0.7, ir: 0.3, uv: 0.5 };
    for (const s of [-1, 1]) group.add(box(EXIT - ENTRY, 5, 0.05, glass, [MID, 2.5, s * 2.9]));
    group.add(box(EXIT - ENTRY, 0.05, 5.8, glass, [MID, 5, 0]));
    for (let x = ENTRY; x <= EXIT; x += 8) {
      for (const s of [-1, 1]) group.add(box(0.05, 5, 0.05, rib, [x, 2.5, s * 2.9]));
      group.add(box(0.05, 0.05, 5.8, rib, [x, 5, 0]));
    }
    for (const s of [-1, 1]) for (const y of [0.05, 5]) group.add(box(EXIT - ENTRY, 0.05, 0.05, rib, [MID, y, s * 2.9]));
    for (let x = ENTRY; x <= EXIT; x += 10) group.add(box(0.08, 0.02, 1.2, { color: PALETTE.warm, emissive: 1, unlit: true }, [x, 0.03, 3.4]));
    const entry = door(ENTRY, 0), exit = door(EXIT, 0);
    group.add(entry, exit);
    const entryPos = new THREE.Vector3(ENTRY, 2.5, 0), exitPos = new THREE.Vector3(EXIT, 2.5, 0);

    // The platform's light clock.
    const still = lightClockFrame(H);
    still.position.copy(CLOCK);
    group.add(still);
    const stillPhoton = photonBall();
    group.add(stillPhoton);
    const stillWake = new Wake("#fff1c9", { fade: 3 });
    group.add(stillWake.line);
    const stillLamps = tickLamps(group, () => mat({ color: "#2a2d3c", emissive: 0.2, unique: true }), CLOCK.x, BASE + H + 0.6, CLOCK.z);
    const stillPath = (t) => new THREE.Vector3(CLOCK.x, bounce(t), CLOCK.z);

    // A pool of trains, each with a light clock and strike scorch marks.
    const scorchGeo = new THREE.CircleGeometry(0.8, 32);
    scorchGeo.rotateY(Math.PI / 2);
    const trains = [0, 1, 2, 3].map(() => {
      const train = new Train({ cars: 5, fraction: Math.sqrt(3) / 2, clip: [-P, -50, P, 50] });
      group.add(train.group);
      carMarker(train, 2.5);
      const clock = lightClockFrame(H, { mover: train.mover, rect: train.clip });
      clock.position.x = ONBOARD;
      train.group.add(clock);
      const lamps = tickLamps(train.group, () => mat({ color: "#2a2d3c", emissive: 0.2, mover: train.mover, rect: train.clip, unique: true }), ONBOARD, BASE + H + 0.4, 0);
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

    const front = bolt(new THREE.Vector3(STRIKE_X + trains[0].train.halfLength, 0, 0), 4);
    const rear = bolt(new THREE.Vector3(STRIKE_X - trains[0].train.halfLength, 0, 0), 9);
    group.add(front, rear);

    const log = new EventLog();
    const passes = []; // per run: strike and door times, and their logged events
    const goals = [
      { group: "Simultaneity", text: "From the gold ring, watch lightning hit a passing train", done: false, at: [-90, 6.5, 0, 0.1] },
      { group: "Simultaneity", text: "Ride a train (E) through the strikes, standing in the middle car", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Length contraction", text: "From the red ring, see the whole train inside the tunnel, both doors shut", done: false, at: [-10, 17, 0, 0.05] },
      { group: "Length contraction", text: "Ride through the tunnel: on board, the exit opens before the entry shuts", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Time dilation", text: "Near the blue ring, watch a train's clock tick slower than the platform's", done: false, at: [54, 12, -0.3, 0] },
      { group: "Time dilation", text: "Ride past the platform clock: now it's the slow one", done: false, at: [-150, 4.8, -Math.PI / 2, 0] },
      { group: "Appearance", text: "Stand at the platform edge as a train flies by: you see its far end, as if it turned", done: false, at: [-50, 4, 0, 0.05] },
    ];
    let note = "Trains leave every 45 seconds. Watch from a ring, or board one at the start of the platform.";

    // Fixed timetable: run k emerges from the west portal at k × HEADWAY.
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
      env: COSMIC.env,
      shadows: true,
      post: COSMIC.post,
      goals,
      log,
      tips: [
        "Lightning: the two strike points are the same distance from the gold ring, so from there both flashes arrive together.",
        "The train is 62 m long at rest and 31 m on the platform, so it fits the 40 m tunnel. Its passengers see a 20 m tunnel.",
        "Each tick, a clock's photon crosses 2.4 m and back. On a moving train its path is a longer zigzag, so it ticks slower.",
        "The floor glows where a flash's light has spread so far. You see the flash the moment that ring reaches you.",
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
          ["clock tick", ride ? "0.96 s yours · 1.92 s platform" : "0.96 s platform · 1.92 s trains"],
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
        schedule(t);
        trains.forEach((s) => s.train.update());
        const ride = ridingSlot();
        if (ride && ride.train.centerAt(t) + ride.train.halfLength > P - 1) {
          player.alight();
          sfx.alight();
          player.pos.set(Math.min(player.pos.x, P - 4), 0, 5.2);
          toast("End of the line. Press T to go back to the start.");
        }

        // The bolts show the latest strike that has happened (or the next one).
        const struck = passes.filter((p) => p.ts <= t).at(-1) ?? passes.find((p) => p.ts > t);
        front.strike = rear.strike = struck ? struck.ts : null;
        front.update(eye);
        rear.update(eye);
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
