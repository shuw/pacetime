// Planets, painted from noise: banded gas giants, rocky, icy and ocean
// worlds, some with rings. Shared by the places with planets to fly past.
import * as THREE from "three";

// Smooth noise, for painting planets.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
export function fbm(x, y, z, octaves = 5) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < octaves; i++) { sum += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return sum;
}

// A unit sphere with each vertex coloured by paint(point, colour).
export function paintedGeometry(segments, paint) {
  const g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.6));
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    paint(v.fromBufferAttribute(p, i), c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const C = (s) => new THREE.Color(s);
const GAS = [
  ["#f0c08a", "#c98a58", "#e8b07a", "#a8704a", "#f4d2a2"],
  ["#bfe3ff", "#6fa8e8", "#e2f2ff", "#4a82d8", "#9cc8f4"],
  ["#e0c8ff", "#9a7ae0", "#f4eaff", "#6a4ab8", "#c4a8f0"],
  ["#c8f0d4", "#6ab88a", "#eafff2", "#3f8a5c", "#a8dcb8"],
  ["#ffd0c0", "#e07a6a", "#fff0e8", "#b8504a", "#f4a890"],
].map((p) => p.map(C));
const ROCK = [["#6e3424", "#c27a4a"], ["#4a4a52", "#9a9aa4"], ["#5a5a3a", "#b0a070"], ["#3a2a3a", "#8a6a8a"]].map((p) => p.map(C));

// One planet's look: { geo, ring (a geometry, or null), tilt }.
export function planetLook(rand, kind = ["gas", "gas", "rock", "ice", "ocean"][Math.floor(rand() * 5)]) {
  const seed = rand() * 100, c = new THREE.Color();
  let paint;
  if (kind === "gas") {
    const pal = GAS[Math.floor(rand() * GAS.length)], bands = 6 + rand() * 8;
    paint = (v, out) => {
      const f = v.y * bands + 0.6 * fbm(v.x * 2 + seed, v.y * 2, v.z * 2) + 0.25 * Math.sin(v.x * 9 + seed);
      const k = Math.floor(f), w = THREE.MathUtils.smoothstep(f - k, 0.2, 0.8), n = pal.length;
      out.copy(pal[((k % n) + n) % n]).lerp(pal[(((k + 1) % n) + n) % n], w);
    };
  } else if (kind === "rock") {
    const [dark, light] = ROCK[Math.floor(rand() * ROCK.length)];
    paint = (v, out) => {
      const n = fbm(v.x * 2.5 + seed, v.y * 2.5, v.z * 2.5), crater = fbm(v.x * 7 + seed, v.y * 7, v.z * 7);
      out.copy(dark).lerp(light, THREE.MathUtils.smoothstep(n, 0.35, 0.65)).multiplyScalar(crater > 0.62 ? 0.75 : 1);
    };
  } else if (kind === "ice") {
    paint = (v, out) => {
      const n = fbm(v.x * 3 + seed, v.y * 3, v.z * 3), crack = Math.abs(fbm(v.x * 5 + seed, v.y * 5, v.z * 5) - 0.5);
      out.setRGB(0.82, 0.9, 1).lerp(c.setRGB(0.55, 0.72, 0.92), n).multiplyScalar(crack < 0.02 ? 0.7 : 1);
    };
  } else {
    const sea = C("#1f5aa8"), land = rand() < 0.5 ? C("#3f8a45") : C("#b08a5a"), ice = C("#f2f6ff");
    paint = (v, out) => {
      const n = fbm(v.x * 1.8 + seed, v.y * 1.8, v.z * 1.8), cloud = fbm(v.x * 3.2 + seed + 9, v.y * 3.2, v.z * 3.2);
      out.copy(n > 0.53 ? land : sea);
      if (Math.abs(v.y) > 0.86 - 0.08 * n) out.copy(ice);
      if (cloud > 0.55) out.lerp(ice, Math.min(1, (cloud - 0.55) * 5) * 0.85);
    };
  }
  const geo = paintedGeometry(40, paint);
  let ring = null;
  if (kind === "gas" ? rand() < 0.55 : kind === "ice" && rand() < 0.3) {
    ring = new THREE.RingGeometry(1.35 + rand() * 0.2, 2.1 + rand() * 0.6, 96, 12);
    const p = ring.attributes.position, col = new Float32Array(p.count * 3), base = kind === "gas" ? C("#e2cfa8") : C("#d8e8f8");
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)), k = 0.45 + 0.55 * vnoise(r * 9 + seed, 0, 0);
      col.set([base.r * k, base.g * k, base.b * k], i * 3);
    }
    ring.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  return { geo, ring, tilt: [(rand() - 0.5) * 1.2, rand() * 6.28, (rand() - 0.5) * 0.6] };
}
