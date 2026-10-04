import * as THREE from "three";
import { critter, flowerPatch, G, ground, mesh, PASTELS, puffTree, rng } from "../props.js";
import { mat } from "../shaders.js";
import { apparentDirection, dopplerFactor } from "../relativity.js";
import { sfx } from "../audio.js";

// [kind, x, z]
const SPOTS = [
  ["ir", -14, -20], ["ir", 18, -26], ["ir", -26, 8], ["ir", 6, 30], ["ir", 30, 6],
  ["uv", -6, -34], ["uv", 24, 24], ["uv", -30, -12],
];

export default {
  id: "garden",
  title: "The Shy Garden",
  icon: "👀",
  blurb: "Some critters only glow in colors beyond the rainbow. Speed shifts them into view.",

  build() {
    const group = new THREE.Group();
    const rand = rng(11);
    const colliders = [{ x: 0, z: 0, r: 2.4 }];

    group.add(ground(240, "#bfe9a8", "#aedd98", 3));

    // Fountain
    group.add(mesh(G.cyl, mat({ color: "#e9e4ff" }), { pos: [0, 0.4, 0], scale: [2.4, 0.8, 2.4] }));
    group.add(mesh(G.cyl, mat({ color: "#6ec8ff", emissive: 0.3, uv: 0.5 }), { pos: [0, 0.7, 0], scale: [2.1, 0.1, 2.1] }));
    group.add(mesh(G.cyl, mat({ color: "#e9e4ff" }), { pos: [0, 1.4, 0], scale: [0.3, 1.6, 0.3] }));
    group.add(mesh(G.sphere, mat({ color: "#bfe8ff", emissive: 0.5, uv: 0.6 }), { pos: [0, 2.4, 0], scale: [0.9, 0.5, 0.9] }));

    // Hedges in loose rings, with gaps to sprint through.
    const hedge = mat({ color: "#3fa45b", ir: 1.7, uv: 0.04 });
    for (const R of [12, 40]) {
      const n = Math.round(R * 1.1);
      for (let i = 0; i < n; i++) {
        if (i % 6 === 0) continue;
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        group.add(mesh(G.box, hedge, { pos: [x, 0.7, z], rot: [0, -a, 0], scale: [1.2, 1.4, (Math.PI * 2 * R) / n] }));
        colliders.push({ x, z, r: 0.8 });
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2, r = 16 + rand() * 20;
      const t = puffTree(2.5 + rand() * 2);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      group.add(t);
      colliders.push({ x: t.position.x, z: t.position.z, r: 0.5 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = flowerPatch(rand, 50, 3, [PASTELS[i % 7], "#ffffff"]);
      p.position.set(Math.cos(a) * 7, 0, Math.sin(a) * 7);
      group.add(p);
    }

    const critters = SPOTS.map(([kind, x, z]) => {
      const c = critter(kind);
      c.kind = kind;
      c.position.set(x, 0, z);
      c.rotation.y = Math.atan2(-x, -z);
      c.center = new THREE.Vector3(x, 0.8, z);
      group.add(c);
      return c;
    });
    const irTotal = critters.filter((c) => c.kind === "ir").length;
    const uvTotal = critters.length - irTotal;

    const goals = [
      { text: `Find the Infrared Imps: sprint at them (0/${irTotal})`, done: false },
      { text: `Find the Ultraviolet Moths: run away, glance back (0/${uvTotal})`, done: false },
    ];
    const fwd = new THREE.Vector3();

    return {
      group,
      colliders,
      bounds: 70,
      spawn: [-4, 25, Math.PI / 2],
      env: { sunColor: [1.05, 0.95, 0.8] },
      goals,
      tips: [
        "Imps glow only in infrared. Running toward them squeezes that light into red, then green.",
        "Moths glow only in ultraviolet. Running away stretches it down into violet and blue.",
        "The hedges blaze when you run at them: leaves reflect lots of infrared.",
      ],
      update({ player, eye, camera, t }) {
        camera.getWorldDirection(fwd);
        let ir = 0, uv = 0;
        for (const c of critters) {
          c.position.y = Math.abs(Math.sin(t * 2 + c.center.x)) * 0.25;
          if (!c.found) {
            const D = dopplerFactor(eye, player.v, c.center);
            const dir = apparentDirection(eye, player.v, c.center);
            const onScreen = dir.dot(fwd) > Math.cos(0.55) && eye.distanceTo(c.center) < 45;
            if (onScreen && (c.kind === "ir" ? D > 1.25 : D < 0.8)) {
              c.found = true;
              c.reveal();
              sfx.pop();
              this.toast?.(c.kind === "ir" ? "You found an Infrared Imp! 🔴" : "You found an Ultraviolet Moth! 🟣");
            }
          }
          if (c.found) c.kind === "ir" ? ir++ : uv++;
        }
        goals[0].text = `Find the Infrared Imps: sprint at them (${ir}/${irTotal})`;
        goals[1].text = `Find the Ultraviolet Moths: run away, glance back (${uv}/${uvTotal})`;
        goals[0].done = ir === irTotal;
        goals[1].done = uv === uvTotal;
      },
    };
  },
};
