import * as THREE from "three";
import { addVelocity, effects, gammaOf, world } from "./relativity.js";

const EYE_HEIGHT = 1.6;
// Your legs give you a proper velocity (distance on the deck per tick of your
// own watch), sized to each place's light speed so a walk is about 0.53c
// and a sprint 0.95c. The Lab's light-speed slider doesn't change them, so
// with a realistic c they're just an ordinary walk and sprint.
const WALK_U = 0.63; // × the place's light speed
const SPRINT_U = 3.04;
const BOOST_U = 9.95; // the afterburner: 99.5% of light speed, γ = 10

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
    this.mouseWalk = false; // left button held while the mouse is captured
    this.pace = 1; // 0 walk, 1 sprint, 2 afterburner: set by the buttons or the scroll wheel
    this.legs = 3; // the light speed your stride is sized for, m/s
    this.rocket = false; // the endless road: throttle builds rapidity without limit
    this.eta = 0;
    this.ship = null; // aboard a starship: { pos, heading, eta, helm, local, seat, walk, colliders, maxEta }
    this.walkU = new THREE.Vector3();
    this.stride = 0;
    this.bob = 0;
    this.bindInput();
  }

  get beta() {
    return this.v.length() / world.c;
  }

  // From proper velocity when it's your own, which stays exact near light speed.
  get gamma() {
    if (this.vehicle) return gammaOf(this.beta);
    return Math.sqrt(1 + this.u.lengthSq() / (world.c * world.c));
  }

  // 1 - β, exact even at 99.99999…% of light speed.
  get omb() {
    if (this.vehicle) return 1 - this.beta;
    const g = this.gamma, b = Math.sqrt(this.u.lengthSq()) / (world.c * g);
    return 1 / (g * g * (1 + b));
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.bike ? 1.35 : EYE_HEIGHT) + this.bob, this.pos.z);
  }

  // On the scooter: W throttle, S brake, A/D (or drag) steer, Shift/Space for more.
  mountBike() {
    this.bike = { u: 0 };
    this.u.set(0, 0, 0);
  }

  dismount() {
    this.bike = null;
    this.u.set(0, 0, 0);
    this.v.set(0, 0, 0);
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.u.set(0, 0, 0);
    this.v.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.vehicle = null;
    this.bike = null;
  }

  setPace(p) {
    this.pace = Math.max(0, Math.min(2, p));
    if (this.pace === 0) this.easeToWalk();
    this.onPace?.(this.pace);
  }

  // On the endless road: drop back to a walking pace and coast there.
  easeToWalk() {
    if (this.rocket && this.eta > Math.asinh(WALK_U)) this.easing = true;
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
    this.pos.y = 0;
  }

  get busy() {
    return !!(this.vehicle || this.bike);
  }

  bindInput() {
    const MOVE = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    addEventListener("keydown", (e) => {
      if (e.target.closest?.("input, select, textarea")) return;
      this.keys.add(e.code);
      if (MOVE.has(e.code)) this.usedKeys = true; // you've found the keys: no need for the mouse hint
      if (e.code === "AltLeft" || e.code === "AltRight") e.preventDefault(); // Alt walks; don't open browser menus
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    // The mouse stays free: drag to look around; press and hold (without
    // dragging much) to walk forward, and keep dragging to steer as you go.
    let drag = null;
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) this.lookBack = true;
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      this.canvas.classList.add("dragging");
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (drag && drag.moved < 8) this.mouseWalk = true;
      }, 280);
    });
    addEventListener("mousemove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw += dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0042, -1.2, 1.2);
      this.dragged = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 2) this.lookBack = false;
      if (e.button !== 0) return;
      drag = null;
      clearTimeout(this.holdTimer);
      this.mouseWalk = false;
      this.canvas.classList.remove("dragging");
    });
    // Scroll (or swipe on a trackpad) to change pace; a pause between flicks
    // lets one swipe count once.
    let wheelAcc = 0, wheelAt = 0;
    this.canvas.addEventListener("wheel", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt > 250) wheelAcc = 0;
      wheelAt = now;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) > 60) {
        this.setPace(this.pace + (wheelAcc < 0 ? 1 : -1));
        wheelAcc = 0;
        wheelAt = now + 300; // ignore the rest of this swipe
      }
    }, { passive: false });
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
          this.touchBoost = this.touchMove.length() > 1.45;
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
          this.touchSprint = this.touchBoost = false;
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
    if (!this.bike) this.yaw += turn * 2.2 * dTau;

    let fwd = (k.has("KeyW") || k.has("ArrowUp") || this.mouseWalk ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let side = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    fwd -= this.touchMove.y;
    side += this.touchMove.x;
    if (!this.enabled || this.rocket) fwd = side = 0;
    // The pace you've picked, one step faster while Shift is held and one step
    // slower while Alt (Option) is.
    const shift = k.has("ShiftLeft") || k.has("ShiftRight") || this.touchSprint;
    const slow = k.has("AltLeft") || k.has("AltRight");
    const stepped = Math.min(2, Math.max(0, this.pace + (shift ? 1 : 0) - (slow ? 1 : 0)));
    const held = (shift && k.has("Space")) || this.touchBoost ? 2 : stepped;
    this.heldPace = held;
    const sprint = held >= 1 && !this.vehicle;
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
    const boost = sprint && held >= 2;
    this.paceNow = boost ? 2 : sprint ? 1 : 0;
    const going = (fwd !== 0 || side !== 0) && !this.vehicle;
    this.walkingFor = going && !sprint ? (this.walkingFor ?? 0) + dTau : 0;
    const legs = this.legs;
    if (this.ship) return this.shipUpdate(dTau, dir, held >= 2, lookBackKey);

    if (!this.bike && !this.rocket) {
      const target = dir.multiplyScalar((boost ? BOOST_U : sprint ? SPRINT_U : WALK_U) * legs);
      // Slowing down is quick, so letting go of the keys doesn't coast you far.
      const braking = target.lengthSq() < this.u.lengthSq();
      const rate = (braking ? 7 : boost ? 6 : sprint ? 2.7 : 2) * legs * dTau;
      const delta = target.sub(this.u);
      if (delta.length() > rate) delta.setLength(rate);
      this.u.add(delta);
    }

    if (this.rocket) {
      // Rapidity adds up: each second of throttle multiplies how fast the road
      // goes by, so you creep ever closer to light speed but never reach it.
      const up = (k.has("KeyW") || k.has("ArrowUp") || this.mouseWalk || this.touchMove.y < -0.3) && this.enabled;
      const down = (k.has("KeyS") || k.has("ArrowDown") || this.touchMove.y > 0.3) && this.enabled;
      const hard = this.heldPace >= 2 || k.has("Space");
      // Braking takes off a share of your rapidity each second, so it takes
      // about two seconds from any speed.
      const brake = (1.5 + 1.3 * this.eta) * dTau;
      if (up) { this.eta += (hard ? 0.9 : 0.3) * dTau; this.easing = false; }
      if (down) { this.eta = Math.max(0, this.eta - brake); this.easing = false; }
      else if (this.easing) {
        this.eta = Math.max(Math.asinh(WALK_U), this.eta - brake);
        if (this.eta <= Math.asinh(WALK_U)) this.easing = false;
      }
      this.eta = Math.min(this.eta, 15);
      this.u.set(0, 0, -world.c * Math.sinh(this.eta));
      this.paceNow = up ? (hard ? 2 : 1) : 0;
      this.walkingFor = 0;
    }

    if (this.bike) {
      const b = this.bike;
      const legs = this.legs;
      const steer = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - this.touchMove.x;
      const speedK = Math.min(1, Math.abs(b.u) / legs);
      this.yaw += steer * (0.9 + 0.9 * (1 - speedK * 0.6)) * dTau * (this.enabled ? 1 : 0);
      const throttle = (k.has("KeyW") || k.has("ArrowUp") || this.mouseWalk || this.touchMove.y < -0.3) && this.enabled;
      const brake = (k.has("KeyS") || k.has("ArrowDown") || this.touchMove.y > 0.3) && this.enabled;
      const boost = this.heldPace >= 2 || k.has("Space");
      const top = (boost ? BOOST_U : SPRINT_U) * legs;
      if (throttle) b.u = Math.min(top, b.u + (b.u < 0 ? 6 : boost ? 3.5 : 2.2) * legs * dTau);
      else if (brake) b.u = Math.max(-0.4 * legs, b.u - 6 * legs * dTau);
      else b.u -= Math.sign(b.u) * Math.min(Math.abs(b.u), 1.2 * legs * dTau);
      this.u.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(b.u);
      this.paceNow = throttle ? (boost ? 2 : 1) : 0;
      this.walkingFor = 0;
    }

    // Seats (a coaster, a carousel horse) carry you along their own path.
    if (this.vehicle?.carry) {
      this.u.set(0, 0, 0);
      this.v.copy(this.vehicle.velocity);
      const dT = effects.dilation ? dTau * this.gamma : dTau;
      this.vehicle.carry(this.pos, world.t + dT);
      this.v.copy(this.vehicle.velocity);
      this.tau += dTau;
      this.looking = this.lookBack || lookBackKey;
      return dT;
    }

    this.ownVelocity();
    const dT = effects.dilation ? dTau * this.gamma : dTau;
    this.pos.addScaledVector(this.v, dT);
    // A gentle head bob while walking, by your own steps.
    const step = this.u.length() / legs;
    this.stride += step * dTau * 5.5;
    this.bob = this.vehicle || this.bike || this.rocket ? 0 : Math.sin(this.stride) * 0.035 * Math.min(1, step * 1.5);
    if (this.vehicle) this.vehicle.clamp(this.pos, world.t + dT);
    else {
      const before = this.u.clone();
      this.collide(scene);
      // Running into something on the scooter stops you.
      if (this.bike && this.u.distanceToSquared(before) > 1e-6) this.bike.u *= 0.2;
    }
    this.ownVelocity();
    this.tau += dTau;
    this.looking = this.lookBack || lookBackKey;
    return dT;
  }

  // Aboard a starship. At the helm, W/S change its rapidity and A/D turn it
  // (and you with it). Away from the helm you walk about the cabin, which is
  // at rest around you, while the ship carries on at whatever speed it had.
  shipUpdate(dTau, dir, hurry, lookBackKey) {
    const s = this.ship, k = this.keys, c = world.c, on = this.enabled ? 1 : 0;
    let up = false, down = false;
    if (s.helm) {
      up = (k.has("KeyW") || k.has("ArrowUp") || this.mouseWalk || this.touchMove.y < -0.3) && on;
      down = (k.has("KeyS") || k.has("ArrowDown") || this.touchMove.y > 0.3) && on;
      const hard = this.heldPace >= 2 || k.has("Space");
      // The scene can hold the throttle until the ship is pointing the right way.
      const [soft, strong] = s.accel ?? [0.3, 0.8];
      const rate = hard ? strong : soft;
      const thrust = up && (s.canThrust?.() ?? true);
      let gain = rate * dTau;
      // A ship that eases away: at low speed it gains speed in proportion to
      // what it has. Once clear, it makes up what the gentle start held back,
      // so the trip takes no longer.
      if (s.ease && thrust) {
        const eased = Math.min(rate, s.ease * (hard ? 1.5 : 1) * Math.max(s.eta, 5e-8));
        s.owed = (s.owed ?? 0) + (rate - eased) * dTau;
        const pay = eased >= rate ? Math.min(s.owed, rate * dTau) : 0;
        s.owed -= pay;
        gain = eased * dTau + pay;
      }
      if (s.eta < 1e-6 && !up) s.owed = 0;
      if (thrust) s.eta = Math.min(s.maxEta, s.eta + gain);
      const steer = ((k.has("KeyA") ? 1 : 0) - (k.has("KeyD") ? 1 : 0) - this.touchMove.x) * on;
      s.heading += steer * 0.5 * dTau;
      this.yaw += steer * 0.5 * dTau;
      s.local.set(s.seat[0], 0, s.seat[1]);
      this.walkU.set(0, 0, 0);
      this.paceNow = up ? (hard ? 2 : 1) : 0;
    } else {
      // An easy walk in the ship's own frame.
      const target = dir.clone().multiplyScalar(on * (hurry ? 3.4 : 2));
      const rate = (target.lengthSq() < this.walkU.lengthSq() ? 12 : 6) * dTau;
      const delta = target.sub(this.walkU);
      if (delta.length() > rate) delta.setLength(rate);
      this.walkU.add(delta);
      const ch = Math.cos(s.heading), sh = Math.sin(s.heading);
      const wx = this.walkU.x * dTau, wz = this.walkU.z * dTau;
      s.local.x += wx * ch - wz * sh;
      s.local.z += wx * sh + wz * ch;
      this.confine(s.local, this.walkU, s);
      this.paceNow = 0;
    }
    s.throttle = up;
    if (!up && down) s.eta = Math.max(0, s.eta - 1.4 * dTau);
    const h = s.heading, f = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
    this.u.copy(f).multiplyScalar(c * Math.sinh(s.eta));
    this.v.copy(f).multiplyScalar(c * Math.tanh(s.eta));
    const dT = effects.dilation ? dTau * Math.cosh(s.eta) : dTau;
    s.pos.addScaledVector(this.v, dT);
    const ch = Math.cos(h), sh = Math.sin(h);
    this.pos.set(s.pos.x + s.local.x * ch + s.local.z * sh, s.pos.y, s.pos.z - s.local.x * sh + s.local.z * ch);
    const step = this.walkU.length();
    this.stride += step * dTau * 2.6;
    this.bob = s.helm ? 0 : Math.sin(this.stride) * 0.03 * Math.min(1, step);
    this.walkingFor = 0;
    this.tau += dTau;
    this.looking = this.lookBack || lookBackKey;
    return dT;
  }

  // Keep a point on walkable rectangles and out of round obstacles.
  confine(p, u, { walk = [], colliders = [] }) {
    for (const o of colliders) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), r = o.r + 0.35;
      if (d < r && d > 1e-6) { p.x = o.x + (dx / d) * r; p.z = o.z + (dz / d) * r; }
    }
    if (walk.length && !walk.some(([x0, z0, x1, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) {
      let best = null, bd = Infinity;
      for (const [x0, z0, x1, z1] of walk) {
        const q = [THREE.MathUtils.clamp(p.x, x0, x1), THREE.MathUtils.clamp(p.z, z0, z1)];
        const dd = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2;
        if (dd < bd) { bd = dd; best = q; }
      }
      p.x = best[0];
      p.z = best[1];
    }
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
