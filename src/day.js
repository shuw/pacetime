import * as THREE from "three";
import { shared } from "./shaders.js";

// A sky that changes with the time of day. Keys are sorted by phase p in
// [0, 1]; everything in between is blended.
export class DayCycle {
  constructor(keys, { length = 180, azimuth = [-0.45, -0.89], start = 0 } = {}) {
    this.keys = keys.map((k) => ({
      ...k,
      top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog),
      lit: new THREE.Color(k.lit), shade: new THREE.Color(k.shade),
    }));
    this.length = length;
    this.az = new THREE.Vector2(...azimuth).normalize();
    this.offset = start;
    this.now = start;
  }

  phaseAt(t) {
    return THREE.MathUtils.clamp(this.offset + t / this.length, 0, 1);
  }

  // Jump to phase p at world time t; time keeps running from there.
  set(p, t) {
    this.offset = p - t / this.length;
  }

  // World time at which the phase reaches p.
  timeOf(p) {
    return (p - this.offset) * this.length;
  }

  apply(t) {
    const p = this.phaseAt(t);
    this.now = p;
    const ks = this.keys;
    let i = 0;
    while (i < ks.length - 2 && ks[i + 1].p < p) i++;
    const a = ks[i], b = ks[i + 1];
    const k = THREE.MathUtils.clamp((p - a.p) / Math.max(1e-6, b.p - a.p), 0, 1);
    const lerp = (x, y) => x + (y - x) * k;
    const arr = (x, y) => x.map((v, j) => lerp(v, y[j]));
    const elev = lerp(a.elev, b.elev);
    const c = Math.cos(elev);
    shared.uSun.value.set(this.az.x * c, Math.sin(elev), this.az.y * c).normalize();
    shared.uSunColor.value.setRGB(...arr(a.sun, b.sun));
    shared.uSky.value.setRGB(...arr(a.sky, b.sky));
    shared.uGround.value.setRGB(...arr(a.ground, b.ground));
    shared.uSkyTop.value.copy(a.top).lerp(b.top, k);
    shared.uSkyHorizon.value.copy(a.hor).lerp(b.hor, k);
    shared.uFog.value.copy(a.fog).lerp(b.fog, k);
    shared.uCloudLit.value.copy(a.lit).lerp(b.lit, k);
    shared.uCloudShade.value.copy(a.shade).lerp(b.shade, k);
    shared.uClouds.value = lerp(a.clouds, b.clouds);
    shared.uStars.value = lerp(a.stars, b.stars);
    shared.uNight.value = lerp(a.night, b.night);
    shared.uFogRange.value.set(lerp(a.fogNear, b.fogNear), lerp(a.fogFar, b.fogFar));
    this.bloom = { strength: lerp(a.bloom[0], b.bloom[0]), threshold: lerp(a.bloom[1], b.bloom[1]) };
    this.dark = lerp(a.dark ?? 0, b.dark ?? 0); // 0 in daylight, 1 at night
    return p;
  }
}
