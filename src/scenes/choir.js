import * as THREE from "three";
import { firefly, G, ground, mesh, puffTree, rng } from "../props.js";
import { mat } from "../shaders.js";
import { effects, retardedTime } from "../relativity.js";
import { sfx } from "../audio.js";

const PERIOD = 2.5;
const RING = 22;

// 0..1 flash shortly after each beat of the choir's shared clock.
function pulse(t) {
  const p = ((t % PERIOD) + PERIOD) % PERIOD;
  return Math.exp(-((p / 0.3) ** 2));
}

export default {
  id: "choir",
  title: "Firefly Choir",
  icon: "✨",
  blurb: "Forty fireflies flash at exactly the same moment. Why don't they look it?",

  build() {
    const group = new THREE.Group();
    const rand = rng(3);
    const colliders = [];

    group.add(ground(320, "#1d2348", "#262c58", 4, { ir: 0.08, uv: 0.05 }));
    group.add(mesh(G.cyl, mat({ color: "#7a4a2a" }), { pos: [0, 0.15, 0], scale: [0.9, 0.3, 0.9] }));
    group.add(mesh(G.cyl, mat({ color: "#e8c89a" }), { pos: [0, 0.31, 0], scale: [0.85, 0.02, 0.85] }));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const x = Math.cos(a) * 1.4, z = Math.sin(a) * 1.4;
      group.add(mesh(G.cyl, mat({ color: "#fff1d6" }), { pos: [x, 0.15, z], scale: [0.06, 0.3, 0.06] }));
      group.add(mesh(G.sphere, mat({ color: "#6ec8ff", emissive: 0.8 }), { pos: [x, 0.32, z], scale: [0.18, 0.1, 0.18] }));
    }
    for (let i = 0; i < 46; i++) {
      let a = rand() * Math.PI * 2;
      if (Math.abs(Math.sin(a) - 1) < 0.02) a += 0.3; // keep the view from the spawn clear
      const r = 32 + rand() * 40;
      const t = puffTree(3 + rand() * 3, "#2f6b4a");
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.add(t);
      colliders.push({ x: t.position.x, z: t.position.z, r: 0.5 });
    }

    const flies = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const f = firefly();
      f.scale.setScalar(1.6);
      f.home = new THREE.Vector3(Math.cos(a) * RING, 1.6 + Math.sin(i * 2.7) * 0.5, Math.sin(a) * RING);
      f.position.copy(f.home);
      group.add(f);
      flies.push(f);
    }

    const goals = [
      { text: "Watch the choir from outside the ring", done: false },
      { text: "Sprint at the ring: the flashes speed up ahead of you", done: false },
      { text: "Find the one spot where they all flash together (then stand still)", done: false },
    ];
    let watched = 0, centerBeats = 0, lastBeat = 0, celebrateAt = -1;

    return {
      group,
      colliders,
      bounds: 80,
      spawn: [0, 40, 0],
      env: {
        night: 1,
        sun: [0.3, 0.5, -0.8],
        sunColor: [0.18, 0.2, 0.32],
        sky: [0.1, 0.1, 0.22],
        ground: [0.04, 0.03, 0.07],
        fog: "#120e26",
        fogRange: [40, 160],
        skyTop: "#070b26",
        skyHorizon: "#2a2152",
      },
      goals,
      tips: [
        "Every firefly flashes at the same instant, but the light from far ones takes longer to reach you.",
        "Turn off Light delay in the Lab and the ripple vanishes. Turn it back on and it's back.",
      ],
      update({ player, eye, t, dTau }) {
        const celebrating = celebrateAt >= 0;
        for (const f of flies) {
          const tr = retardedTime(eye, f.home);
          f.position.y = f.home.y + Math.sin(tr * 1.7 + f.home.x) * 0.15;
          if (celebrating) {
            // A colored wave, still drawn at the time its light left.
            const h = (Math.atan2(f.home.z, f.home.x) / (Math.PI * 2) + tr * 0.3) % 1;
            f.color.setHSL((h + 1) % 1, 0.9, 0.6);
            f.glow(0.5 + 0.5 * pulse(tr * 2));
          } else f.glow(pulse(tr));
        }

        const r = Math.hypot(eye.x, eye.z);
        if (r > RING + 2) watched += dTau;
        if (watched > PERIOD * 2) goals[0].done = true;
        if (player.beta > 0.7 && r > RING) goals[1].done = true;

        // Count whole beats spent near the middle.
        const beat = Math.floor(t / PERIOD);
        if (beat !== lastBeat) {
          lastBeat = beat;
          centerBeats = r < 0.7 && player.beta < 0.3 && effects.delay ? centerBeats + 1 : 0;
          if (centerBeats >= 2 && !goals[2].done) {
            goals[2].done = true;
            celebrateAt = t;
            sfx.choir();
            this.toast?.("From the stump, every firefly is the same distance away, so all their light arrives together. 🎶");
          }
        }
      },
    };
  },
};
