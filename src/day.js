import * as THREE from "three";
import { shared } from "./shaders.js";

// A sky that changes with the time of day, round and round. Keys are sorted
// by phase p; the last key's p is one whole day, and its key should match the
// first so the loop is seamless. Everything in between is blended.
export class DayCycle {
  constructor(keys, { length = 180, azimuth = [-0.45, -0.89], start = 0, moon = [0.35, 0.62, 0.7], moonColor = [0.24, 0.29, 0.48] } = {}) {
    this.moonDir = new THREE.Vector3(...moon).normalize();
    this.moonColor = moonColor;
    this.keys = keys.map((k) => ({
      ...k,
      top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog),
      lit: new THREE.Color(k.lit), shade: new THREE.Color(k.shade),
    }));
    this.length = length;
    this.az = Math.atan2(azimuth[1], azimuth[0]);
    this.period = this.keys.at(-1).p;
    this.offset = start;
    this.now = start;
  }

  // The phase keeps counting up past one day; p mod period is the time of day.
  phaseAt(t) {
    return this.offset + t / this.length;
  }

  // Phase p of day number `day` (0 = the day that contains phase P now).
  dayOf(P = this.phase) {
    return Math.floor(P / this.period);
  }

  // Jump to phase p at world time t; time keeps running from there.
  set(p, t) {
    this.offset = p - t / this.length;
  }

  // Jump to time of day p (0 to one period), keeping today's date.
  jumpTo(p, t) {
    this.set(this.dayOf(this.phaseAt(t)) * this.period + p, t);
    this.apply(t);
  }

  // The sky's colours through the day, for a CSS gradient.
  gradient() {
    return this.keys.map((k) => `${k.hor.clone().lerp(k.top, 0.45).getStyle()} ${((100 * k.p) / this.period).toFixed(1)}%`).join(", ");
  }

  // A wall clock for the current time of day (or phase p), from keys' `hour` values.
  clock(p = this.now) {
    const ks = this.keys.filter((k) => k.hour !== undefined);
    let i = 0;
    while (i < ks.length - 2 && ks[i + 1].p < p) i++;
    const a = ks[i], b = ks[i + 1];
    const k = THREE.MathUtils.clamp((p - a.p) / Math.max(1e-6, b.p - a.p), 0, 1);
    const h = (((a.hour + (b.hour - a.hour) * k) % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return { text: `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`, sun: shared.uSunDisk.value > 0.5 };
  }

  // World time at which the phase reaches p.
  timeOf(p) {
    return (p - this.offset) * this.length;
  }

  apply(t) {
    this.phase = this.phaseAt(t);
    const p = ((this.phase % this.period) + this.period) % this.period;
    this.now = p;
    const ks = this.keys;
    let i = 0;
    while (i < ks.length - 2 && ks[i + 1].p < p) i++;
    const a = ks[i], b = ks[i + 1];
    const k = THREE.MathUtils.clamp((p - a.p) / Math.max(1e-6, b.p - a.p), 0, 1);
    const lerp = (x, y) => x + (y - x) * k;
    const arr = (x, y) => x.map((v, j) => lerp(v, y[j]));
    const elev = lerp(a.elev, b.elev);
    const az = lerp(a.az ?? this.az, b.az ?? this.az);
    const c = Math.cos(elev);
    // After sunset the moon takes over as the light (and shadow) source. The
    // sunlight fades to nothing before the switch, so it never jumps.
    const sunFade = THREE.MathUtils.smoothstep(elev, -0.075, -0.02);
    if (elev > -0.075) {
      shared.uSun.value.set(Math.cos(az) * c, Math.sin(elev), Math.sin(az) * c).normalize();
      shared.uSunColor.value.setRGB(...arr(a.sun, b.sun)).multiplyScalar(sunFade);
      shared.uSunDisk.value = 1;
      shared.uMoon.value = 0;
    } else {
      const moonUp = THREE.MathUtils.smoothstep(-elev, 0.075, 0.13);
      shared.uSun.value.copy(this.moonDir);
      shared.uSunColor.value.setRGB(...this.moonColor).multiplyScalar(moonUp);
      shared.uSunDisk.value = 0;
      shared.uMoon.value = moonUp;
    }
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
