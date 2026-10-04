import * as THREE from "three";
import { addVelocity, effects, gammaOf, world } from "./relativity.js";

const EYE_HEIGHT = 1.6;
// Your legs give you a proper velocity (distance on the meadow per tick of
// your own watch). With c = 3 m/s these come out near 0.53c and 0.95c; with
// a realistic c they're just a walk and a sprint.
const WALK_U = 1.9;
const SPRINT_U = 9;

export class Player {
  constructor(canvas) {
    this.canvas = canvas;
    this.pos = new THREE.Vector3();
    this.u = new THREE.Vector3(); // proper velocity, m/s
    this.v = new THREE.Vector3(); // world-frame velocity, m/s
    this.yaw = 0;
    this.pitch = 0;
    this.tau = 0; // the player's own watch
    this.keys = new Set();
    this.lookBack = false;
    this.enabled = false;
    this.touchMove = new THREE.Vector2();
    this.touchSprint = false;
    this.vehicle = null; // a train you're riding, if any
    this.bindInput();
  }

  get beta() {
    return this.v.length() / world.c;
  }

  get gamma() {
    return gammaOf(this.beta);
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, EYE_HEIGHT, this.pos.z);
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.u.set(0, 0, 0);
    this.v.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.vehicle = null;
  }

  board(vehicle) {
    this.vehicle = vehicle;
    this.u.set(0, 0, 0);
  }

  // Stepping off stops you dead on the deck.
  alight() {
    this.vehicle = null;
    this.u.set(0, 0, 0);
    this.v.set(0, 0, 0);
  }

  bindInput() {
    addEventListener("keydown", (e) => {
      if (e.target.closest?.("input, select, textarea")) return;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.2, 1.2);
    });
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) this.lookBack = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) this.lookBack = false;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.bindTouch();
  }

  // Left half of the screen is a joystick, right half drags the view.
  bindTouch() {
    const sticks = new Map();
    const c = this.canvas;
    c.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) {
        sticks.set(t.identifier, { x: t.clientX, y: t.clientY, left: t.clientX < innerWidth / 2 });
      }
      e.preventDefault();
    }, { passive: false });
    c.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        const s = sticks.get(t.identifier);
        if (!s) continue;
        if (s.left) {
          const dx = (t.clientX - s.x) / 60, dy = (t.clientY - s.y) / 60;
          this.touchMove.set(THREE.MathUtils.clamp(dx, -1.5, 1.5), THREE.MathUtils.clamp(dy, -1.5, 1.5));
          this.touchSprint = this.touchMove.length() > 1.1;
        } else {
          this.yaw -= (t.clientX - s.x) * 0.005;
          this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - s.y) * 0.004, -1.2, 1.2);
          s.x = t.clientX;
          s.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (sticks.get(t.identifier)?.left) {
          this.touchMove.set(0, 0);
          this.touchSprint = false;
        }
        sticks.delete(t.identifier);
      }
    };
    c.addEventListener("touchend", end);
    c.addEventListener("touchcancel", end);
  }

  // dTau is real elapsed time, which is the player's proper time. Returns the
  // world time that passed meanwhile.
  update(dTau, scene) {
    const k = this.keys;
    const turn = (k.has("ArrowLeft") ? 1 : 0) - (k.has("ArrowRight") ? 1 : 0);
    this.yaw += turn * 2.2 * dTau;

    let fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let side = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    fwd -= this.touchMove.y;
    side += this.touchMove.x;
    if (!this.enabled) fwd = side = 0;
    const sprint = (k.has("ShiftLeft") || k.has("ShiftRight") || this.touchSprint) && !this.vehicle;
    this.lookBack = this.lookBack && this.enabled;
    const lookBackKey = k.has("KeyB") || k.has("KeyQ");

    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side,
      0,
      -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side,
    );
    if (dir.lengthSq() > 1) dir.normalize();

    // Steer proper velocity toward the target. Proper velocity has no ceiling,
    // so however hard you push you never reach c.
    const c = world.c;
    const target = dir.multiplyScalar(sprint ? SPRINT_U : WALK_U);
    const rate = (sprint ? 8 : 6) * dTau;
    const delta = target.sub(this.u);
    if (delta.length() > rate) delta.setLength(rate);
    this.u.add(delta);

    this.ownVelocity();
    const dT = effects.dilation ? dTau * this.gamma : dTau;
    this.pos.addScaledVector(this.v, dT);
    if (this.vehicle) this.vehicle.clamp(this.pos, world.t + dT);
    else this.collide(scene);
    this.ownVelocity();
    this.tau += dTau;
    this.looking = this.lookBack || lookBackKey;
    return dT;
  }

  // World-frame velocity: your own stride, carried along by any train.
  ownVelocity() {
    const c = world.c;
    this.v.copy(this.u).divideScalar(Math.sqrt(1 + this.u.lengthSq() / (c * c)));
    if (this.vehicle) this.v.copy(addVelocity(this.vehicle.velocity, this.v));
  }

  collide(scene) {
    const p = this.pos;
    for (const o of scene.colliders ?? []) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz), r = o.r + 0.4;
      if (d < r && d > 1e-6) {
        const nx = dx / d, nz = dz / d;
        p.x = o.x + nx * r;
        p.z = o.z + nz * r;
        const into = this.u.x * nx + this.u.z * nz;
        if (into < 0) { this.u.x -= into * nx; this.u.z -= into * nz; }
      }
    }
    if (scene.walk) {
      // Stay on the walkable rectangles: snap back to the nearest one.
      if (!scene.walk.some(([x0, z0, x1, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) {
        let best = null, bd = Infinity;
        for (const [x0, z0, x1, z1] of scene.walk) {
          const q = [THREE.MathUtils.clamp(p.x, x0, x1), THREE.MathUtils.clamp(p.z, z0, z1)];
          const dd = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2;
          if (dd < bd) { bd = dd; best = q; }
        }
        if (best[0] !== p.x) this.u.x = 0;
        if (best[1] !== p.z) this.u.z = 0;
        p.x = best[0];
        p.z = best[1];
      }
      return;
    }
    const R = scene.bounds ?? 100;
    const d = Math.hypot(p.x, p.z);
    if (d > R) {
      p.x *= R / d;
      p.z *= R / d;
      const nx = p.x / R, nz = p.z / R;
      const out = this.u.x * nx + this.u.z * nz;
      if (out > 0) { this.u.x -= out * nx; this.u.z -= out * nz; }
    }
  }

  applyTo(camera) {
    camera.position.copy(this.eye);
    camera.rotation.set(this.pitch, this.yaw + (this.looking ? Math.PI : 0), 0, "YXZ");
    if (this.looking) camera.rotation.x = -this.pitch * 0.3;
  }
}
