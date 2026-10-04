import * as THREE from "three";
import { box, G, mesh, rng } from "../geo.js";
import { mat, sparkField } from "../shaders.js";
import { Flashes } from "../world.js";
import { clockFace, cottage, Emitter, Fireworks, forest, lampPost, mountain, orbiting, reflection, rotor, SOUND_SPEED, stringLights, surface } from "../earth.js";
import { gammaOf, retardedTime, seenTimeOf, world } from "../relativity.js";
import { angleOf } from "../motion.js";
import { sfx } from "../audio.js";

const C = 7; // light speed, m/s
const SQUARE = new THREE.Vector3(0, 0, -30);
const CAROUSEL = new THREE.Vector3(-17, 0, -30), CAR_R = 6.5, CAR_SPEED = 0.7;
const CHURCH = new THREE.Vector3(18, 0, -80), CLOCK_Y = 17;
const POND = new THREE.Vector3(46, 0, -36), POND_R = 15;
const LOOP = new THREE.Vector3(0, 0, -40), LOOP_R = 110, TRAIN_SPEED = 0.75;
const BELL_EVERY = 30; // the church bell rings every 30 s of village time

const DUSK = {
  env: {
    night: 1, stars: 0.6, aurora: 1, sun: [-0.6, 0.35, -0.7], sunColor: [0.42, 0.42, 0.58], sky: [0.2, 0.24, 0.36], ground: [0.14, 0.15, 0.2],
    fog: "#2a3352", fogRange: [90, 700], skyTop: "#081230", skyHorizon: "#6a4f78",
  },
  post: { bloom: { strength: 0.8, radius: 0.5, threshold: 0.55 } },
};

// Rotate v about +y by angle a (same sense as the shader's rotor).
const spin = (v, a) => new THREE.Vector3(v.x * Math.cos(a) + v.z * Math.sin(a), v.y, -v.x * Math.sin(a) + v.z * Math.cos(a));

export default {
  id: "village",
  title: "Winter Village",
  tag: "time dilation · aberration · light delay",
  blurb: "A snowy valley. A carousel that leaves you younger, a church clock that's always behind, and snowfall that turns to hyperspace.",
  intro: true,
  tour: { from: [-40, 80, 0.35], dir: [0.34, -0.94], length: 160 },

  build({ player, toast }) {
    world.c = C;
    const group = new THREE.Group();
    const lights = new THREE.Group();
    const flashes = new Flashes();
    const rand = rng(41);
    const colliders = [];
    const chimneys = [];

    group.add(surface({ color: "#dfe6f0", ir: 0.6, uv: 0.5, flashes, snow: true }, { radius: 1500 }));
    for (const [x, z, r, h] of [[-420, -520, 220, 260], [-150, -650, 260, 330], [180, -600, 240, 300], [470, -420, 230, 250], [620, 60, 260, 230], [-600, -60, 250, 240], [-380, 420, 220, 200], [300, 520, 240, 220], [40, 700, 260, 260]]) {
      group.add(mountain(x, z, r, h));
    }
    // Pines all round, leaving room for the village and the railway.
    const spots = [];
    while (spots.length < 520) {
      const a = rand() * Math.PI * 2, r = 70 + rand() * 330;
      const x = LOOP.x + Math.cos(a) * r, z = LOOP.z + Math.sin(a) * r;
      if (Math.abs(r - LOOP_R) < 8) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND_R + 6) continue;
      if (Math.abs(x) < 6 && z > 0) continue;
      spots.push([x, z, 6 + rand() * 9]);
    }
    group.add(forest(spots));

    // Cottages ringing the square, all facing in.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.17, r = 30 + (i % 3) * 9 + rand() * 4;
      const x = SQUARE.x + Math.cos(a) * r, z = SQUARE.z + Math.sin(a) * r;
      if (Math.hypot(x - CHURCH.x, z - CHURCH.z) < 18 || Math.hypot(x - POND.x, z - POND.z) < POND_R + 6 || Math.abs(x) < 5 && z > SQUARE.z) continue;
      const ry = -a - Math.PI / 2;
      group.add(cottage(x, z, ry, { snow: true, color: ["#6b4a3a", "#8a5a44", "#5a4a5a", "#7a6a50"][i % 4], seed: i * 3 }));
      // Chimney top, in the cottage's own frame at (1.5, 5.4, 0.75).
      chimneys.push([x + 1.5 * Math.cos(ry) + 0.75 * Math.sin(ry), 5.5, z - 1.5 * Math.sin(ry) + 0.75 * Math.cos(ry)]);
      colliders.push({ x, z, r: 3.6 });
    }
    for (const [x, z] of [[-6, -10], [6, -10], [-6, 10], [6, 10], [-6, 30], [6, 30], [-12, -48], [12, -48], [26, -30], [-28, -12]]) lights.add(lampPost(x, z, { h: 3.6, color: "#ffc070", pole: "#1c1a18", range: 5, power: 0.4 }));

    // The church, its tower clock showing whatever time its light left it.
    group.add(box(10, 8, 18, { color: "#cfc6b8", ir: 0.6, windows: { size: [2.6, 4], lit: 1, color: "#ffb860", seed: 2 } }, [CHURCH.x, 4, CHURCH.z - 12]));
    const nave = new THREE.CylinderGeometry(0.01, 1, 1, 3, 1);
    nave.rotateZ(Math.PI / 2);
    nave.rotateY(Math.PI / 2);
    group.add(mesh(nave, mat({ color: "#e6eef6", ir: 0.6, uv: 0.4 }), { pos: [CHURCH.x, 10, CHURCH.z - 12], scale: [11, 4, 19 / 1.5], rot: [0, 0, 0] }));
    group.add(box(6, 20, 6, { color: "#d8d0c2", ir: 0.6 }, [CHURCH.x, 10, CHURCH.z]));
    group.add(box(6.4, 4, 6.4, { color: "#b9b0a2", ir: 0.5 }, [CHURCH.x, 22, CHURCH.z]));
    group.add(mesh(new THREE.ConeGeometry(4.4, 12, 4), mat({ color: "#2e3b52", ir: 0.4 }), { pos: [CHURCH.x, 30, CHURCH.z], rot: [0, Math.PI / 4, 0] }));
    group.add(mesh(G.sphere, mat({ color: "#ffd77a", emissive: 1, ir: 1 }), { pos: [CHURCH.x, 36.4, CHURCH.z], scale: 0.4 }));
    const faces = [0, 1, 2, 3].map((i) => {
      const f = clockFace(1.9, { glow: 0.3 });
      const a = (i * Math.PI) / 2;
      f.position.set(CHURCH.x + Math.sin(a) * 3.05, CLOCK_Y, CHURCH.z + Math.cos(a) * 3.05);
      f.rotation.y = a;
      group.add(f);
      return f;
    });
    const bell = mesh(new THREE.CylinderGeometry(0.5, 1.1, 1.6, 20, 1, true), mat({ color: "#c9a24a", ir: 0.6, doubleSided: true }), { pos: [CHURCH.x, 22.4, CHURCH.z] });
    bell.userData.dynamic = true;
    group.add(bell);
    lights.add(box(2.4, 3, 0.1, { color: "#ffb860", emissive: 0.8, ir: 1 }, [CHURCH.x, 1.5, CHURCH.z + 3.05]));
    colliders.push({ x: CHURCH.x, z: CHURCH.z, r: 4.4 }, { x: CHURCH.x, z: CHURCH.z - 8, r: 5.5 }, { x: CHURCH.x, z: CHURCH.z - 16, r: 5.5 });
    const clockPos = new THREE.Vector3(CHURCH.x, CLOCK_Y, CHURCH.z);

    // A tall tree in the square, its bulbs twinkling on one shared clock.
    group.add(box(0.6, 3, 0.6, { color: "#3a2a20" }, [SQUARE.x, 1.5, SQUARE.z]));
    for (let i = 0; i < 4; i++) group.add(mesh(new THREE.ConeGeometry(4.6 - i, 3.6, 12), mat({ color: "#1d3a2b", ir: 1.4 }), { pos: [SQUARE.x, 3 + i * 2.4, SQUARE.z] }));
    group.add(mesh(G.sphere, mat({ color: "#ffe9a0", emissive: 1, ir: 1.2 }), { pos: [SQUARE.x, 13.2, SQUARE.z], scale: 0.5 }));
    const twinkles = [];
    for (let i = 0; i < 70; i++) {
      const h = rand(), a = rand() * Math.PI * 2, r = (1 - h) * 4.4 + 0.2;
      const m = mat({ color: ["#ff5050", "#ffd060", "#60c0ff", "#80ff90", "#ff80d0"][i % 5], emissive: 1, ir: 1, uv: 0.5, unique: true });
      const p = new THREE.Vector3(SQUARE.x + Math.cos(a) * r, 2.6 + h * 10, SQUARE.z + Math.sin(a) * r);
      lights.add(mesh(G.ball, m, { pos: p.toArray(), scale: 0.13 }));
      twinkles.push({ m, p, base: m.uniforms.uColor.value.clone(), phase: i % 3 });
    }
    colliders.push({ x: SQUARE.x, z: SQUARE.z, r: 4.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lights.add(stringLights([SQUARE.x, 12.5, SQUARE.z], [SQUARE.x + Math.cos(a) * 16, 3.6, SQUARE.z + Math.sin(a) * 16], { n: 12, sag: 0.6 }));
      group.add(box(0.14, 3.6, 0.14, { color: "#1c1a18" }, [SQUARE.x + Math.cos(a) * 16, 1.8, SQUARE.z + Math.sin(a) * 16]));
    }

    // Carousel: its rim moves at 70% of light speed.
    const omegaCar = (CAR_SPEED * C) / CAR_R;
    const cr = rotor(CAROUSEL.toArray(), [0, 1, 0], omegaCar, CAR_R + 1);
    const onCar = (o) => mat({ ...o, rotor: cr });
    group.add(mesh(G.cyl, onCar({ color: "#7a2a3a", ir: 0.5 }), { pos: [CAROUSEL.x, 0.3, CAROUSEL.z], scale: [CAR_R + 0.4, 0.5, CAR_R + 0.4] }));
    group.add(mesh(G.cyl, onCar({ color: "#e8d9b0", ir: 0.6, grid: { color: "#c8b080", spacing: 1, width: 1, glow: 0 } }), { pos: [CAROUSEL.x, 0.56, CAROUSEL.z], scale: [CAR_R, 0.04, CAR_R] }));
    group.add(mesh(G.cyl, onCar({ color: "#d9b25a", ir: 0.6 }), { pos: [CAROUSEL.x, 3.2, CAROUSEL.z], scale: [0.5, 6, 0.5] }));
    group.add(mesh(new THREE.ConeGeometry(CAR_R + 0.8, 2.6, 24, 1), onCar({ color: "#c8343c", ir: 0.5 }), { pos: [CAROUSEL.x, 7.4, CAROUSEL.z] }));
    group.add(mesh(G.cyl, onCar({ color: "#f2e6c8", ir: 0.6 }), { pos: [CAROUSEL.x, 5.95, CAROUSEL.z], scale: [CAR_R + 0.8, 0.5, CAR_R + 0.8] }));
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      lights.add(mesh(G.ball, onCar({ color: i % 2 ? "#ffd38a" : "#fff0d0", emissive: 1, ir: 1, uv: 2.2 }), { pos: [CAROUSEL.x + Math.cos(a) * (CAR_R + 0.85), 5.85, CAROUSEL.z + Math.sin(a) * (CAR_R + 0.85)], scale: 0.11 }));
    }
    const horseColors = ["#f4efe6", "#3a2a22", "#c98a4a", "#8a8a96"];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 4 : 5.4, y = i % 2 ? 1.7 : 1.3;
      const x = CAROUSEL.x + Math.cos(a) * r, z = CAROUSEL.z + Math.sin(a) * r;
      const tangent = a + Math.PI / 2;
      const c = horseColors[i % 4];
      group.add(mesh(G.cyl, onCar({ color: "#d9b25a", ir: 0.6 }), { pos: [x, 3.2, z], scale: [0.06, 5.4, 0.06] }));
      group.add(mesh(G.box, onCar({ color: c, ir: 0.5 }), { pos: [x, y, z], scale: [0.5, 0.6, 1.5], rot: [0, -tangent + Math.PI / 2, 0] }));
      const hx = x + Math.cos(tangent) * 0.0 - Math.sin(a) * 0.75 * -1, hz = z + Math.cos(a) * 0.75 * -1;
      group.add(mesh(G.box, onCar({ color: c, ir: 0.5 }), { pos: [x - Math.sin(a) * -0.7, y + 0.55, z + Math.cos(a) * -0.7].map((v, k) => (k === 0 ? CAROUSEL.x + Math.cos(a) * r - Math.sin(a) * 0.7 : k === 2 ? CAROUSEL.z + Math.sin(a) * r + Math.cos(a) * 0.7 : v)), scale: [0.34, 0.6, 0.5], rot: [0, -tangent + Math.PI / 2, 0] }));
      void hx, void hz;
      group.add(mesh(G.box, onCar({ color: ["#c8343c", "#2a6ac8", "#e8b030"][i % 3], ir: 0.5 }), { pos: [x, y + 0.34, z], scale: [0.54, 0.1, 0.6], rot: [0, -tangent + Math.PI / 2, 0] }));
    }
    colliders.push({ x: CAROUSEL.x, z: CAROUSEL.z, r: CAR_R + 0.6 });

    // A frozen pond with skaters carrying lanterns.
    group.add(mesh(new THREE.CircleGeometry(POND_R, 96), mat({ color: "#1c2a3e", water: 0.02, ir: 0.2, uv: 0.3 }), { pos: [POND.x, 0.03, POND.z], rot: [-Math.PI / 2, 0, 0] }));
    const skaters = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const r = 5 + (i % 4) * 2.4, speed = 0.45 + (i % 3) * 0.1;
      const sr = rotor(POND.toArray(), [0, 1, 0], ((i % 2 ? 1 : -1) * speed * C) / r, r + 0.5);
      const a = (i / 7) * Math.PI * 2;
      const p = [POND.x + Math.cos(a) * r, 0, POND.z + Math.sin(a) * r];
      const sk = (o) => mat({ ...o, rotor: orbiting(sr, p) });
      skaters.add(mesh(G.box, sk({ color: ["#c8343c", "#2a5aa8", "#e8b030", "#3a8a5a"][i % 4], ir: 0.5 }), { pos: [p[0], 1.0, p[2]], scale: [0.45, 1.2, 0.3] }));
      skaters.add(mesh(G.sphere, sk({ color: "#e8c0a0" }), { pos: [p[0], 1.85, p[2]], scale: 0.2 }));
      skaters.add(mesh(G.ball, sk({ color: "#ffd38a", emissive: 1, ir: 1.4, uv: 2 }), { pos: [p[0] + 0.4, 1.3, p[2]], scale: 0.15 }));
    }
    group.add(skaters);
    group.add(reflection(skaters, 0.03, 0.4));
    colliders.push({ x: POND.x, z: POND.z, r: POND_R });

    // Steam train on a loop round the valley.
    const omegaTrain = (TRAIN_SPEED * C) / LOOP_R;
    const tr = rotor(LOOP.toArray(), [0, 1, 0], omegaTrain, LOOP_R + 3);
    const onTrain = (o) => mat({ ...o, rotor: tr });
    const railGeo = (r) => new THREE.TorusGeometry(r, 0.07, 6, 720);
    for (const r of [LOOP_R - 0.75, LOOP_R + 0.75]) group.add(mesh(railGeo(r), mat({ color: "#8a8f9a", ir: 0.4 }), { pos: [LOOP.x, 0.12, LOOP.z], rot: [Math.PI / 2, 0, 0] }));
    {
      const n = 420;
      const sleepers = new THREE.InstancedMesh(G.box, mat({ color: "#3a2e26", ir: 0.4 }), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        sleepers.setMatrixAt(i, m4.compose(new THREE.Vector3(LOOP.x + Math.cos(a) * LOOP_R, 0.05, LOOP.z + Math.sin(a) * LOOP_R), q, new THREE.Vector3(2.4, 0.1, 0.3)));
      }
      sleepers.frustumCulled = false;
      group.add(sleepers);
    }
    const placeOnLoop = (phi, build) => {
      // phi: angle on the loop at world time 0; the car's length runs along the track.
      const g = new THREE.Group();
      build(g);
      g.position.set(LOOP.x + Math.cos(phi) * LOOP_R, 0, LOOP.z - Math.sin(phi) * LOOP_R);
      g.rotation.y = phi + Math.PI / 2;
      g.updateMatrixWorld(true);
      // Bake the placement into world-space meshes so the rotor shader sees true positions.
      const out = [];
      g.traverse((m) => { if (m.isMesh) { m.updateMatrixWorld(true); const c = mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); out.push(c); } });
      return out;
    };
    const steam = new THREE.Group();
    // Two trains, half a lap apart.
    const engines = [Math.PI / 2 + 0.05, -Math.PI / 2 + 0.05].map((PHI0) => {
    const loco = placeOnLoop(PHI0, (g) => {
      g.add(mesh(G.cyl, onTrain({ color: "#1a1d24", ir: 0.4 }), { pos: [1, 1.9, 0], rot: [0, 0, Math.PI / 2], scale: [1.05, 4.8, 1.05] }));
      g.add(mesh(G.cyl, onTrain({ color: "#b8902a", ir: 0.6 }), { pos: [1, 1.9, 0], rot: [0, 0, Math.PI / 2], scale: [1.1, 0.2, 1.1] }));
      g.add(mesh(G.box, onTrain({ color: "#5a1a1e", ir: 0.4 }), { pos: [-2.2, 2.3, 0], scale: [1.8, 2.6, 2.3] }));
      g.add(mesh(G.box, onTrain({ color: "#ffcf80", emissive: 0.8, ir: 1 }), { pos: [-2.2, 2.8, 0], scale: [1.4, 0.7, 2.32] }));
      g.add(mesh(G.cyl, onTrain({ color: "#1a1d24" }), { pos: [2.8, 3.3, 0], scale: [0.35, 1.4, 0.35] }));
      g.add(mesh(G.box, onTrain({ color: "#2a2d34" }), { pos: [0.4, 0.75, 0], scale: [6, 0.5, 2] }));
      g.add(mesh(G.sphere, onTrain({ color: "#fff2c0", emissive: 1, ir: 1.6, uv: 0.6 }), { pos: [3.5, 2.1, 0], scale: [0.15, 0.35, 0.35] }));
      for (const x of [-1.8, -0.2, 1.4, 2.8]) for (const s of [-1, 1]) g.add(mesh(G.cyl, onTrain({ color: "#8a2020", ir: 0.4 }), { pos: [x, 0.62, s * 1.05], rot: [Math.PI / 2, 0, 0], scale: [0.6, 0.15, 0.6] }));
    });
    loco.forEach((m) => steam.add(m));
    for (let k = 1; k <= 4; k++) {
      const cars = placeOnLoop(PHI0 - k * 0.075, (g) => {
        if (k === 4) {
          // An open observation car at the back, for riders.
          g.add(mesh(G.box, onTrain({ color: "#5a1a1e", ir: 0.5 }), { pos: [0, 0.95, 0], scale: [7.2, 0.3, 2.4] }));
          for (const s of [-1, 1]) {
            g.add(mesh(G.box, onTrain({ color: "#b8902a", ir: 0.6 }), { pos: [0, 1.75, s * 1.15], scale: [7.2, 0.08, 0.08] }));
            for (let x = -3.4; x <= 3.4; x += 0.85) g.add(mesh(G.box, onTrain({ color: "#b8902a", ir: 0.6 }), { pos: [x, 1.4, s * 1.15], scale: [0.06, 0.7, 0.06] }));
          }
          for (const x of [-3, 3]) g.add(mesh(G.ball, onTrain({ color: "#ffc070", emissive: 1, ir: 1.2 }), { pos: [x, 2.0, 1.15], scale: 0.12 }));
        } else {
          g.add(mesh(G.box, onTrain({ color: k % 2 ? "#2a4a3a" : "#5a1a1e", ir: 0.5, uv: 0.6, windows: { size: [1.3, 2.2], lit: 0.9, color: "#ffc070", seed: k } }), { pos: [0, 1.9, 0], scale: [7.2, 2.4, 2.4] }));
          g.add(mesh(G.box, onTrain({ color: "#e6eef6", ir: 0.6, uv: 0.4 }), { pos: [0, 3.2, 0], scale: [7.4, 0.25, 2.6] }));
        }
        g.add(mesh(G.box, onTrain({ color: "#2a2d34" }), { pos: [0, 0.6, 0], scale: [6.6, 0.4, 2] }));
      });
      cars.forEach((m) => steam.add(m));
    }
    const chimney0 = new THREE.Vector3(LOOP.x + Math.cos(PHI0) * LOOP_R, 4, LOOP.z - Math.sin(PHI0) * LOOP_R).add(new THREE.Vector3(Math.cos(PHI0 + Math.PI / 2) * 2.8, 0, -Math.sin(PHI0 + Math.PI / 2) * 2.8));
    return { chimney0, chuffAt: 0, chuffN: 0 };
    });
    group.add(steam);
    const trainAt = (t, p0) => spin(p0.clone().sub(LOOP), angleOf(tr, t)).add(LOOP);
    const smoke = sparkField(900, { intensity: 0.5 });
    group.add(smoke);
    const station = new THREE.Vector3(LOOP.x + 4, 0, LOOP.z + LOOP_R);
    group.add(box(16, 0.6, 4, { color: "#6a5a4a", ir: 0.5 }, [station.x, 0.3, station.z + 3.4]));
    group.add(box(16, 0.3, 4.6, { color: "#e6eef6", ir: 0.6, uv: 0.4 }, [station.x, 3.6, station.z + 3.6]));
    for (const dx of [-7, 0, 7]) group.add(box(0.18, 3.1, 0.18, { color: "#3a2e26" }, [station.x + dx, 2.1, station.z + 5.2]));
    lights.add(lampPost(station.x - 6, station.z + 4.6, { h: 3.4, color: "#ffc070", power: 0.4 }), lampPost(station.x + 6, station.z + 4.6, { h: 3.4, color: "#ffc070", power: 0.4 }));

    // Snowfall, wrapped around you.
    const SNOW_V = 0.1 * C;
    const snow = sparkField(6000, { periodic: true, wrap: [60, 0, 60], intensity: 1.1 });
    const white = new THREE.Color("#eef3ff");
    for (let i = 0; i < snow.count; i++) {
      const y0 = 14 + rand() * 10;
      snow.set({ origin: new THREE.Vector3(rand() * 60 - 30, y0, rand() * 60 - 30), vel: new THREE.Vector3(0.25 + rand() * 0.2, -SNOW_V * (0.8 + rand() * 0.4), 0.1), birth: -rand() * 40, life: y0 / SNOW_V, color: white, size: 0.13 }, i);
    }
    group.add(snow);

    const fw = new Fireworks(group, flashes, { seed: 9, c: C });
    const smokeStacks = new Emitter(group, chimneys, { every: 0.3, rise: 0.9, drift: [0.35, 0, 0.12], life: 9, color: "#c0c8dc", size: 2.2, intensity: 0.3, seed: 12 });
    let nextShell = 20;

    group.add(lights);

    // Rides.
    let riding = null, lastAngle = 0, rideStart = { tau: 0, t: 0 };
    const carouselSeat = {
      velocity: new THREE.Vector3(),
      r0: null,
      carry(p, t) {
        const a = angleOf(cr, t);
        const r = spin(this.r0, a);
        p.set(CAROUSEL.x + r.x, 0.56, CAROUSEL.z + r.z);
        this.velocity.set(0, 1, 0).cross(r).multiplyScalar(cr.uOmega.value);
        player.yaw += a - lastAngle;
        lastAngle = a;
      },
    };
    const trainSeat = {
      velocity: new THREE.Vector3(),
      r0: null,
      carry(p, t) {
        const a = angleOf(tr, t);
        const r = spin(this.r0, a);
        p.set(LOOP.x + r.x, 1.1, LOOP.z + r.z);
        this.velocity.set(0, 1, 0).cross(r).multiplyScalar(tr.uOmega.value);
        player.yaw += a - lastAngle;
        lastAngle = a;
      },
    };

    const goals = [
      { group: "Light delay", text: "From the far edge of the village, read the church clock: it's behind your watch", done: false, at: [-30, 60, -0.33, 0.15] },
      { group: "Light delay", text: "Hear the steam train where it is, see it where it was", done: false, at: [8, 66, 1.4, 0] },
      { group: "Time dilation", text: "Ride the carousel (E) until you're 3 seconds younger than the village", done: false, at: [-17, -22, 0, 0] },
      { group: "Aberration", text: "Sprint through the snowfall: the flakes stream at you like stars", done: false, at: [-60, 40, 0, 0] },
      { group: "Aberration", text: "Ride the steam train round the valley (E at the little station)", done: false, at: [4, 74, Math.PI, 0] },
    ];
    let note = "Light here moves at 7 m/s. The church bell rings every 30 seconds: you'll hear it at once, and see it swing a moment later.";
    let lastBell = 0, sprintSnow = 0, lastTwinkle = -1, clockWatch = 0;
    const fwd = new THREE.Vector3();

    return {
      group,
      colliders,
      walk: [[-210, -260, 210, 160]],
      spawn: [-6, 4, 0.15],
      env: DUSK.env,
      ambience: "snow",
      post: DUSK.post,
      goals,
      tips: [
        "From the edge of the village the church clock is about 100 m away. Its light takes some 14 seconds to reach you, so it always reads behind.",
        "Sound here is ordinary, 343 m/s, fifty times faster than light. Close your eyes and you'd know where the train is; open them and it's somewhere else.",
        "On the carousel your watch runs slower than the village's. Ride long enough and you come off younger.",
        "Snowflakes ahead pile up toward the center of your view when you run. That's aberration, the same reason the stars crowd forward in space.",
      ],
      get note() { return note; },
      readouts() {
        const seenClock = retardedTime(player.eye, clockPos);
        return [
          ["light speed", `${world.c.toFixed(1)} m/s`],
          ["church clock (seen)", seenClock >= 0 ? `${seenClock.toFixed(1)} s` : "from before you came"],
          ["village time now", `${world.t.toFixed(1)} s`],
          ["carousel rim", `${(CAR_SPEED * 100).toFixed(0)}% c`],
          ["steam train", `${(TRAIN_SPEED * 100).toFixed(0)}% c`],
        ];
      },
      engineSeen(eye) {
        const all = engines.map((e) => trainAt(seenTimeOf((tt) => trainAt(tt, e.chimney0), eye, world.t, 200), e.chimney0));
        return all.sort((a, b) => a.distanceTo(eye) - b.distanceTo(eye))[0];
      },
      sound(eye) {
        // The train's rumble sits where it really is: sound beats light here.
        return riding === trainSeat ? { pos: eye, D: 1, riding: true } : null;
      },
      action() {
        if (riding) {
          return {
            label: riding === carouselSeat ? "Step off the carousel" : "Step off the train",
            run: () => {
              const was = riding;
              riding = null;
              player.alight();
              sfx.alight();
              if (was === carouselSeat) {
                const out = player.pos.clone().sub(CAROUSEL).setY(0).setLength(CAR_R + 1.6);
                player.pos.set(CAROUSEL.x + out.x, 0, CAROUSEL.z + out.z);
                const younger = (world.t - rideStart.t) - (player.tau - rideStart.tau);
                toast(`You rode for ${(player.tau - rideStart.tau).toFixed(1)} s by your watch; ${(world.t - rideStart.t).toFixed(1)} s passed in the village. You're ${younger.toFixed(2)} s younger than you'd have been.`, 9);
              } else {
                const out = player.pos.clone().sub(LOOP).setY(0).setLength(LOOP_R + 3.5);
                player.pos.set(LOOP.x + out.x, 0, LOOP.z + out.z);
              }
            },
          };
        }
        if (player.pos.distanceTo(CAROUSEL) < CAR_R + 2.5) {
          return {
            label: "Ride the carousel",
            run: () => {
              const out = player.pos.clone().sub(CAROUSEL).setY(0).setLength(CAR_R - 0.3);
              carouselSeat.r0 = spin(out, -angleOf(cr, world.t));
              lastAngle = angleOf(cr, world.t);
              // Face the way the rim is going.
              const tangent = new THREE.Vector3(0, 1, 0).cross(out).normalize();
              player.yaw = Math.atan2(-tangent.x, -tangent.z);
              player.pitch = -0.05;
              riding = carouselSeat;
              rideStart = { tau: player.tau, t: world.t };
              player.board(carouselSeat);
              sfx.board();
            },
          };
        }
        if (Math.hypot(player.pos.x - station.x, player.pos.z - station.z - 3) < 9) {
          const stop = new THREE.Vector3(station.x, 4, station.z);
          const eng = engines.find((e) => trainAt(world.t, e.chimney0).distanceTo(stop) < 40);
          if (!eng) return { label: "Wait for the train", run: () => {} };
          const chimney0 = eng.chimney0;
          return {
            label: "Board the steam train",
            run: () => {
              const coach = spin(chimney0.clone().sub(LOOP), -0.32 + angleOf(tr, world.t)).setY(0).setLength(LOOP_R);
              trainSeat.r0 = spin(coach, -angleOf(tr, world.t));
              lastAngle = angleOf(tr, world.t);
              riding = trainSeat;
              player.board(trainSeat);
              sfx.board();
              goals[4].done = true;
              toast("All aboard. As you circle the valley, watch the village swing and squeeze in the direction you're going.", 8);
            },
          };
        }
        return null;
      },
      update({ eye, camera, t, dTau }) {
        smokeStacks.update(t);
        const seenClock = retardedTime(eye, clockPos);
        faces.forEach((f) => f.set(seenClock));
        // The bell swings for a few seconds after each hour, seen with delay; heard at once.
        const k = Math.floor(seenClock / BELL_EVERY), since = seenClock - k * BELL_EVERY;
        bell.rotation.z = since < 6 ? Math.sin(since * 4) * 0.5 * (1 - since / 6) : 0;
        const heardK = Math.floor((t - clockPos.distanceTo(eye) / SOUND_SPEED) / BELL_EVERY);
        if (heardK !== lastBell && t > 1) {
          lastBell = heardK;
          sfx.bell(clockPos);
          const lag = clockPos.distanceTo(eye) / C;
          note = `Bong. The bell's sound reached you almost at once; you'll see it swing ${lag.toFixed(1)} s later.`;
        }
        camera.getWorldDirection(fwd);
        const toClock = clockPos.clone().sub(eye).normalize();
        if (eye.distanceTo(clockPos) > 90 && fwd.dot(toClock) > 0.93) clockWatch += dTau;
        if (clockWatch > 2 && !goals[0].done) {
          goals[0].done = true;
          note = `The clock face is ${eye.distanceTo(clockPos).toFixed(0)} m away, so it shows the time ${(eye.distanceTo(clockPos) / C).toFixed(1)} s ago. Walk toward it and it will seem to run fast to catch up.`;
        }

        // Tree bulbs twinkle in three sets on one clock.
        for (const tw of twinkles) {
          const on = Math.floor(retardedTime(eye, tw.p) * 1.5) % 3 === tw.phase;
          tw.m.uniforms.uColor.value.copy(tw.base).multiplyScalar(on ? 1.2 : 0.25);
        }

        // Steam: puffs leave the chimney where it really is and drift up.
        for (const e of engines) {
          const chim = trainAt(t, e.chimney0);
          if (t > e.chuffAt) {
            e.chuffAt = t + 0.32 * gammaOf(TRAIN_SPEED);
            e.chuffN++;
            const vel = new THREE.Vector3(0, 1, 0).cross(chim.clone().sub(LOOP)).multiplyScalar(omegaTrain);
            for (let i = 0; i < 3; i++) {
              smoke.set({ origin: chim, vel: vel.clone().multiplyScalar(0.15).add(new THREE.Vector3((rand() - 0.5) * 0.6, 1.1 + rand() * 0.5, (rand() - 0.5) * 0.6)), birth: t, life: 4, color: new THREE.Color("#c8d0e0"), size: 0.7 + rand() * 0.6 });
            }
            if (riding !== trainSeat) sfx.chuff(chim, e.chuffN % 4 === 0 ? 1.3 : 0.8);
            if (e.chuffN % 60 === 0) sfx.whistle(chim);
          }
          const seenPos = trainAt(seenTimeOf((tt) => trainAt(tt, e.chimney0), eye, t, 200), e.chimney0);
          const lookingAtIt = fwd.dot(seenPos.clone().sub(eye).normalize()) > 0.8;
          if (lookingAtIt && chim.distanceTo(eye) < 45 && chim.distanceTo(seenPos) > 18 && !goals[1].done) {
            goals[1].done = true;
            note = `The engine is ${chim.distanceTo(seenPos).toFixed(0)} m ahead of where you see it. Its puffing comes from where it really is.`;
          }
        }

        // Carousel music box, and the dilation goal.
        if (riding === carouselSeat && (world.t - rideStart.t) - (player.tau - rideStart.tau) > 3 && !goals[2].done) {
          goals[2].done = true;
        }
        const beat = Math.floor(t * 3);
        if (beat !== lastTwinkle) {
          lastTwinkle = beat;
          if (eye.distanceTo(CAROUSEL) < 40) {
            const tune = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1046, 988, 784, 659, 587];
            sfx.note(tune[beat % tune.length], CAROUSEL.clone().setY(3));
          }
        }

        if (player.beta > 0.85 && !player.vehicle) sprintSnow += dTau;
        if (sprintSnow > 1.5 && !goals[3].done) {
          goals[3].done = true;
          note = "Running into the snow, flakes from all around crowd toward the point you're heading for, and shine bluer. Behind you they thin out and redden.";
        }

        // Fireworks over the church now and then.
        while (t + 12 > nextShell) {
          const at = new THREE.Vector3(CHURCH.x + (fw.rand() - 0.5) * 70, 34 + fw.rand() * 14, CHURCH.z - 40 + (fw.rand() - 0.5) * 30);
          fw.shell(new THREE.Vector3(CHURCH.x, 1, CHURCH.z - 40), at, nextShell, { count: 160 });
          nextShell += 6 + fw.rand() * 8;
        }
        fw.update(eye);
      },
    };
  },
};
