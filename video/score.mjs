// Composes and renders the hype video's score (video/out/score.wav): a music
// box over the funfair, a groove for the crossroads and the railway, a riser
// up the endless road, everything at once for the starship, and one big
// chord under the title. Rendered offline by the browser's audio engine.
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { BAR, BPM, LENGTH, SECTIONS, HITS } from "./timeline.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const pcm = await page.evaluate(async ({ BAR, BPM, LENGTH, SECTIONS, HITS }) => {
  const SR = 48000;
  const ctx = new OfflineAudioContext(2, SR * LENGTH, SR);
  const beat = 60 / BPM, bar = (b) => b * BAR, inS = (name, b) => b >= SECTIONS[name][0] && b < SECTIONS[name][1];
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  // Mix: everything into a bus with a reverb send, then a gentle compressor.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const bus = ctx.createGain(); bus.gain.value = 0.8; bus.connect(comp);
  const verb = ctx.createConvolver();
  {
    const n = SR * 2.8, ir = ctx.createBuffer(2, n, SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    verb.buffer = ir;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(comp);
  const noise = ctx.createBuffer(1, SR * 2, SR);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  const out = (node, { pan = 0, send = 0.2, gain = 1 } = {}) => {
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(g); g.connect(p); p.connect(bus);
    if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verb); }
    return g;
  };
  const env = (g, t, { a = 0.005, peak = 1, d = 0.3, s = 0, r = 0.1, len = 0.2 }) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * s, t + a, d / 3);
    g.gain.setTargetAtTime(0, t + Math.max(len, a), r / 3);
  };
  const osc = (type, f, t, len, o = {}) => {
    const v = ctx.createOscillator(); v.type = type; v.frequency.setValueAtTime(f, t);
    if (o.detune) v.detune.value = o.detune;
    if (o.slide) v.frequency.exponentialRampToValueAtTime(f * o.slide, t + len);
    const g = ctx.createGain();
    env(g, t, { len, ...o.env });
    let node = v;
    if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = o.lp; f2.Q.value = o.q ?? 0.7; v.connect(f2); node = f2; }
    node.connect(g);
    out(g, o);
    v.start(t); v.stop(t + len + 2);
    return v;
  };
  const hiss = (t, len, { type = "highpass", f = 7000, to = null, q = 0.8, gain = 0.2, a = 0.002, r = 0.05, pan = 0, send = 0.1 } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setTargetAtTime(0, t + Math.max(a, len - r), r / 3);
    s.connect(fl); fl.connect(g); out(g, { pan, send });
    s.start(t, Math.random()); s.stop(t + len + 1);
  };

  // Instruments.
  const musicBox = (n, t, gain = 0.12, pan = 0) => {
    osc("sine", midi(n), t, 0.05, { env: { a: 0.002, d: 1.4, s: 0, r: 1.2, len: 0.01 }, gain, pan, send: 0.45 });
    osc("sine", midi(n) * 3, t, 0.05, { env: { a: 0.001, d: 0.3, s: 0, r: 0.3, len: 0.01 }, gain: gain * 0.25, pan, send: 0.45 });
  };
  const pad = (notes, t, len, { gain = 0.05, lp = 1400, a = 0.6 } = {}) => {
    for (const n of notes) for (const dt of [-9, 0, 9]) osc("sawtooth", midi(n), t, len, { detune: dt, env: { a, d: 1, s: 1, r: 1.2, len }, gain: gain / notes.length, lp, pan: dt / 20, send: 0.5 });
  };
  const bass = (n, t, len, gain = 0.22) => {
    osc("triangle", midi(n), t, len, { env: { a: 0.005, d: 0.15, s: 0.7, r: 0.06, len }, gain, send: 0 });
    osc("sine", midi(n - 12), t, len, { env: { a: 0.005, d: 0.2, s: 0.8, r: 0.06, len }, gain: gain * 0.9, send: 0 });
  };
  const kick = (t, gain = 0.9) => osc("sine", 150, t, 0.12, { slide: 0.3, env: { a: 0.002, d: 0.25, s: 0, r: 0.1, len: 0.05 }, gain, send: 0 });
  const clap = (t, gain = 0.35) => { hiss(t, 0.14, { type: "bandpass", f: 1800, q: 1.2, gain, r: 0.12, send: 0.3 }); osc("triangle", 210, t, 0.05, { env: { a: 0.001, d: 0.08, s: 0, r: 0.05, len: 0.02 }, gain: gain * 0.4, send: 0.1 }); };
  const hat = (t, gain = 0.08, pan = 0.25) => hiss(t, 0.035, { f: 8000, gain, r: 0.03, pan, send: 0.05 });
  const stab = (notes, t, gain = 0.16) => { for (const n of notes) for (const dt of [-14, 0, 14]) osc("sawtooth", midi(n), t, 0.35, { detune: dt, env: { a: 0.004, d: 0.4, s: 0.2, r: 0.5, len: 0.25 }, gain: gain / notes.length, lp: 3200, pan: dt / 30, send: 0.5 }); };

  // D – A – Bm – G, a bar each.
  const CHORDS = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [59, 62, 67]];
  const ROOTS = [38, 45, 47, 43];
  const HOOK = [[74, 78, 81, 78], [76, 73, 69, 73], [74, 78, 83, 81], [79, 78, 76, 74]];

  for (let b = 0; b < 30; b++) {
    const t0 = bar(b), k = b % 4, ch = CHORDS[k], root = ROOTS[k];
    const intro = inS("intro", b), groove = inS("groove", b), build = inS("build", b), drop = inS("drop", b), outro = inS("outro", b);
    // The music box: arpeggios through the intro, the hook over the drop and the outro.
    if (intro || build) for (let i = 0; i < 8; i++) musicBox(ch[i % 3] + 12 + (i >= 4 ? 12 : 0), t0 + i * beat / 2, intro && b < 2 ? 0.17 : 0.2, i % 2 ? 0.3 : -0.3);
    if (groove || drop || (outro && b < 29)) HOOK[k].forEach((n, i) => musicBox(n, t0 + i * beat, drop ? 0.22 : 0.17, (i - 1.5) / 4));
    // Pads from bar 4, opening up toward the drop.
    if (b >= 2 && !outro) pad(ch, t0, BAR, { gain: drop ? 0.1 : b < 4 ? 0.05 : 0.08, lp: drop ? 2600 : build ? 900 + (b - 15) * 500 : 1200, a: drop ? 0.05 : 0.5 });
    // Bass and drums.
    if (groove || drop || build) {
      for (let i = 0; i < 8; i++) if (!(build && b === 18 && i >= 4)) bass(root + (i % 4 === 3 ? 12 : 0), t0 + i * beat / 2, beat / 2 - 0.03, drop ? 0.15 : 0.12);
    }
    if (groove || drop) {
      for (let i = 0; i < 4; i++) {
        if (i % 2 === 0 || b >= 10 || drop) kick(t0 + i * beat, drop ? 0.7 : 0.55);
        if (i % 2 === 1) clap(t0 + i * beat, drop ? 0.32 : 0.24);
      }
      for (let i = 0; i < 8; i++) hat(t0 + i * beat / 2 + (i % 2 ? 0.02 : 0), i % 2 ? 0.09 : 0.05, i % 2 ? 0.3 : -0.2);
      if (drop && k === 0) stab(ch.map((n) => n + 12), t0);
    }
    if (build) {
      // Kick on every beat, then a roll that gets faster into the drop.
      for (let i = 0; i < 4; i++) if (b < 18 || i < 2) kick(t0 + i * beat, 0.55);
      const per = b < 17 ? 2 : b < 18 ? 4 : 8;
      for (let i = 0; i < 4 * per / 2; i++) clap(t0 + i * beat * 2 / per, 0.12 + 0.2 * ((b - 15) / 4 + i / (8 * per)));
    }
  }
  // The riser up the endless road, and a cymbal-ish swell into the drop.
  {
    const t0 = bar(SECTIONS.build[0]), t1 = bar(SECTIONS.drop[0]);
    hiss(t0, t1 - t0, { type: "bandpass", f: 300, to: 7000, q: 2, gain: 0.25, a: (t1 - t0) * 0.9, r: 0.05, send: 0.4 });
    osc("sawtooth", midi(50), t0, t1 - t0, { slide: 4, env: { a: (t1 - t0) * 0.95, d: 1, s: 1, r: 0.05, len: t1 - t0 }, gain: 0.05, lp: 2200, send: 0.3 });
    hiss(t1, 2.5, { f: 5000, gain: 0.22, a: 0.005, r: 2.2, send: 0.6 });
    kick(t1, 1.1); stab([74, 78, 81, 86], t1, 0.25);
  }
  // The finale: one big chord and a last music-box run, fading out by the end.
  {
    const t0 = bar(SECTIONS.outro[0]);
    kick(t0, 1.1); hiss(t0, 3, { f: 4500, gain: 0.2, r: 2.8, send: 0.7 });
    pad([50, 57, 62, 66, 69, 74], t0, LENGTH - t0 - 1.6, { gain: 0.11, lp: 2400, a: 0.02 });
    bass(38, t0, LENGTH - t0 - 2, 0.14);
    [74, 78, 81, 86, 90].forEach((n, i) => musicBox(n, LENGTH - 3.2 + i * 0.16, 0.12, (i - 2) / 4));
  }
  // Sound effects: the bonk, and a whoosh on each montage cut.
  for (const h of HITS) {
    if (h.kind === "bonk") {
      hiss(h.at, 0.12, { type: "lowpass", f: 900, to: 120, gain: 0.5, send: 0.1 });
      osc("triangle", 140, h.at + 0.02, 0.55, { slide: 2.6, env: { a: 0.005, d: 0.6, s: 0, r: 0.3, len: 0.3 }, gain: 0.35, send: 0.2 });
      osc("sine", 520, h.at + 0.05, 0.4, { slide: 0.45, env: { a: 0.005, d: 0.4, s: 0, r: 0.2, len: 0.2 }, gain: 0.12, send: 0.2 });
    }
    if (h.kind === "whoosh") hiss(h.at - 0.25, 0.5, { type: "bandpass", f: 6000, to: 500, q: 1.5, gain: 0.18, a: 0.2, r: 0.2, send: 0.3 });
    if (h.kind === "boom") { hiss(h.at, 0.8, { type: "lowpass", f: 600, to: 60, gain: 0.6, r: 0.7, send: 0.4 }); }
  }

  const buf = await ctx.startRendering();
  // Normalise to just under full scale and pack as 16-bit stereo.
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = 0.89 / peak, n = L.length, pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-32767, Math.min(32767, L[i] * k * 32767)); pcm[2 * i + 1] = Math.max(-32767, Math.min(32767, R[i] * k * 32767)); }
  let s = "";
  const bytes = new Uint8Array(pcm.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(s), sr: SR, peak };
}, { BAR, BPM, LENGTH, SECTIONS, HITS });
await browser.close();

const data = Buffer.from(pcm.b64, "base64");
const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
head.writeUInt32LE(pcm.sr, 24); head.writeUInt32LE(pcm.sr * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
head.write("data", 36); head.writeUInt32LE(data.length, 40);
writeFileSync(OUT + "score.wav", Buffer.concat([head, data]));
console.log(`score.wav: ${(data.length / 4 / pcm.sr).toFixed(1)} s, peak before normalising ${pcm.peak.toFixed(2)}`);
