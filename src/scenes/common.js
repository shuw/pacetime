import * as THREE from "three";
import { box, G, mesh } from "../geo.js";
import { mat } from "../shaders.js";
import { PALETTE } from "../world.js";

// A floor ring carried in the middle car, marking where to stand on board.
export function carMarker(train, local = 0, color = PALETTE.warm) {
  const ring = new THREE.RingGeometry(0.95, 1.05, 80);
  ring.rotateX(-Math.PI / 2);
  train.carry(ring, mat({ color, emissive: 1, unlit: true, doubleSided: true, mover: train.mover, rect: train.clip }), local, 0.08);
}

export { box, G, mesh, mat, PALETTE };
