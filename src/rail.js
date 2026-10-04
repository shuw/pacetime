import * as THREE from "three";
import { box, G, mesh } from "./geo.js";
import { ghostOf, mat } from "./shaders.js";
import { effects, gammaOf, seenTimeOf, world } from "./relativity.js";
import { PALETTE } from "./world.js";

// A glass maglev train on a straight track along x, moving at a fixed fraction
// of light speed. It is built around its own center; the shader places it in
// spacetime from the shared mover uniforms.
export class Train {
  constructor({ cars = 5, carLen = 12, gap = 0.6, fraction = 0.8, z = 0, width = 3.4, height = 3.1, clip = null } = {}) {
    this.fraction = fraction;
    this.z = z;
    this.width = width;
    this.length = cars * carLen + (cars - 1) * gap;
    this.x0 = -1e6;
    this.mover = {
      uVel: { value: new THREE.Vector3() },
      uAnchor: { value: new THREE.Vector3(this.x0, 0, z) },
    };
    this.group = new THREE.Group();
    this.clip = clip;
    const m = (o) => ({ ...o, mover: this.mover, rect: clip });
    const add = (o) => (this.group.add(o), o);
    const glass = m({ color: PALETTE.glass, additive: true, opacity: 0.16, ir: 0.1, uv: 0.3 });
    const frame = m({ color: PALETTE.edge, emissive: 0.6, ir: 0.3, uv: 0.5 });
    const strip = m({ color: PALETTE.edge, emissive: 1, ir: 0.5, uv: 0.8 });
    for (let i = 0; i < cars; i++) {
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

  get v() {
    return this.fraction * world.c;
  }

  get gamma() {
    return 1 / Math.sqrt(1 - this.fraction ** 2);
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
    this.mover.uAnchor.value.set(this.x0, 0, this.z);
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
    const n = pos.clone().sub(eye).normalize();
    const bo = player.v.clone().divideScalar(world.c);
    const bs = this.vehicle.velocity.clone().divideScalar(world.c);
    const D = (gammaOf(bo.length()) * (1 + bo.dot(n))) / (gammaOf(bs.length()) * (1 + bs.dot(n)));
    return { pos, D: effects.doppler ? D : 1, riding };
  }

  isOn(p, t) {
    return Math.abs(p.x - this.centerAt(t)) < this.halfLength && Math.abs(p.z - this.z) < this.width / 2;
  }
}

export { G };
