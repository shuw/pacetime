import * as THREE from "three";

// The title screen: each place as a little model on a round stand, drawn
// into its card. One renderer covers the whole screen and draws each model
// into its card's rectangle.

const std = (color, { emissive = 0, rough = 0.75, metal = 0, flat = true, opacity = 1 } = {}) =>
  new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: flat,
    emissive: emissive ? color : 0x000000, emissiveIntensity: emissive,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
const glow = (color, k = 1.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });

function part(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (Array.isArray(scale)) m.scale.set(...scale); else m.scale.setScalar(scale);
  parent.add(m);
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1), BALL = new THREE.SphereGeometry(1, 16, 12), CYL = new THREE.CylinderGeometry(1, 1, 1, 16);

// A round stand with a glowing rim, lights, and a camera looking down at it.
function stand({ accent, sky = "#9fb4ff", ground = "#1b1530", key = "#ffffff", keyAt = [3, 5, 4], top = "#15172a", base = true }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(sky, ground, 1.5));
  const sun = new THREE.DirectionalLight(key, 2.2);
  sun.position.set(...keyAt);
  scene.add(sun);
  const group = new THREE.Group();
  scene.add(group);
  if (base) {
    part(group, new THREE.CylinderGeometry(3, 2.7, 0.4, 64), std("#10111d"), [0, -0.2, 0]);
    part(group, new THREE.CylinderGeometry(2.98, 2.98, 0.02, 64), std(top), [0, 0.005, 0]);
    part(group, new THREE.TorusGeometry(3, 0.035, 8, 96), glow(accent, 1.6), [0, 0, 0], [Math.PI / 2, 0, 0]);
  }
  const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 100);
  return { scene, group, camera };
}

function starfield(scene, n = 260, r = 14) {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(r * (0.8 + Math.random() * 0.4));
    if (v.y < -2) v.y = -v.y;
    pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#dfe6ff", size: 0.05, sizeAttenuation: true })));
}

function funfair() {
  const s = stand({ accent: "#ffb36b", sky: "#ffcfa0", ground: "#4a2a5a", key: "#ffc890", keyAt: [-4, 3, 3], top: "#2a6f8f" });
  const g = s.group;
  // The sea, the pier and its legs.
  part(g, new THREE.CylinderGeometry(2.96, 2.96, 0.05, 64), std("#3e8fb0", { rough: 0.25, metal: 0.2 }), [0, 0.03, 0]);
  part(g, BOX, std("#a8754a"), [0, 0.42, 0.2], [0, 0, 0], [1.1, 0.08, 4.6]);
  for (let z = -2; z <= 2.4; z += 0.55) for (const x of [-0.45, 0.45]) part(g, CYL, std("#5a3a28"), [x, 0.2, z], [0, 0, 0], [0.04, 0.4, 0.04]);
  for (const x of [-0.53, 0.53]) part(g, BOX, std("#f4efe6"), [x, 0.6, 0.4], [0, 0, 0], [0.03, 0.03, 4]);
  // Kiosks with striped roofs.
  [[0.25, 1.4, "#ff6fa8"], [-0.25, 0.6, "#2ec4b6"]].forEach(([x, z, c]) => {
    part(g, BOX, std("#f4efe6"), [x, 0.62, z], [0, 0, 0], [0.32, 0.32, 0.32]);
    part(g, new THREE.ConeGeometry(0.3, 0.25, 8), std(c), [x, 0.9, z]);
  });
  // Lamps and bunting.
  const bulbs = glow("#ffe2a8");
  for (const z of [-0.6, 1.0, 2.2]) for (const x of [-0.5, 0.5]) {
    part(g, CYL, std("#23465a"), [x, 0.75, z], [0, 0, 0], [0.02, 0.6, 0.02]);
    part(g, BALL, bulbs, [x, 1.07, z], [0, 0, 0], 0.05);
  }
  const flags = ["#ff5a4a", "#ffbe0b", "#2ec4b6", "#8338ec", "#3a86ff"];
  for (let i = 0; i < 14; i++) {
    const z = -0.6 + (i / 13) * 2.8, sag = Math.sin((i / 13) * Math.PI) * 0.15;
    part(g, new THREE.ConeGeometry(0.04, 0.09, 3), std(flags[i % 5]), [0, 1.18 - sag, z], [Math.PI, 0, 0]);
  }
  // The Ferris wheel at the end of the pier.
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.85, -1.55);
  g.add(wheel);
  part(wheel, new THREE.TorusGeometry(1.25, 0.035, 8, 64), std("#f4efe6"));
  part(wheel, new THREE.TorusGeometry(1.1, 0.02, 6, 64), std("#f4efe6"));
  const gondolas = [];
  const colors = ["#ff5a4a", "#ffbe0b", "#2ec4b6", "#8338ec", "#ff8fd8", "#3a86ff"];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    part(wheel, BOX, std("#d8dce8"), [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0], [0, 0, a], [1.25, 0.02, 0.02]);
    const gd = new THREE.Group();
    gd.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0);
    part(gd, BOX, std(colors[i % 6]), [0, -0.12, 0], [0, 0, 0], [0.16, 0.14, 0.16]);
    wheel.add(gd);
    gondolas.push(gd);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    part(wheel, BALL, glow(i % 2 ? "#ffd166" : "#ff8fd8"), [Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0.04], [0, 0, 0], 0.03);
  }
  part(wheel, CYL, std("#565f8a"), [0, 0, 0], [Math.PI / 2, 0, 0], [0.07, 0.3, 0.07]);
  for (const sx of [-1, 1]) part(g, CYL, std("#565f8a"), [sx * 0.4, 1.1, -1.55], [0, 0, sx * 0.33], [0.03, 1.6, 0.03]);
  return {
    ...s, look: [0, 1.0, 0], dist: 10.5,
    update(t, dt) {
      wheel.rotation.z += dt * 0.35;
      for (const gd of gondolas) gd.rotation.z = -wheel.rotation.z;
    },
  };
}

function road() {
  const s = stand({ accent: "#38d6ff", sky: "#4a5a9a", ground: "#0a0a14", key: "#bcd0ff", top: "#141420" });
  starfield(s.scene);
  const g = s.group;
  part(g, BOX, std("#08080e"), [0, 0.02, 0], [0, 0, 0], [1.3, 0.02, 5.4]);
  for (const x of [-0.6, 0.6]) part(g, BOX, glow("#38d6ff"), [x, 0.035, 0], [0, 0, 0], [0.025, 0.01, 5.4]);
  const L = 5.4, movers = [];
  // Dashes, lamps and rainbow arches, all flowing toward you.
  for (let i = 0; i < 10; i++) movers.push({ m: part(g, BOX, glow("#bff4ff"), [0, 0.035, 0], [0, 0, 0], [0.03, 0.01, 0.22]), z0: (i / 10) * L, speed: 1.6 });
  for (let i = 0; i < 6; i++) {
    const arch = new THREE.Group();
    part(arch, new THREE.TorusGeometry(0.75, 0.03, 8, 48, Math.PI), glow(new THREE.Color().setHSL(i / 6, 0.85, 0.6).getStyle(), 1.3));
    g.add(arch);
    movers.push({ m: arch, z0: (i / 6) * L, speed: 1.6 });
    for (const x of [-0.8, 0.8]) {
      const lamp = new THREE.Group();
      part(lamp, CYL, std("#2b2d33"), [0, 0.25, 0], [0, 0, 0], [0.012, 0.5, 0.012]);
      part(lamp, BALL, glow("#ffe2a8"), [0, 0.52, 0], [0, 0, 0], 0.035);
      lamp.position.x = x;
      g.add(lamp);
      movers.push({ m: lamp, z0: (i / 6) * L + L / 12, speed: 1.6 });
    }
  }
  // The Comet, on its own track, easing along beside the road.
  part(g, BOX, std("#ff5cf0", { emissive: 0.6 }), [-1.2, 0.03, 0], [0, 0, 0], [0.12, 0.02, 5.4]);
  const comet = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const z = i * 0.62;
    part(comet, BOX, std("#f4f1ea"), [0, 0.2, z], [0, 0, 0], [0.24, 0.22, 0.58]);
    part(comet, BOX, glow("#8fdcff", 1.1), [0, 0.23, z], [0, 0, 0], [0.245, 0.06, 0.5]);
    part(comet, BOX, std("#ff6b6b"), [0, 0.32, z], [0, 0, 0], [0.22, 0.02, 0.56]);
  }
  part(comet, BALL, std("#f4f1ea", { flat: false }), [0, 0.2, -0.3], [0, 0, 0], [0.12, 0.11, 0.18]);
  comet.position.x = -1.2;
  g.add(comet);
  // The ringed planet hanging behind.
  const planet = new THREE.Group();
  planet.position.set(1.9, 1.6, -2.2);
  part(planet, BALL, std("#e0a36a", { flat: false }), [0, 0, 0], [0, 0, 0], 0.45);
  part(planet, new THREE.RingGeometry(0.7, 1.0, 48), new THREE.MeshStandardMaterial({ color: "#c8b28a", side: THREE.DoubleSide }), [0, 0, 0], [-1.2, 0.3, 0]);
  s.scene.add(planet);
  return {
    ...s, look: [0, 0.6, 0], dist: 10,
    update(t, dt, hover) {
      for (const o of movers) {
        const z = ((o.z0 + t * o.speed * (hover ? 2.2 : 1)) % L) - L / 2;
        o.m.position.z = z;
        // Shrink things away near the edge of the stand.
        o.base ??= o.m.scale.clone();
        const k = Math.max(0.001, THREE.MathUtils.smoothstep(L / 2 - Math.abs(z), 0, 0.5));
        o.m.scale.copy(o.base).multiplyScalar(k);
      }
      comet.position.z = Math.sin(t * 0.5) * 0.6 - 0.4;
    },
  };
}

function starship() {
  const s = stand({ accent: "#b18cff", sky: "#7f6bd9", ground: "#0a0a14", key: "#ffffff", top: "#151326" });
  starfield(s.scene);
  const g = s.group;
  // Rocks with glowing crystals on the stand.
  const crystalColors = ["#5fe1ff", "#ff8fd8", "#c9a0ff"];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3, r = 1.2 + (i % 3) * 0.5, x = Math.cos(a) * r, z = Math.sin(a) * r, k = 0.1 + (i % 4) * 0.06;
    part(g, new THREE.DodecahedronGeometry(1, 0), std("#4a4060"), [x, 0.1 + (i % 2) * 0.05, z], [i, i * 2, 0], k);
    if (i % 2 === 0) part(g, new THREE.OctahedronGeometry(1, 0), glow(crystalColors[i % 3], 1.2), [x + k * 0.6, 0.15 + k, z], [0, i, 0], [k * 0.3, k * 0.7, k * 0.3]);
  }
  // Halo Station: a candy-striped ring round a hub with a clock.
  const station = new THREE.Group();
  station.position.set(0, 1.5, -0.4);
  for (let i = 0; i < 12; i++) part(station, new THREE.TorusGeometry(0.9, 0.09, 10, 8, (Math.PI * 2) / 12), std(i % 2 ? "#ff8fd8" : "#f4f1ea", { flat: false }), [0, 0, 0], [0, 0, (i * Math.PI * 2) / 12]);
  part(station, new THREE.TorusGeometry(0.8, 0.015, 6, 48), glow("#5fe1ff"));
  part(station, BALL, std("#e8ecf8", { flat: false }), [0, 0, 0], [0, 0, 0], 0.25);
  for (let i = 0; i < 4; i++) part(station, BOX, std("#c9a0ff", { emissive: 0.5 }), [0, 0, 0], [0, 0, (i * Math.PI) / 2 + Math.PI / 4], [1.6, 0.03, 0.03]);
  part(station, new THREE.CircleGeometry(0.17, 24), std("#f2ead8", { emissive: 0.4 }), [0, 0, 0.26]);
  s.scene.add(station);
  // A space jelly drifting by.
  const jelly = new THREE.Group();
  part(jelly, new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std("#ff8fd8", { emissive: 0.8, flat: false, opacity: 0.85 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(jelly, CYL, glow("#ffd1f0", 1), [Math.cos(a) * 0.12, -0.18, Math.sin(a) * 0.12], [0, 0, 0], [0.008, 0.36, 0.008]);
  }
  jelly.position.set(1.6, 1.9, 0.9);
  s.scene.add(jelly);
  // The Pacer: a capsule with a glass dome, swept wings and glowing engines.
  const ship = new THREE.Group();
  part(ship, new THREE.CapsuleGeometry(0.13, 0.45, 6, 16), std("#40407a", { flat: false }), [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(ship, BALL, std("#7fe8ff", { emissive: 0.6, flat: false, opacity: 0.7 }), [0, 0.04, -0.2], [0, 0, 0], [0.12, 0.1, 0.16]);
  part(ship, BOX, std("#eef0fb"), [0, 0, 0.12], [0, 0, 0], [0.62, 0.02, 0.16]);
  for (const sx of [-1, 1]) part(ship, BALL, glow("#ff6fd8", 1.6), [sx * 0.31, 0.01, 0.15], [0, 0, 0], 0.02);
  for (const sx of [-1, 1]) part(ship, BALL, glow("#5fe1ff", 1.8), [sx * 0.08, 0, 0.36], [0, 0, 0], 0.04);
  const trail = [];
  for (let i = 0; i < 14; i++) trail.push(part(s.scene, BALL, new THREE.MeshBasicMaterial({ color: "#5fe1ff", transparent: true, opacity: 0.6 * (1 - i / 14) }), [0, 0, 0], [0, 0, 0], 0.03 * (1 - i / 16)));
  ship.scale.setScalar(1.7);
  s.scene.add(ship);
  // Earth, with a little red star far off where we're going.
  const earth = new THREE.Group();
  earth.position.set(-2.0, 1.6, -2.6);
  part(earth, new THREE.SphereGeometry(1, 32, 20), std("#2a6fc4", { flat: false }), [0, 0, 0], [0, 0, 0], 0.55);
  for (let i = 0; i < 7; i++) part(earth, BALL, std("#3f8a45", { flat: false }), new THREE.Vector3().randomDirection().multiplyScalar(0.42).toArray(), [0, 0, 0], 0.16 + (i % 3) * 0.05);
  part(earth, BALL, new THREE.MeshBasicMaterial({ color: "#6fb0ff", transparent: true, opacity: 0.25 }), [0, 0, 0], [0, 0, 0], 0.6);
  s.scene.add(earth);
  part(s.scene, BALL, glow("#ff7a4a", 2), [2.4, 2.6, -3.5], [0, 0, 0], 0.08);
  const path = (a) => new THREE.Vector3(Math.cos(a) * 1.9, 1.3 + Math.sin(a * 2) * 0.35, Math.sin(a) * 1.4 - 0.2);
  let a = 0;
  return {
    ...s, look: [0, 1.0, 0], dist: 10.5, spin: 0.08,
    update(t, dt, hover) {
      a += dt * (hover ? 1.3 : 0.55);
      const p = path(a), q = path(a + 0.05);
      ship.position.copy(p);
      ship.lookAt(p.clone().multiplyScalar(2).sub(q));
      trail.forEach((m, i) => m.position.copy(path(a - (i + 1) * 0.045)));
      station.rotation.z += dt * 0.2;
      jelly.position.y = 1.9 + Math.sin(t * 0.8) * 0.15;
      const p2 = Math.sin(t * 2.2);
      jelly.scale.set(1 + 0.12 * p2, 1 - 0.14 * p2, 1 + 0.12 * p2);
    },
  };
}

// A canvas of lit and dark windows, for the city's towers.
function windows() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#14161f";
  x.fillRect(0, 0, 64, 128);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 6; i++) {
    x.fillStyle = Math.random() < 0.45 ? (Math.random() < 0.7 ? "#ffcf8a" : "#9fd8ff") : "#262a38";
    x.fillRect(4 + i * 10, 4 + j * 8, 6, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function city() {
  const s = stand({ accent: "#ff4fa3", sky: "#3a4a8a", ground: "#0a0a12", key: "#8fa0ff", keyAt: [2, 5, 3], top: "#1a1b24" });
  const g = s.group;
  for (const rot of [0, Math.PI / 2]) {
    part(g, BOX, std("#24262f"), [0, 0.02, 0], [0, rot, 0], [5.4, 0.02, 1.1]);
    for (let i = -5; i <= 5; i++) part(g, BOX, std("#f2e6a0", { emissive: 0.3 }), [Math.cos(rot) * i * 0.45, 0.035, -Math.sin(rot) * i * 0.45], [0, rot, 0], [0.18, 0.005, 0.03]);
  }
  const tex = windows();
  const signs = ["#ff4fa3", "#38d6ff", "#ffd166", "#7dffb0"];
  [[-1.4, -1.4, 2.6], [1.4, -1.4, 1.8], [-1.4, 1.4, 1.5], [1.4, 1.4, 2.2]].forEach(([x, z, h], i) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.8 });
    part(g, BOX, m, [x, h / 2, z], [0, 0, 0], [1.1, h, 1.1]);
    part(g, BOX, std("#2a2d3a"), [x, h + 0.04, z], [0, 0, 0], [1.14, 0.08, 1.14]);
    // A neon sign on the face toward the crossing.
    part(g, BOX, glow(signs[i], 1.5), [x - Math.sign(x) * 0.56, h * 0.55, z - Math.sign(z) * 0.2], [0, 0, 0], [0.04, 0.5, 0.12]);
    part(g, BOX, glow(signs[(i + 1) % 4], 1.5), [x - Math.sign(x) * 0.2, h * 0.75, z - Math.sign(z) * 0.56], [0, 0, 0], [0.4, 0.08, 0.04]);
  });
  // A taxi going round the block, headlights on.
  const taxi = new THREE.Group();
  part(taxi, BOX, std("#f2c230"), [0, 0.1, 0], [0, 0, 0], [0.22, 0.1, 0.42]);
  part(taxi, BOX, std("#2a2a2a"), [0, 0.18, 0.02], [0, 0, 0], [0.2, 0.08, 0.22]);
  for (const sx of [-1, 1]) part(taxi, BALL, glow("#fff6d8", 2), [sx * 0.07, 0.1, -0.22], [0, 0, 0], 0.025);
  for (const sx of [-1, 1]) part(taxi, BALL, glow("#ff2a2a", 2), [sx * 0.08, 0.1, 0.22], [0, 0, 0], 0.02);
  g.add(taxi);
  // Rain.
  const N = 260, pos = new Float32Array(N * 6), drops = [];
  for (let i = 0; i < N; i++) drops.push([(Math.random() - 0.5) * 5, Math.random() * 3.2, (Math.random() - 0.5) * 5]);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#9fb4ff", transparent: true, opacity: 0.35 })));
  return {
    ...s, look: [0, 0.9, 0], dist: 11,
    update(t, dt, hover) {
      const k = ((t * (hover ? 0.5 : 0.22)) % 1) * 4;
      const side = Math.floor(k), f = k - side, r = 0.28;
      const corners = [[r, r], [r, -r], [-r, -r], [-r, r]].map(([x, z]) => [x * 9, z * 9]);
      const [x0, z0] = corners[side], [x1, z1] = corners[(side + 1) % 4];
      taxi.position.set(x0 + (x1 - x0) * f, 0.02, z0 + (z1 - z0) * f);
      taxi.rotation.y = Math.atan2(-(x1 - x0), -(z1 - z0));
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        d[1] -= dt * 4;
        if (d[1] < 0) d[1] += 3.2;
        pos.set([d[0], d[1], d[2], d[0], d[1] + 0.12, d[2]], i * 6);
      }
      rg.attributes.position.needsUpdate = true;
    },
  };
}

// A jagged bolt from the sky down to a point.
function bolt(parent, x) {
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(x + (i && i < 8 ? (Math.random() - 0.5) * 0.4 : 0), 3.2 - i * 0.39, 0.6 + (i && i < 8 ? (Math.random() - 0.5) * 0.3 : 0)));
  const m = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#e6ecff" }));
  parent.add(m);
  const spot = part(parent, BALL, glow("#d9e4ff", 2), [x, 0.08, 0.6], [0, 0, 0], 0.12);
  return { m, spot };
}

function railway() {
  const s = stand({ accent: "#ff6b5a", sky: "#cfe4ff", ground: "#5a7a3a", key: "#fff4e0", keyAt: [-3, 5, 4], top: "#6aa84f" });
  const g = s.group;
  // A meadow with the track, a wooden platform, and a hill with a tunnel.
  part(g, BOX, std("#8a8076"), [0, 0.03, -0.35], [0, 0, 0], [5.4, 0.04, 0.7]);
  for (const z of [-0.5, -0.2]) part(g, BOX, std("#c9ccd4"), [0, 0.07, z], [0, 0, 0], [5.4, 0.03, 0.03]);
  part(g, BOX, std("#b8834f"), [0, 0.1, 0.6], [0, 0, 0], [5.0, 0.18, 0.9]);
  part(g, BOX, std("#ffd166"), [0, 0.195, 0.2], [0, 0, 0], [5.0, 0.01, 0.05]);
  part(g, new THREE.SphereGeometry(1, 24, 16), std("#5f9a48", { flat: false }), [2.4, -0.2, -0.6], [0, 0, 0], [1.0, 0.9, 1.2]);
  part(g, new THREE.CircleGeometry(0.28, 16, 0, Math.PI), std("#1d1b22"), [1.55, 0.04, -0.35], [0, -Math.PI / 2, 0]);
  // Snowy peaks behind, pines and a cow.
  for (const [x, z, h] of [[-1.6, -2.0, 1.6], [-0.4, -2.3, 2.1], [0.9, -2.1, 1.5]]) {
    part(g, new THREE.ConeGeometry(0.8, h, 6), std("#8a90a0"), [x, h / 2, z]);
    part(g, new THREE.ConeGeometry(0.3, h * 0.36, 6), std("#ffffff"), [x, h * 0.83, z]);
  }
  for (const [x, z] of [[-2.2, -0.9], [-1.0, -1.2], [1.4, -1.5], [-2.4, 1.2], [2.3, 1.1]]) part(g, new THREE.ConeGeometry(0.16, 0.5, 7), std("#2f5a3a"), [x, 0.26, z]);
  const cow = new THREE.Group();
  part(cow, BOX, std("#f4f1ea"), [0, 0.12, 0], [0, 0, 0], [0.26, 0.12, 0.13]);
  part(cow, BOX, std("#2a2622"), [0.03, 0.14, 0], [0, 0, 0], [0.09, 0.08, 0.135]);
  part(cow, BOX, std("#f4f1ea"), [0.15, 0.16, 0], [0, 0, 0], [0.08, 0.08, 0.08]);
  cow.position.set(-1.6, 0, -1.0);
  g.add(cow);
  // A clock tower on the platform, with a photon bouncing inside.
  part(g, CYL, std("#d8a94a"), [-0.9, 0.24, 0.65], [0, 0, 0], [0.12, 0.04, 0.12]);
  part(g, CYL, std("#cfeaff", { opacity: 0.4 }), [-0.9, 0.62, 0.65], [0, 0, 0], [0.11, 0.72, 0.11]);
  part(g, CYL, std("#d8a94a"), [-0.9, 1.0, 0.65], [0, 0, 0], [0.12, 0.04, 0.12]);
  part(g, new THREE.ConeGeometry(0.18, 0.2, 8), std("#b8322c"), [-0.9, 1.13, 0.65]);
  const photon = part(g, BALL, glow("#ffe45c", 2), [-0.9, 0.6, 0.65], [0, 0, 0], 0.04);
  // A red train with passengers.
  const train = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = i * 0.82;
    part(train, BOX, std("#c8282d"), [x, 0.22, 0], [0, 0, 0], [0.78, 0.3, 0.32]);
    part(train, BOX, std("#9fd4ff", { emissive: 0.2 }), [x, 0.26, 0], [0, 0, 0], [0.7, 0.1, 0.33]);
    part(train, BOX, std("#e8e4dc"), [x, 0.39, 0], [0, 0, 0], [0.8, 0.04, 0.34]);
    for (let k = 0; k < 3; k++) part(train, BALL, std(["#ffbe0b", "#ff8fd8", "#5ce1c6", "#9d8cff"][(i + k) % 4], { flat: false }), [x - 0.22 + k * 0.22, 0.27, 0.12], [0, 0, 0], 0.045);
  }
  train.position.z = -0.35;
  g.add(train);
  // A grumpy storm cloud that strikes now and then.
  const cloud = new THREE.Group();
  for (let i = 0; i < 6; i++) part(cloud, BALL, std("#8d96aa", { flat: false }), [Math.cos(i) * 0.3, Math.sin(i * 2) * 0.06, Math.sin(i) * 0.15], [0, 0, 0], 0.2);
  for (const sx of [-1, 1]) part(cloud, BALL, std("#ffffff", { flat: false }), [sx * 0.1, 0, 0.3], [0, 0, 0], 0.05);
  cloud.position.set(-0.4, 2.1, -0.35);
  g.add(cloud);
  const strike = bolt(g, -0.4);
  strike.m.geometry = new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3, 4, 5].map((i) => new THREE.Vector3(-0.4 + (i % 2 ? 0.12 : -0.06), 2.0 - i * 0.37, -0.35)));
  strike.spot.position.set(-0.4, 0.1, -0.35);
  return {
    ...s, look: [0, 0.8, 0], dist: 10,
    update(t, dt, hover) {
      const k = t * (hover ? 0.9 : 0.4);
      train.position.x = ((k % 1) * 6.2) - 4.2;
      train.children.forEach((c) => (c.visible = Math.abs(train.position.x + c.position.x) < 2.5));
      photon.position.y = 0.32 + Math.abs(((t * 0.9) % 2) - 1) * 0.62;
      const p = t % 3.2, flash = p < 0.16;
      strike.m.visible = flash;
      strike.spot.visible = p < 0.6;
      strike.spot.scale.setScalar(0.12 * (1 - p / 0.6));
      cloud.position.y = 2.1 + Math.sin(t * 0.8) * 0.05;
      cow.rotation.y = Math.sin(t * 0.3) * 0.4;
    },
  };
}

const BUILDERS = { pier: funfair, highway: road, starship, city, railway };
export const ACCENTS = { pier: "#ffb36b", highway: "#38d6ff", starship: "#b18cff", city: "#ff4fa3", railway: "#ff6b5a" };

export class MenuModels {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.models = new Map();
    this.t = 0;
    this.hover = null;
  }

  model(id) {
    if (!this.models.has(id) && BUILDERS[id]) this.models.set(id, { ...BUILDERS[id](), angle: Math.random() * Math.PI * 2, zoom: 0 });
    return this.models.get(id);
  }

  // Draw each card's model into its stage element.
  render(dt) {
    this.t += dt;
    const r = this.renderer, w = innerWidth, h = innerHeight;
    const size = r.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) r.setSize(w, h, false);
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    for (const el of document.querySelectorAll("[data-stage]")) {
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > h || b.width < 2) continue;
      const m = this.model(el.dataset.stage);
      if (!m) continue;
      const hovered = this.hover === el.dataset.stage;
      m.zoom += ((hovered ? 1 : 0) - m.zoom) * Math.min(1, dt * 5);
      m.angle += dt * ((m.spin ?? 0.15) + m.zoom * 0.5);
      m.update(this.t, dt, hovered);
      m.group.rotation.y = m.angle;
      const d = m.dist * (1 - 0.1 * m.zoom), elev = 0.5;
      m.camera.position.set(0, m.look[1] + Math.sin(elev) * d, Math.cos(elev) * d);
      m.camera.lookAt(...m.look);
      m.camera.aspect = b.width / b.height;
      m.camera.updateProjectionMatrix();
      r.setViewport(b.left, h - b.bottom, b.width, b.height);
      r.setScissor(b.left, h - b.bottom, b.width, b.height);
      r.render(m.scene, m.camera);
    }
  }
}
