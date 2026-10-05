// Synthesized sound: an ambient station hum, wind that rises with your speed,
// a train hum pitched by the same Doppler factor you see, and one-shot effects
// panned toward where they happen.
import * as THREE from "three";
import { store } from "./store.js";

let ctx = null, master = null, noiseBuf = null;
let offset = 0; // when rendering offline: when the effect being scheduled happens
let muted = false;
const loops = {};
const listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };

muted = store.get("muted") === "1";

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startLoops();
    if (pendingAmbience) setAmbience(pendingAmbience);
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  store.set("muted", m ? "1" : "0");
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

export function setListener(pos, right) {
  listener.pos.copy(pos);
  listener.right.copy(right);
}

// Pan and loudness for a sound coming from a world position.
function placed(pos, range = 18) {
  if (!pos) return { pan: 0, gain: 1 };
  const d = new THREE.Vector3().subVectors(pos, listener.pos);
  const dist = d.length();
  return { pan: dist > 0.01 ? THREE.MathUtils.clamp(d.normalize().dot(listener.right), -1, 1) * 0.85 : 0, gain: 1 / (1 + dist / range) };
}

function out(pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  return p;
}

function noiseSource(loop = false) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  return s;
}

function tone(freq, start, dur, { type = "sine", gain = 0.1, slide = 0, pan = 0, attack = 0.005 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + offset + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out(pan));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function burst(dur, { gain = 0.2, from = 2000, to = 200, type = "lowpass", q = 0.7, pan = 0, start = 0, attack = 0.005 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + offset + start;
  const s = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(out(pan));
  s.start(t0, Math.random());
  s.stop(t0 + dur + 0.05);
}

function startLoops() {
  // Station hum: two low detuned tones breathing slowly, plus soft air.
  const hum = ctx.createGain();
  hum.gain.value = 0.05;
  hum.connect(master);
  for (const [f, type] of [[55, "sine"], [82.6, "triangle"], [110.4, "sine"]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = f > 100 ? 0.25 : 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + f / 2000;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.2;
    lfo.connect(lfoGain).connect(g.gain);
    o.connect(g).connect(hum);
    o.start();
    lfo.start();
  }
  const air = noiseSource(true);
  const airF = ctx.createBiquadFilter();
  airF.type = "lowpass";
  airF.frequency.value = 260;
  const airG = ctx.createGain();
  airG.gain.value = 0.25;
  air.connect(airF).connect(airG).connect(hum);
  air.start();

  // Rush of speed: band-passed noise that brightens and swells as you speed up.
  const wind = noiseSource(true);
  const windF = ctx.createBiquadFilter();
  windF.type = "bandpass";
  windF.Q.value = 0.8;
  windF.frequency.value = 300;
  const windG = ctx.createGain();
  windG.gain.value = 0;
  wind.connect(windF).connect(windG).connect(master);
  wind.start();
  loops.wind = { f: windF, g: windG };

  // Moving: a soft, breathing chord that climbs as you speed up, with
  // music-box chimes twinkling faster the faster you go, all through a
  // gentle echo. (The chimes are played from updateAudio.)
  const echo = ctx.createDelay(1.5), echo2 = ctx.createDelay(1.5);
  echo.delayTime.value = 0.37;
  echo2.delayTime.value = 0.53;
  const echoF = ctx.createBiquadFilter();
  echoF.type = "lowpass";
  echoF.frequency.value = 2600;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.42;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.55;
  const send = ctx.createGain();
  send.connect(echo).connect(echoF);
  send.connect(echo2).connect(echoF);
  echoF.connect(echoFb).connect(echo);
  echoF.connect(echoOut).connect(master);
  const padF = ctx.createBiquadFilter();
  padF.type = "lowpass";
  padF.frequency.value = 700;
  padF.Q.value = 0.5;
  const padG = ctx.createGain();
  padG.gain.value = 0;
  padF.connect(padG).connect(master);
  padG.connect(send);
  // An open, airy chord: root, fifth, ninth and a high third.
  const voices = [[1, "sine", 0.5], [1.5, "triangle", 0.22], [2.25, "sine", 0.3], [2.52, "sine", 0.18], [0.5, "sine", 0.35]].map(([k, type, gain], i) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 196 * k;
    const g = ctx.createGain();
    g.gain.value = gain;
    // Each voice breathes and wavers on its own slow cycle.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11 + i * 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = gain * 0.45;
    lfo.connect(lfoG).connect(g.gain);
    const vib = ctx.createOscillator();
    vib.frequency.value = 0.23 + i * 0.05;
    const vibG = ctx.createGain();
    vibG.gain.value = 4;
    vib.connect(vibG).connect(o.detune);
    o.connect(g).connect(padF);
    for (const n of [o, lfo, vib]) n.start();
    return { o, k };
  });
  // A glassy shimmer that only appears close to light speed.
  const glass = ctx.createOscillator();
  glass.type = "sine";
  const glassVib = ctx.createOscillator();
  glassVib.frequency.value = 4.2;
  const glassVibG = ctx.createGain();
  glassVibG.gain.value = 9;
  glassVib.connect(glassVibG).connect(glass.detune);
  const glassG = ctx.createGain();
  glassG.gain.value = 0;
  glass.connect(glassG).connect(master);
  glassG.connect(send);
  glass.start();
  glassVib.start();
  loops.drive = { voices, padF, padG, glass, glassG, send, root: 196, chimeIn: 0, lastNote: -1, lastBeta: 0, swoopAt: 0 };

  // Maglev train hum.
  const trainG = ctx.createGain();
  trainG.gain.value = 0;
  const trainF = ctx.createBiquadFilter();
  trainF.type = "lowpass";
  trainF.frequency.value = 900;
  const trainP = ctx.createStereoPanner();
  trainF.connect(trainG).connect(trainP).connect(master);
  const oscs = [[1, "sawtooth", 0.35], [2, "sine", 0.6], [3.01, "sine", 0.2]].map(([k, type, gain]) => {
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(trainF);
    o.start();
    return { o, k };
  });
  loops.train = { g: trainG, p: trainP, f: trainF, oscs };

  // Weather and place: rain hiss, sea wash, mountain wind. One plays at a time.
  const amb = (type, freq, q) => {
    const s = noiseSource(true);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(master);
    s.start(0, Math.random() * 2);
    return { f, g };
  };
  loops.amb = { rain: amb("highpass", 1800, 0.4), sea: amb("lowpass", 500, 0.7), snow: amb("bandpass", 380, 0.6) };
  loops.ambState = { kind: null, t: 0 };
}

// Choose the background sound for the current place.
export function setAmbience(kind) {
  if (!ctx) { pendingAmbience = kind; return; }
  const now = ctx.currentTime;
  for (const [k, { g }] of Object.entries(loops.amb)) g.gain.setTargetAtTime(k === kind ? { rain: 0.07, sea: 0.12, snow: 0.06 }[k] : 0, now, 0.8);
  loops.ambState.kind = kind;
}
let pendingAmbience = null;

// Called every frame. `train` is { pos (where you see it), D (Doppler factor), riding } or null.
export function updateAudio({ beta, gamma, train, dt }) {
  if (!ctx) return;
  const now = ctx.currentTime;
  // The sea breathes: waves wash in and out.
  if (loops.ambState.kind === "sea") loops.amb.sea.f.frequency.setTargetAtTime(380 + 260 * (0.5 + 0.5 * Math.sin(now * 0.7)) ** 2, now, 0.3);
  if (loops.ambState.kind === "snow") loops.amb.snow.g.gain.setTargetAtTime(0.04 + 0.04 * (0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.61)), now, 0.5);
  const w = loops.wind;
  w.g.gain.setTargetAtTime(0.035 * beta * beta, now, 0.3);
  w.f.frequency.setTargetAtTime(400 + 2200 * beta * beta, now, 0.15);

  // The chord climbs gently with γ and the chimes quicken.
  const d = loops.drive;
  const g = gamma ?? 1 / Math.sqrt(Math.max(1e-12, 1 - beta * beta));
  const lg = Math.min(5, Math.log(g)); // 0 at rest, ~1.2 at 95% c, ~2.3 at 99.5% c
  const on = THREE.MathUtils.smoothstep(beta, 0.05, 0.3);
  d.root = 196 * 2 ** (lg * 0.22 + beta * 0.12);
  d.voices.forEach(({ o, k }) => o.frequency.setTargetAtTime(d.root * k, now, 0.35));
  d.padF.frequency.setTargetAtTime(650 + 900 * beta + 400 * lg, now, 0.3);
  d.padG.gain.setTargetAtTime(on * (0.035 + 0.02 * beta), now, 0.4);
  d.glass.frequency.setTargetAtTime(d.root * 6, now, 0.3);
  d.glassG.gain.setTargetAtTime(0.012 * THREE.MathUtils.smoothstep(beta, 0.9, 0.995), now, 0.5);
  d.chimeIn -= dt ?? 1 / 60;
  if (on > 0.3 && d.chimeIn <= 0) {
    // A note from the major pentatonic above the chord, higher as you go.
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    let n = Math.floor(Math.random() * steps.length);
    if (n === d.lastNote) n = (n + 3) % steps.length;
    d.lastNote = n;
    chime(d.root * 2 * 2 ** (steps[n] / 12), { gain: 0.05 * on, pan: Math.random() * 1.2 - 0.6 });
    d.chimeIn = (0.25 + Math.random() * 0.5) / (0.6 + 1.6 * beta + 0.7 * lg);
  }
  // A swoop when you surge forward or pull up.
  const dBeta = beta - d.lastBeta;
  if (now > d.swoopAt && Math.abs(dBeta) > 0.012) {
    d.swoopAt = now + 0.9;
    swoop(dBeta > 0);
  }
  d.lastBeta = beta;

  const tr = loops.train;
  if (train) {
    const { pan, gain } = placed(train.pos, 14);
    const base = 46 * THREE.MathUtils.clamp(train.D, 0.2, 5);
    tr.oscs.forEach(({ o, k }) => o.frequency.setTargetAtTime(base * k, now, 0.05));
    tr.f.frequency.setTargetAtTime(500 + 300 * train.D, now, 0.05);
    tr.g.gain.setTargetAtTime(train.riding ? 0.07 : 0.16 * gain * Math.min(1.6, Math.sqrt(train.D)), now, 0.08);
    tr.p.pan.setTargetAtTime(train.riding ? 0 : pan, now, 0.05);
  } else {
    tr.g.gain.setTargetAtTime(0, now, 0.2);
  }
}

// One music-box note: a soft sine with a faint octave, ringing out into the echo.
function chime(f, { gain = 0.05, pan = 0, start = 0, decay = 1.6 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(master);
  p.connect(loops.drive.send);
  for (const [k, a] of [[1, 1], [2, 0.18], [3.01, 0.05]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f * k;
    const og = ctx.createGain();
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + decay + 0.05);
  }
}

// A little harp run: up when you speed up, down when you slow.
function swoop(up) {
  if (!ctx) return;
  const root = loops.drive.root * 2;
  const run = [0, 4, 7, 12, 16];
  (up ? run : [...run].reverse()).forEach((st, i) => chime(root * 2 ** (st / 12), { gain: 0.035, start: i * 0.06, pan: (i / 4 - 0.5) * (up ? 0.8 : -0.8), decay: 1.1 }));
}

// Renders a list of effects to an audio buffer, offline, with the same
// recipes the game plays live: each { at, name, args, eye, right }, where
// args that were positions are [x, y, z] arrays.
export async function renderEffects(events, seconds, sampleRate = 48000) {
  const live = { ctx, master, noiseBuf, pos: listener.pos.clone(), right: listener.right.clone() };
  ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  master = ctx.createGain();
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, sampleRate * 2, sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  try {
    for (const e of events) {
      offset = e.at;
      listener.pos.fromArray(e.eye);
      listener.right.fromArray(e.right);
      recipes[e.name](...e.args.map((a) => (Array.isArray(a) ? new THREE.Vector3().fromArray(a) : a)));
    }
    return await ctx.startRendering();
  } finally {
    offset = 0;
    ({ ctx, master, noiseBuf } = live);
    listener.pos.copy(live.pos);
    listener.right.copy(live.right);
  }
}

const recipes = {
  // Thunder: a sharp crack, then a long low roll.
  strike(pos) {
    const { pan, gain } = placed(pos, 40);
    burst(0.25, { gain: 0.5 * gain, from: 6000, to: 800, pan });
    burst(2.8, { gain: 0.35 * gain, from: 900, to: 60, pan, start: 0.05, attack: 0.08 });
    tone(42, 0.02, 2.2, { gain: 0.3 * gain, slide: 0.7, pan });
  },
  doorShut(pos) {
    const { pan, gain } = placed(pos, 20);
    tone(180, 0, 0.35, { type: "sawtooth", gain: 0.05 * gain, slide: 0.5, pan });
    burst(0.4, { gain: 0.4 * gain, from: 700, to: 80, pan, start: 0.3 });
    tone(55, 0.3, 0.5, { gain: 0.3 * gain, slide: 0.8, pan });
  },
  doorOpen(pos) {
    const { pan, gain } = placed(pos, 20);
    burst(0.7, { gain: 0.18 * gain, from: 3000, to: 900, type: "bandpass", q: 2, pan });
    tone(240, 0, 0.6, { type: "triangle", gain: 0.05 * gain, slide: 1.6, pan });
  },
  // Magnetic clamp, then the world accelerating past.
  board() {
    tone(70, 0, 0.25, { gain: 0.35, slide: 0.6 });
    burst(0.1, { gain: 0.3, from: 3000, to: 500 });
    burst(1.4, { gain: 0.2, from: 200, to: 3000, type: "bandpass", q: 1.2, start: 0.1, attack: 0.3 });
  },
  alight() {
    burst(1.0, { gain: 0.18, from: 2500, to: 150, type: "bandpass", q: 1.2 });
    tone(90, 0.05, 0.3, { gain: 0.25, slide: 0.5 });
  },
  // A clock tick, pitched per clock.
  tick(pos, pitch = 1320) {
    const { pan, gain } = placed(pos, 8);
    if (gain < 0.15) return;
    tone(pitch, 0, 0.08, { gain: 0.12 * gain, pan });
    tone(pitch * 2.01, 0, 0.04, { gain: 0.04 * gain, pan });
  },
  // A beacon firing: a bright falling zing.
  // A pulse sweeping past you.
  zap(pos) {
    const { pan } = placed(pos);
    burst(0.35, { gain: 0.22, from: 8000, to: 600, type: "bandpass", q: 3, pan });
    tone(2400, 0, 0.25, { type: "triangle", gain: 0.05, slide: 0.3, pan });
  },
  // A firework: a deep thump with a crackle after.
  bang(pos) {
    const { pan, gain } = placed(pos, 60);
    tone(60, 0, 0.9, { gain: 0.35 * gain, slide: 0.5, pan });
    burst(0.5, { gain: 0.4 * gain, from: 3000, to: 200, pan });
    for (let i = 0; i < 6; i++) burst(0.08, { gain: 0.08 * gain, from: 5000, to: 2000, type: "highpass", pan: pan + (Math.random() - 0.5) * 0.4, start: 0.4 + Math.random() * 0.9 });
  },
  // A ride's motor and wheels, as a short swoosh.
  swoosh(pos, amount = 1) {
    const { pan, gain } = placed(pos, 20);
    burst(0.9, { gain: 0.15 * gain * amount, from: 400, to: 2500, type: "bandpass", q: 1.5, pan, attack: 0.3 });
  },
  // A church bell: a struck, slowly decaying chord of inharmonic partials.
  bell(pos) {
    const { pan, gain } = placed(pos, 80);
    [[220, 0.22], [440, 0.12], [528, 0.08], [660, 0.05], [880, 0.04], [1188, 0.025]].forEach(([f, g]) => tone(f, 0, 4.5, { gain: g * gain, pan, attack: 0.003 }));
  },
  // A steam locomotive's puff.
  chuff(pos, k = 1) {
    const { pan, gain } = placed(pos, 30);
    burst(0.22, { gain: 0.18 * gain * k, from: 1800, to: 300, type: "bandpass", q: 0.9, pan, attack: 0.01 });
  },
  whistle(pos) {
    const { pan, gain } = placed(pos, 60);
    [587, 740, 880].forEach((f) => tone(f, 0, 1.6, { type: "triangle", gain: 0.035 * gain, pan, attack: 0.08 }));
  },
  // A music-box note.
  note(freq, pos) {
    const { pan, gain } = placed(pos, 25);
    tone(freq, 0, 0.9, { type: "sine", gain: 0.05 * gain, pan, attack: 0.002 });
    tone(freq * 2, 0, 0.4, { type: "sine", gain: 0.015 * gain, pan, attack: 0.002 });
  },
  horn(pos) {
    const { pan, gain } = placed(pos, 40);
    tone(415, 0, 0.35, { type: "square", gain: 0.03 * gain, pan, attack: 0.01 });
    tone(523, 0, 0.35, { type: "square", gain: 0.025 * gain, pan, attack: 0.01 });
  },
  // A cartoon bonk: a thump and a wobbly boing.
  bonk() {
    burst(0.12, { gain: 0.25, from: 900, to: 120 });
    tone(140, 0.02, 0.55, { type: "triangle", gain: 0.14, slide: 2.6 });
    tone(520, 0.05, 0.4, { type: "sine", gain: 0.05, slide: 0.45 });
  },
  // A hit at the shooting gallery: a bright clang.
  clang(pos) {
    const { pan, gain } = placed(pos, 20);
    [1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.04, 0.6, { type: "triangle", gain: 0.06 * gain, pan }));
  },
  toss() {
    tone(320, 0, 0.35, { type: "sine", gain: 0.08, slide: 2.4 });
    burst(0.2, { gain: 0.06, from: 2500, to: 800, type: "bandpass", q: 2 });
  },
  // Footsteps: a soft synthetic tap.
  step(soft = 1) {
    tone(150 + Math.random() * 20, 0, 0.09, { type: "sine", gain: 0.05 * soft, slide: 0.6 });
    burst(0.04, { gain: 0.02 * soft, from: 3000, to: 1200, type: "bandpass", q: 2 });
  },
  goal() {
    [523.3, 784, 1046.5].forEach((f, i) => tone(f, i * 0.11, 1.6, { gain: 0.06, attack: 0.01 }));
  },
  ui() {
    tone(1200, 0, 0.06, { gain: 0.04 });
  },
};
// What the game calls; a recorder can wrap these without touching the recipes.
export const sfx = { ...recipes };
