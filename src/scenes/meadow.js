import * as THREE from "three";
import { arch, candyPole, clockTower, flowerPatch, ground, lollipopTree, mushroomHouse, PASTELS, puffTree, rng } from "../props.js";
import { dopplerFactor, retardedTime } from "../relativity.js";

export default {
  id: "meadow",
  title: "Lollipop Meadow",
  icon: "🍭",
  blurb: "Light walks at 3 m/s here. Go for a jog and watch the world bend.",

  build() {
    const group = new THREE.Group();
    const rand = rng(7);
    const colliders = [];
    const add = (obj, x, z, r) => {
      obj.position.set(x, 0, z);
      group.add(obj);
      if (r) colliders.push({ x, z, r });
      return obj;
    };

    group.add(ground(320, "#c9f2d0", "#fff6e0", 4));

    // Rainbow Avenue: arches you can sprint through toward the clock tower.
    for (let i = 0; i < 10; i++) add(arch(PASTELS[i % PASTELS.length]), 0, -12 - i * 8);
    for (let z = -8; z > -88; z -= 4) {
      add(candyPole(2.4, z % 8 ? "#ff4d6d" : "#4d8bff"), -5, z, 0.2);
      add(candyPole(2.4, z % 8 ? "#4d8bff" : "#ff4d6d"), 5, z, 0.2);
    }
    const tower = add(clockTower(), 0, -100, 3);
    const towerFace = new THREE.Vector3(0, 8, -98);

    const caps = ["#ff5d73", "#ffb86b", "#b69cff", "#6ec8ff"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4, r = 34 + rand() * 18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 9 && z < 0) continue;
      add(mushroomHouse(caps[i % caps.length]), x, z, 1.7).rotation.y = -a - Math.PI / 2;
    }
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = 10 + rand() * 90;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 9 && z < -4 && z > -110) continue;
      if (rand() < 0.5) add(lollipopTree(PASTELS[i % PASTELS.length], 3 + rand() * 2), x, z, 0.4);
      else add(puffTree(3 + rand() * 2), x, z, 0.5);
    }
    for (let i = 0; i < 8; i++) {
      const p = flowerPatch(rand, 60, 4);
      const a = rand() * Math.PI * 2, r = 12 + rand() * 40;
      p.position.set(Math.cos(a) * r + 14, 0, Math.sin(a) * r);
      group.add(p);
    }

    const goals = [
      { text: "Hold Shift and sprint to 90% of light speed", done: false },
      { text: "Glance back while running (hold B or right-click)", done: false },
      { text: "Run at the clock tower: see its clock race ahead", done: false },
      { text: "Get 10 seconds younger than the meadow", done: false },
    ];

    return {
      group,
      colliders,
      bounds: 120,
      spawn: [0, 6, 0],
      env: {},
      goals,
      tips: [
        "Arches ahead squeeze together and turn blue; everything behind you stretches, dims and reddens.",
        "Puff trees are bright in infrared, like real leaves, so they blaze when you run at them.",
        "Open the Lab (L) to toggle each effect on and off and see which one does what.",
      ],
      update({ player, eye, t }) {
        tower.set(retardedTime(eye, towerFace));
        const b = player.beta;
        if (b > 0.9) goals[0].done = true;
        if (player.looking && b > 0.5) goals[1].done = true;
        if (dopplerFactor(eye, player.v, towerFace) > 2.2 && eye.distanceTo(towerFace) < 80) goals[2].done = true;
        if (t - player.tau > 10) goals[3].done = true;
      },
    };
  },
};
