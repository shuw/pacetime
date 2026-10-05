// Quick checks of the math and helpers that don't need a browser: bun test
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { addVelocity, dopplerBetween, gammaOf, observerFactors, viewDoppler, world } from "../src/relativity.js";
import { govern } from "../src/motion.js";
import { formatBeta, formatTime, humanTime, kmh } from "../src/format.js";
import { linkFor, readLink } from "../src/link.js";

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

describe("relativity", () => {
  test("gamma", () => {
    expect(gammaOf(0)).toBe(1);
    expect(gammaOf(0.6)).toBeCloseTo(1.25, 12);
    expect(gammaOf(Math.sqrt(3) / 2)).toBeCloseTo(2, 9);
  });

  test("velocities add without reaching light speed", () => {
    world.c = 10;
    const v = addVelocity(v3(9, 0, 0), v3(9, 0, 0));
    expect(v.x / world.c).toBeCloseTo(1.8 / 1.81, 12);
    expect(addVelocity(v3(9.99, 0, 0), v3(9.99, 0, 0)).length()).toBeLessThan(world.c);
  });

  test("Doppler: head-on, receding, and moving together", () => {
    world.c = 10;
    const b = 0.6;
    const ahead = v3(0, 0, -1); // the source is ahead of the observer
    // Running at a source: blueshift sqrt((1+β)/(1-β)) = 2.
    expect(dopplerBetween(ahead, v3(0, 0, -b * world.c), v3(0, 0, 0))).toBeCloseTo(2, 12);
    // Running away: redshift 0.5.
    expect(dopplerBetween(ahead, v3(0, 0, b * world.c), v3(0, 0, 0))).toBeCloseTo(0.5, 12);
    // Moving together: no shift at all.
    expect(dopplerBetween(ahead, v3(0, 0, -b * world.c), v3(0, 0, -b * world.c))).toBeCloseTo(1, 12);
  });

  test("the view's Doppler factor stays exact near light speed", () => {
    // At 1 - β = 1e-12, γ ≈ 707,106.78; straight ahead D = γ(1+β) ≈ 2γ.
    const omb = 1e-12, g = 1 / Math.sqrt(omb * (2 - omb));
    expect(viewDoppler(g, omb, 0) / (2 * g)).toBeCloseTo(1, 9);
    // Straight behind (1 - cosθ = 2): D = 1/(γ(1+β)) ≈ 1/(2γ).
    expect(viewDoppler(g, omb, 2) * 2 * g).toBeCloseTo(1, 9);
    // At an everyday speed it matches the plain formula.
    const b = 0.5, gb = gammaOf(b), th = 1.1;
    expect(viewDoppler(gb, 1 - b, 1 - Math.cos(th))).toBeCloseTo(1 / (gb * (1 - b * Math.cos(th))), 12);
  });

  test("observer factors, and the gentle look's softer bending", () => {
    const omb = 1e-6, g = 1 / Math.sqrt(omb * (2 - omb));
    const [g1, o1, gb, ob] = observerFactors(g, omb, 1);
    expect(g1).toBe(g);
    expect(o1).toBe(omb);
    // True to life, the bending uses the real γ and 1 - β.
    expect(gb / g).toBeCloseTo(1, 9);
    expect(ob / omb).toBeCloseTo(1, 6);
    // Gentle halves rapidity: η/2.
    const eta = Math.atanh(1 - omb);
    const [, , gh, oh] = observerFactors(g, omb, 0.5);
    expect(gh).toBeCloseTo(Math.cosh(eta / 2), 6);
    expect(1 - oh).toBeCloseTo(Math.tanh(eta / 2), 9);
  });

  test("things are held under light speed only when they'd outrun it", () => {
    expect(govern(5, 100)).toBe(5);
    expect(govern(20, 10)).toBeLessThan(10);
    expect(govern(20, 10)).toBeGreaterThan(9);
    expect(govern(19, 10)).toBeLessThan(govern(20, 10)); // still faster for faster things
  });
});

describe("format", () => {
  test("km/h", () => {
    expect(kmh(5)).toBe("18 km/h");
    expect(kmh(6)).toBe("21.6 km/h");
    expect(kmh(299792458)).toBe("1.08 billion km/h");
  });

  test("fractions of light speed show every nine", () => {
    expect(formatBeta(0.5, 0.5)).toBe("0.500");
    expect(formatBeta(0.99996, 4e-5)).toBe("0.999960");
    expect(formatBeta(1 - 1e-9, 1e-9)).toBe("0.99999999900");
  });

  test("times", () => {
    expect(formatTime(12.34)).toBe("12.3");
    expect(formatTime(2 * 86400)).toBe("2.0 days");
    expect(humanTime(32)).toBe("32 seconds");
    expect(humanTime(6191)).toBe("1 hour 43 minutes");
    expect(humanTime(8.5 * 31557600)).toBe("8.5 years");
  });
});

describe("links", () => {
  const ids = ["pier", "railway"];
  const player = { pos: { x: -30, z: 17 }, yaw: 0.5, pitch: -0.1 };

  test("a link round-trips", () => {
    const effects = { aberration: true, doppler: false, searchlight: true, delay: true, dilation: true, ghosts: true };
    const h = linkFor({ id: "railway", player, c: 8, c0: 5, effects });
    expect(h).toBe("#railway@-30.0,17.0,0.50,-0.10&c=8&off=doppler&xray=1");
    expect(readLink(h, ids)).toEqual({ id: "railway", pose: [-30, 17, 0.5, -0.1], c: 8, off: ["doppler"], xray: true });
  });

  test("an unknown place or a mangled link starts at the title screen", () => {
    expect(readLink("#nowhere@1,2,3", ids)).toBeNull();
    expect(readLink("#pier%", ids)).toBeNull();
    expect(readLink("", ids)).toBeNull();
  });
});
