import * as THREE from "three";
import { box, G, mesh } from "../geo.js";
import { mat } from "../shaders.js";
import { COSMIC, cosmos, deck, Flashes, marker, PALETTE, pylon } from "../world.js";
import { world } from "../relativity.js";
import { sfx } from "../audio.js";

const WEST = 0, EAST = 160;
const LANE_OUT = -3, LANE_IN = 3; // outbound pulses run east, inbound run west

// A beacon that fires a pulse along a dusty beam line every `period` seconds.
function beamLine(group, { from, dir, z, period, start, color }) {
  const uBeam = { value: new THREE.Vector4(from, dir, period, start) };
  const uBeamColor = { value: new THREE.Color(color) };
  const len = EAST - WEST + 12;
  const geo = new THREE.BoxGeometry(1, 1, 1, 600, 1, 1);
  group.add(mesh(geo, mat({ color: "#1b2033", emissive: 0.25, ir: 0.05, uv: 0.1, beam: { uBeam, uBeamColor } }), { pos: [(WEST + EAST) / 2, 1.5, z], scale: [len, 0.16, 0.16] }));
  const towerX = from - dir * 2;
  group.add(box(1.2, 4, 1.2, { color: "#121522", ir: 0.1, uv: 0.1 }, [towerX, 2, z]));
  group.add(box(1.25, 0.1, 1.25, { color, emissive: 1 }, [towerX, 4, z]));
  group.add(mesh(G.sphere, mat({ color, emissive: 1, ir: 1, uv: 1 }), { pos: [towerX + dir * 0.7, 1.5, z], scale: 0.3 }));
  return { from, dir, z, period, start, pos: new THREE.Vector3(towerX + dir * 0.7, 0.2, z) };
}

export default {
  id: "beam",
  title: "Chasing the Beam",
  tag: "constancy of c",
  blurb: "Light here moves at 3 m/s, and you can sprint at 2.85. Chase a pulse and see how much ground you gain.",

  build({ player, toast }) {
    world.c = 3;
    const group = new THREE.Group();
    const flashes = new Flashes();
    group.add(deck([WEST - 14, -9, EAST + 14, 9], { flashes }));
    group.add(cosmos(29));
    for (let x = WEST; x <= EAST; x += 10) {
      group.add(pylon(x, -7.5, 1.6));
      group.add(pylon(x, 7.5, 1.6));
      group.add(box(0.06, 0.02, 1.4, { color: PALETTE.warm, emissive: 1, unlit: true }, [x, 0.03, 0]));
    }
    group.add(marker(WEST + 4, 0));

    const out = beamLine(group, { from: WEST, dir: 1, z: LANE_OUT, period: 5, start: 1.5, color: "#ffd27a" });
    const inn = beamLine(group, { from: EAST, dir: -1, z: LANE_IN, period: 7, start: -(EAST - WEST) / 3 + 9, color: "#8fd0ff" });
    const beams = [out, inn];

    const goals = [
      { text: "From the ring, watch a pulse leave: its glow seems to crawl away at half speed", done: false },
      { text: "Face east as an inbound pulse comes at you: it arrives with no warning", done: false },
      { text: "Sprint after an outbound pulse above 90% of light speed", done: false },
    ];
    let note = "Gold pulses run east, away from the ring. Blue pulses run west, toward it.";
    let watchedOut = 0, chase = 0, lastFired = [-1, -1];
    let gapPrev = null, gapRate = 0;
    const fwd = new THREE.Vector3();

    // Distance in your own frame to the nearest outbound pulse ahead of you.
    const gapAhead = () => {
      const b = player.v.x / world.c, g = 1 / Math.sqrt(1 - b * b);
      const T = world.t, xe = player.pos.x;
      let best = null;
      const nMax = Math.floor((T - out.start) / out.period) + 2;
      for (let n = Math.max(0, nMax - 60); n <= nMax; n++) {
        const tn = out.start + n * out.period;
        const x = (out.from + world.c * (T - tn) - b * xe) / (1 - b); // where it is, at your "now"
        const tAt = T + (b * (x - xe)) / world.c;
        if (tAt < tn || x < xe || x > EAST) continue;
        const gap = (x - xe) / g;
        if (best === null || gap < best) best = gap;
      }
      return best;
    };

    return {
      group,
      walk: [[WEST - 10, -6.5, EAST + 10, 6.5]],
      spawn: [WEST + 4, 0, -Math.PI / 2],
      env: COSMIC.env,
      post: COSMIC.post,
      goals,
      tips: [
        "You only see a pulse by the dust it lights up, and that glow has to travel back to you. Pulses leaving you seem to crawl.",
        "Light from an oncoming pulse travels right alongside it, so the pulse and the news of it arrive together.",
        "However fast you run, the gap to a pulse ahead grows at exactly 3 m/s by your own watch and rulers.",
      ],
      get note() { return note; },
      readouts() {
        const gap = gapAhead();
        return [
          ["pulse ahead", gap === null ? "none yet" : `${gap.toFixed(1)} m (your frame)`],
          ["pulling away", gap === null ? "–" : `${gapRate.toFixed(2)} m/s`],
          ["light speed", `${world.c.toFixed(2)} m/s`],
        ];
      },
      update({ eye, camera, t, dTau }) {
        beams.forEach((b, i) => {
          const n = Math.floor((t - b.start) / b.period);
          if (n >= 0 && n !== lastFired[i]) {
            lastFired[i] = n;
            flashes.add(b.pos, b.start + n * b.period, i === 0 ? "#ffd27a" : "#8fd0ff");
          }
        });

        const gap = gapAhead();
        if (gap !== null && gapPrev !== null && dTau > 0 && Math.abs(gap - gapPrev) < 2) {
          gapRate += ((gap - gapPrev) / dTau - gapRate) * Math.min(1, dTau * 3);
        }
        gapPrev = gap;

        camera.getWorldDirection(fwd);
        if (player.pos.x < WEST + 12 && fwd.x > 0.6) watchedOut += dTau;
        if (watchedOut > out.period * 1.6 && !goals[0].done) {
          goals[0].done = true;
          note = "A pulse leaving at speed c looks like it's moving at c/2: each bit of glow has farther to travel back to you.";
        }

        // An inbound pulse passing you while you face it.
        const nIn = Math.floor((t - inn.start - (EAST - player.pos.x) / world.c) / inn.period);
        if (nIn >= 0 && nIn !== this.lastIn) {
          if (this.lastIn !== undefined && fwd.x > 0.6 && !goals[1].done) {
            goals[1].done = true;
            sfx.strike();
            note = "No warning: the light showing you an oncoming pulse travels right alongside it, so it all arrives at once.";
          }
          this.lastIn = nIn;
        }

        if (player.v.x / world.c > 0.9 && gap !== null) chase += dTau;
        else chase = Math.max(0, chase - dTau);
        if (chase > 3 && !goals[2].done) {
          goals[2].done = true;
          toast(`You're doing ${(player.beta * 100).toFixed(0)}% of light speed, and the pulse still pulls away at ${gapRate.toFixed(2)} m/s. Your clock runs slow and your rulers shrink by exactly the amount needed.`, 10);
        }
      },
    };
  },
};
