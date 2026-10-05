import * as THREE from "three";
import { box, G, mesh } from "./geo.js";
import { ghostOf, mat } from "./shaders.js";
import { dopplerBetween, effects, gammaOf, seenTimeOf, world } from "./relativity.js";
import { govern, motion } from "./motion.js";
import { PALETTE } from "./world.js";
import { personGeometry, randomLook } from "./people.js";
import { rng } from "./geo.js";

// A glass maglev train on a straight track along x, moving at a fixed fraction
// of light speed. It is built around its own center; the shader places it in
// spacetime from the shared mover uniforms.
export class Train {
  // look: { body, roof, trim, seed } for a painted carriage with big windows
  // and passengers; without it, the glass maglev of the space stations.
  constructor({ cars = 5, carLen = 12, gap = 0.6, fraction = 0.8, z = 0, width = 3.4, height = 3.1, clip = null, look = null } = {}) {
    this.speed = fraction * world.c; // its own speed, m/s
    this.vNow = this.speed;
    motion.add((dT, t, c) => {
      const v = govern(this.speed, c);
      if (v === this.vNow) return;
      const x = this.centerAt(t);
      this.vNow = v;
      this.x0 = x - v * t;
    });
    this.z = z;
    this.width = width;
    this.length = cars * carLen + (cars - 1) * gap;
    this.x0 = -1e6;
    this.mover = {
      uVel: { value: new THREE.Vector3() },
      uNow: { value: new THREE.Vector3(this.x0, 0, z) },
    };
    this.group = new THREE.Group();
    this.clip = clip;
    const m = (o) => ({ ...o, mover: this.mover, rect: clip });
    const add = (o) => (this.group.add(o), o);
    if (look) this.paint(look, { cars, carLen, gap, width, height, m, add });
    const glass = m({ color: PALETTE.glass, additive: true, opacity: 0.16, ir: 0.1, uv: 0.3 });
    const frame = m({ color: PALETTE.edge, emissive: 0.6, ir: 0.3, uv: 0.5 });
    const strip = m({ color: PALETTE.edge, emissive: 1, ir: 0.5, uv: 0.8 });
    for (let i = 0; i < (look ? 0 : cars); i++) {
      const cx = this.length / 2 - carLen / 2 - i * (carLen + gap);
      add(box(carLen, 0.3, width, m({ color: "#0d0e15", grid: { color: "#3a3150", spacing: 1, width: 0.6, glow: 0.2 }, ir: 0.05 }), [cx, -0.09, 0]));
      for (const s of [-1, 1]) {
        add(box(carLen, height, 0.04, glass, [cx, height / 2, (s * width) / 2]));
        add(box(carLen, 0.06, 0.06, strip, [cx, 0.08, (s * width) / 2]));
        add(box(carLen, 0.06, 0.06, strip, [cx, height, (s * width) / 2]));
        for (const e of [-1, 1]) add(box(0.05, height, 0.05, frame, [cx + (e * (carLen - 0.05)) / 2, height / 2, (s * width) / 2]));
      }
      add(box(carLen, 0.04, width, glass, [cx, height, 0]));
      for (const e of [-1, 1]) add(box(0.04, height, width, glass, [cx + (e * carLen) / 2, height / 2, 0]));
      add(box(carLen * 0.94, 0.03, 0.06, m({ color: "#dfe6ff", emissive: 0.9, ir: 0.6, uv: 0.6 }), [cx, height - 0.03, 0]));
    }
    // Headlights forward, tail lights behind.
    add(box(0.12, 0.35, width * 0.8, m({ color: "#ffffff", emissive: 1, ir: 1.5, uv: 1.5 }), [this.length / 2 + 0.05, 0.7, 0]));
    add(box(0.12, 0.3, width * 0.8, m({ color: "#ff3030", emissive: 1, ir: 1.5, uv: 0.2 }), [-this.length / 2 - 0.05, 0.7, 0]));
    this.group.add(ghostOf(this.group));
    this.vehicle = {
      velocity: new THREE.Vector3(),
      clamp: (p, t) => {
        const c = this.centerAt(t), h = this.halfLength - 0.4;
        p.x = THREE.MathUtils.clamp(p.x, c - h, c + h);
        p.z = THREE.MathUtils.clamp(p.z, this.z - width / 2 + 0.5, this.z + width / 2 - 0.5);
      },
    };
  }

  // A painted carriage: solid below the windows and above them, a wide band
  // of glass between, a pale roof, and a passenger or two at every window.
  paint(look, { cars, carLen, gap, width, height, m, add }) {
    const rand = rng(look.seed ?? 3);
    const body = m({ color: look.body, ir: 0.5, uv: 0.2 });
    const roof = m({ color: look.roof, ir: 0.5, uv: 0.3 });
    const trim = m({ color: look.trim, ir: 0.6, uv: 0.4 });
    const dark = m({ color: "#2a2a33", ir: 0.2 });
    const glass = m({ color: "#9fd4ff", additive: true, opacity: 0.12, ir: 0.1, uv: 0.3 });
    const sill = 1.0, lintel = 2.55;
    for (let i = 0; i < cars; i++) {
      const cx = this.length / 2 - carLen / 2 - i * (carLen + gap);
      add(box(carLen, 0.3, width, dark, [cx, -0.09, 0]));
      add(box(carLen - 0.6, 0.25, width * 0.7, dark, [cx, -0.35, 0])); // bogies and underframe
      for (const s of [-1, 1]) {
        const z = (s * width) / 2;
        add(box(carLen, sill, 0.08, body, [cx, sill / 2, z]));
        add(box(carLen, height - lintel, 0.08, body, [cx, (height + lintel) / 2, z]));
        add(box(carLen, 0.07, 0.1, trim, [cx, sill, z]));
        add(box(carLen, 0.07, 0.1, trim, [cx, lintel, z]));
        add(box(carLen, lintel - sill, 0.04, glass, [cx, (sill + lintel) / 2, z]));
        for (let k = 0; k <= 5; k++) add(box(0.14, lintel - sill, 0.09, body, [cx - carLen / 2 + 0.07 + (k * (carLen - 0.14)) / 5, (sill + lintel) / 2, z]));
      }
      add(box(carLen + 0.1, 0.16, width + 0.12, roof, [cx, height + 0.06, 0]));
      add(box(carLen * 0.9, 0.12, width * 0.5, roof, [cx, height + 0.2, 0]));
      for (const e of [-1, 1]) {
        const x = cx + (e * carLen) / 2;
        add(box(0.08, sill, width, body, [x, sill / 2, 0]));
        add(box(0.08, height - lintel, width, body, [x, (height + lintel) / 2, 0]));
        add(box(0.04, lintel - sill, width, glass, [x, (sill + lintel) / 2, 0]));
      }
      // Passengers at the windows: some sit and gaze, some wave.
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
        if (rand() < 0.3) continue;
        const pose = rand() < 0.4 ? "wave" : "ride";
        const g = personGeometry(randomLook(rand), { scale: 0.62, pose });
        const p = this.carry(g, mat(m({ color: "#ffffff", vertexColors: true, ir: 0.4, uv: 0.2 })), cx - carLen / 2 + 1.6 + k * 2.9, 0.55, s * (width / 2 - 0.6));
        this.carry(G.box, mat(m({ color: "#3a5a8a", ir: 0.4 })), cx - carLen / 2 + 1.6 + k * 2.9, 0.4, s * (width / 2 - 0.6), [0.6, 0.12, 0.55]); // the seat
        p.rotation.y = s > 0 ? Math.PI : 0; // facing out of their window
      }
    }
    // A rounded nose with a big headlight, and a lamp at the tail.
    add(box(0.5, height * 0.8, width * 0.9, body, [this.length / 2 + 0.25, height * 0.42, 0]));
    add(box(0.12, 0.4, 0.9, m({ color: "#fff6d8", emissive: 1, ir: 1.5, uv: 1.2 }), [this.length / 2 + 0.52, 0.9, 0]));
  }

  get v() {
    return this.vNow;
  }

  get gamma() {
    return gammaOf(this.vNow / world.c);
  }

  get fraction() {
    return this.vNow / world.c;
  }

  // Length along the track in the world (platform) frame.
  get halfLength() {
    return effects.dilation ? this.length / 2 / this.gamma : this.length / 2;
  }

  // Put the train's center at x at world time t.
  dispatch(t, x) {
    this.x0 = x - this.v * t;
  }

  centerAt(t) {
    return this.x0 + this.v * t;
  }

  // World time when the train's center passes x.
  timeAt(x) {
    return (x - this.x0) / this.v;
  }

  // World position at time t of a point fixed on the train, `local` along it
  // (proper distance from the center).
  pointAt(local, t, y = 1.5) {
    const k = effects.dilation ? 1 / this.gamma : 1;
    return new THREE.Vector3(this.centerAt(t) + local * k, y, this.z);
  }

  update() {
    this.mover.uVel.value.set(this.v, 0, 0);
    this.mover.uNow.value.set(this.x0 + this.v * world.t, 0, this.z);
    this.vehicle.velocity.set(this.v, 0, 0);
  }

  // A material on the train that only exists between world times t0 and t1.
  lifeMat(opts, t0 = -1e9, t1 = 1e9) {
    return mat({ ...opts, rect: this.clip, mover: { ...this.mover, uLife: { value: new THREE.Vector2(t0, t1) } } });
  }

  // A mesh carried by the train at a fixed spot (proper coordinates).
  carry(geo, material, local, y = 0, dz = 0, scale = 1) {
    const o = mesh(geo, material, { pos: [local, y, dz], scale });
    this.group.add(o);
    return o;
  }

  // Where you see the train's middle, and the Doppler factor of its light,
  // for its sound. Silent once it's beyond a portal.
  audio(eye, player) {
    const riding = player.vehicle === this.vehicle;
    const path = (t) => this.pointAt(0, t, 1.5);
    const pos = path(seenTimeOf(path, eye));
    if (this.clip && (pos.x < this.clip[0] - this.halfLength || pos.x > this.clip[2] + this.halfLength)) return null;
    if (riding) return { pos, D: 1, riding };
    const D = dopplerBetween(pos.clone().sub(eye).normalize(), player.v, this.vehicle.velocity);
    return { pos, D: effects.doppler ? D : 1, riding };
  }

  isOn(p, t) {
    return Math.abs(p.x - this.centerAt(t)) < this.halfLength && Math.abs(p.z - this.z) < this.width / 2;
  }
}

export { G };
