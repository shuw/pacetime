import * as THREE from "three";
import { box, G, mesh } from "../geo.js";
import { mat } from "../shaders.js";
import { cosmos, deck, PALETTE, pylon, rails } from "../world.js";

// The shared station: a long deck with a track along x at z = 0, a platform
// on the +z side, light portals at both ends of the line.
export function station(group, { P = 90, platform = [3.6, 24], flashes, extraDeck = [] } = {}) {
  const rect = [-P - 12, -7, P + 12, platform[1] + 2];
  group.add(deck(rect, { flashes }));
  for (const r of extraDeck) group.add(deck(r, { flashes }));
  group.add(rails(-P - 12, P + 12, 0));
  group.add(cosmos());
  for (let x = -P + 4; x <= P - 4; x += 12) group.add(pylon(x, platform[1] - 0.6));
  for (const x of [-P, P]) group.add(portal(x));
  return { walk: [[-P - 8, platform[0], P + 8, platform[1]]] };
}

// A tall ring of light the train passes through to enter and leave the line.
export function portal(x) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(4.2, 0.12, 12, 120), mat({ color: PALETTE.rail, emissive: 1, ir: 0.8, uv: 1.2 }), { pos: [x, 2.2, 0], rot: [0, Math.PI / 2, 0] }));
  g.add(mesh(new THREE.TorusGeometry(4.7, 0.4, 12, 120), mat({ color: "#141826", ir: 0.1, uv: 0.1 }), { pos: [x, 2.2, 0], rot: [0, Math.PI / 2, 0] }));
  g.add(mesh(new THREE.CircleGeometry(4.1, 96), mat({ color: "#3a4cff", additive: true, opacity: 0.12, emissive: 1, unlit: true, doubleSided: true }), { pos: [x, 2.2, 0], rot: [0, Math.PI / 2, 0] }));
  return g;
}

// A floor ring carried in the middle car, marking where to stand on board.
export function carMarker(train, local = 0, color = PALETTE.warm) {
  const ring = new THREE.RingGeometry(0.95, 1.05, 80);
  ring.rotateX(-Math.PI / 2);
  train.carry(ring, mat({ color, emissive: 1, unlit: true, doubleSided: true, mover: train.mover, rect: train.clip }), local, 0.08);
}

export { box, G, mesh, mat, PALETTE };
