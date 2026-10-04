import * as THREE from "three";
import { effects, frameTime, world } from "./relativity.js";

// Things that happen at a place and a world time. Each is logged the moment its
// light reaches the player, with the time it happened in the player's frame
// (light travel time taken out).
export class EventLog {
  constructor() {
    this.pending = [];
    this.seen = [];
    this.listeners = [];
  }

  add(label, t, pos, tag = "") {
    const e = { label, t, pos: pos.clone(), tag, seenTau: null, frameTau: null };
    this.pending.push(e);
    return e;
  }

  onSeen(fn) {
    this.listeners.push(fn);
  }

  update(player, eye) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      const reach = effects.delay ? e.pos.distanceTo(eye) / world.c : 0;
      if (world.t - e.t >= reach) {
        e.seenTau = player.tau;
        e.frameTau = player.tau + frameTime(e.t, e.pos, world.t, eye, player.v);
        e.riding = !!player.vehicle;
        this.pending.splice(i, 1);
        this.seen.push(e);
        this.listeners.forEach((fn) => fn(e));
      }
    }
  }

  clearPending(tag) {
    this.pending = this.pending.filter((e) => e.tag !== tag);
  }
}

export const fmtT = (s) => `${s.toFixed(2)} s`;
export { THREE };
