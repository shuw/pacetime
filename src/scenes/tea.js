import * as THREE from "three";
import { clockFace, flag, G, ground, kettle, mesh, PASTELS, personPip, puffTree, rng } from "../props.js";
import { mat, liveMat } from "../shaders.js";
import { retardedTime } from "../relativity.js";
import { sfx } from "../audio.js";

const BREW = 90; // world seconds for the kettle
const SAND = 40; // seconds on your own sand timer
const TRACK = 20;

export default {
  id: "tea",
  title: "Tea for Two",
  icon: "☕",
  blurb: "The kettle takes a minute and a half. Your sand timer holds 40 seconds. Run laps and come back younger than your twin.",

  build() {
    const group = new THREE.Group();
    const rand = rng(5);
    const colliders = [];

    group.add(ground(260, "#ffe9b0", "#ffdf96", 5, { ir: 0.6 }));
    const blanket = mesh(G.box, mat({ color: "#ff6b8a", checker: { b: "#fff6f0", size: 0.6 } }), { pos: [0, 0.03, 0], scale: [4, 0.06, 4] });
    group.add(blanket);

    const pip = personPip();
    pip.position.set(-1, 0.06, -0.6);
    pip.rotation.y = 0.5;
    group.add(pip);

    const pot = kettle();
    pot.position.set(1.2, 0.06, -0.8);
    group.add(pot);
    const potPos = new THREE.Vector3(1.2, 1, -0.8);
    colliders.push({ x: 1.2, z: -0.8, r: 0.6 }, { x: -1, z: -0.6, r: 0.4 });

    // Cake with candles that flicker on world time.
    group.add(mesh(G.cyl, mat({ color: "#fff1d6" }), { pos: [0.2, 0.3, 1], scale: [0.6, 0.45, 0.6] }));
    group.add(mesh(G.cyl, mat({ color: "#ff7eb6" }), { pos: [0.2, 0.55, 1], scale: [0.62, 0.08, 0.62] }));
    const flames = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const x = 0.2 + Math.cos(a) * 0.35, z = 1 + Math.sin(a) * 0.35;
      group.add(mesh(G.cyl, mat({ color: PASTELS[i] }), { pos: [x, 0.7, z], scale: [0.03, 0.25, 0.03] }));
      const f = mesh(G.ball, liveMat({ color: "#ffcc4d", emissive: 1, ir: 1.5 }), { pos: [x, 0.88, z], scale: [0.05, 0.09, 0.05] });
      group.add(f);
      flames.push(f);
    }

    // Pip's clock: four faces on a lamp post, so you can read it from the track.
    const post = new THREE.Group();
    post.position.set(-2.6, 0, -2.6);
    post.add(mesh(G.cyl, mat({ color: "#6ec8ff" }), { pos: [0, 2, 0], scale: [0.12, 4, 0.12] }));
    post.add(mesh(G.box, mat({ color: "#fff1d6" }), { pos: [0, 4.4, 0], scale: [1.9, 1.9, 1.9] }));
    const faces = [0, 1, 2, 3].map((i) => {
      const f = clockFace(0.8, "#fffaf0", "#6ec8ff");
      const a = (i * Math.PI) / 2;
      f.position.set(Math.sin(a) * 0.97, 4.4, Math.cos(a) * 0.97);
      f.rotation.y = a;
      post.add(f);
      return f;
    });
    group.add(post);
    colliders.push({ x: -2.6, z: -2.6, r: 0.3 });
    const postPos = new THREE.Vector3(-2.6, 4.4, -2.6);

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const f = flag(PASTELS[i % PASTELS.length]);
      f.position.set(Math.cos(a) * (TRACK + 3), 0, Math.sin(a) * (TRACK + 3));
      f.rotation.y = -a;
      group.add(f);
      colliders.push({ x: f.position.x, z: f.position.z, r: 0.15 });
    }
    const dash = mat({ color: "#ffffff", ir: 0.3 });
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      group.add(mesh(G.box, dash, { pos: [Math.cos(a) * TRACK, 0.02, Math.sin(a) * TRACK], rot: [0, -a, 0], scale: [0.25, 0.04, 0.9] }));
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, r = 30 + rand() * 50;
      const t = puffTree(3 + rand() * 2, i % 3 ? "#4cc36b" : "#7ed36b");
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.add(t);
    }

    const goals = [
      { text: "Walk to the kettle to put it on", done: false },
      { text: "Be back on the blanket when it whistles, before your sand runs out", done: false },
    ];
    let state = "idle", startT = 0, startTau = 0, endTau = 0, whistled = false;

    const inst = {
      group,
      colliders,
      bounds: 90,
      spawn: [0, 8, 0],
      env: { sun: [0.6, 0.45, 0.4], sunColor: [1.1, 0.9, 0.7], skyHorizon: "#ffd9c2" },
      goals,
      tips: [
        "Standing still, your 40-second sand runs out long before the kettle boils. Moving fast makes your watch tick slower than Pip's.",
        "You need γ above 2.25 on average (about 90% of light speed), so hold Shift the whole way round.",
        "From far away, Pip's clock looks slow while you run away and fast while you run back. That's the light delay.",
      ],
      hud() {
        if (state === "idle") return null;
        const sandLeft = Math.max(0, SAND - ((state === "brewing" ? this.tau : endTau) - startTau));
        const brewSeen = Math.min(BREW, Math.max(0, this.potT - startT));
        return { sandLeft, sand: SAND, brew: brewSeen, brewTotal: BREW };
      },
      update({ player, eye, t }) {
        this.tau = player.tau;
        const potT = retardedTime(eye, potPos);
        this.potT = potT;
        faces.forEach((f) => f.set(retardedTime(eye, postPos)));
        flames.forEach((f, i) => (f.scale.y = 0.09 + 0.03 * Math.sin(retardedTime(eye, f.position) * 13 + i * 2)));

        const heat = state === "idle" ? 0 : THREE.MathUtils.clamp((potT - startT) / BREW, 0, 1);
        pot.set(potT, heat);
        const onBlanket = Math.abs(eye.x) < 2.6 && Math.abs(eye.z) < 2.6;

        if (state === "idle" && eye.distanceTo(potPos) < 2.2) {
          state = "brewing";
          startT = t;
          startTau = player.tau;
          goals[0].done = true;
          sfx.ding();
          this.toast?.("Kettle's on! Pip will wait. You've got 40 seconds of your own time. Go!");
        }
        if (state === "brewing") {
          const boiled = potT - startT >= BREW;
          if (boiled && !whistled) { whistled = true; sfx.whistle(); }
          const used = player.tau - startTau;
          if (boiled && onBlanket && used <= SAND) {
            state = "done";
            endTau = player.tau;
            goals[1].done = true;
            sfx.choir();
            this.toast?.(`Tea time! Your watch says ${used.toFixed(1)} s went by. Pip's says ${(t - startT).toFixed(1)} s. You're now ${(t - startT - used).toFixed(1)} s younger than your twin. 🫖`, 9);
          } else if (used > SAND) {
            state = "lost";
            endTau = player.tau;
            sfx.womp();
            this.toast?.(`Your sand ran out at ${(t - startT).toFixed(1)} s of Pip's time. Run faster, for longer, and get back sooner! (Press R to retry)`, 7);
          }
        }
      },
    };
    return inst;
  },
};
