// Synthesized sound: an ambient station hum, wind that rises with your speed,
// a train hum pitched by the same Doppler factor you see, and one-shot effects
// panned toward where they happen.
import * as THREE from "three";

let ctx = null, master = null, noiseBuf = null;
let muted = false;
const loops = {};
const listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };

try { muted = localStorage.getItem("pacetime-muted") === "1"; } catch {}

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
  try { localStorage.setItem("pacetime-muted", m ? "1" : "0"); } catch {}
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
  const t0 = ctx.currentTime + start;
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
  const t0 = ctx.currentTime + start;
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

  // The drive: two detuned saws through a resonant filter, a sub-bass, and a
  // shimmering whine that only appears close to light speed.
  const driveF = ctx.createBiquadFilter();
  driveF.type = "lowpass";
  driveF.Q.value = 7;
  driveF.frequency.value = 200;
  const driveG = ctx.createGain();
  driveG.gain.value = 0;
  driveF.connect(driveG).connect(master);
  const saws = [0, 1].map((k) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 45;
    o.detune.value = k ? 9 : -9;
    o.connect(driveF);
    o.start();
    return o;
  });
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 34;
  const subG = ctx.createGain();
  subG.gain.value = 0;
  sub.connect(subG).connect(master);
  sub.start();
  const whine = ctx.createOscillator();
  whine.type = "sine";
  whine.frequency.value = 900;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const vibG = ctx.createGain();
  vibG.gain.value = 12;
  vib.connect(vibG).connect(whine.frequency);
  vib.start();
  const whineF = ctx.createBiquadFilter();
  whineF.type = "bandpass";
  whineF.Q.value = 3;
  whineF.frequency.value = 1200;
  const whineG = ctx.createGain();
  whineG.gain.value = 0;
  whine.connect(whineF).connect(whineG).connect(master);
  whine.start();
  loops.drive = { saws, driveF, driveG, subG, sub, whine, whineF, whineG, vibG, lastBeta: 0, swoopAt: 0 };

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
export function updateAudio({ beta, train, dt }) {
  if (!ctx) return;
  const now = ctx.currentTime;
  // The sea breathes: waves wash in and out.
  if (loops.ambState.kind === "sea") loops.amb.sea.f.frequency.setTargetAtTime(380 + 260 * (0.5 + 0.5 * Math.sin(now * 0.7)) ** 2, now, 0.3);
  if (loops.ambState.kind === "snow") loops.amb.snow.g.gain.setTargetAtTime(0.04 + 0.04 * (0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.61)), now, 0.5);
  const w = loops.wind;
  w.g.gain.setTargetAtTime(0.07 * beta * beta, now, 0.15);
  w.f.frequency.setTargetAtTime(400 + 2200 * beta * beta, now, 0.15);

  // The drive rises with γ: pitch climbs, the filter opens, the whine joins in.
  const d = loops.drive;
  const g = 1 / Math.sqrt(Math.max(1e-6, 1 - beta * beta));
  const lg = Math.log(g); // 0 at rest, ~1.2 at 95% c, ~2.3 at 99.5% c
  const on = THREE.MathUtils.smoothstep(beta, 0.08, 0.3);
  d.saws.forEach((o) => o.frequency.setTargetAtTime(42 + 34 * lg + 30 * beta, now, 0.12));
  d.driveF.frequency.setTargetAtTime(160 + 900 * beta * beta + 700 * lg, now, 0.12);
  d.driveG.gain.setTargetAtTime(0.05 * on * (0.5 + 0.5 * beta), now, 0.15);
  d.subG.gain.setTargetAtTime(0.09 * on * beta, now, 0.2);
  d.sub.frequency.setTargetAtTime(30 + 10 * lg, now, 0.2);
  d.whine.frequency.setTargetAtTime(700 + 520 * lg, now, 0.1);
  d.whineF.frequency.setTargetAtTime(900 + 700 * lg, now, 0.1);
  d.whineG.gain.setTargetAtTime(0.022 * THREE.MathUtils.smoothstep(beta, 0.75, 0.97), now, 0.2);
  d.vibG.gain.setTargetAtTime(8 + 30 * lg, now, 0.2);
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

// A filtered sweep: up when speeding up, down when slowing.
function swoop(up) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(up ? 80 : 260, t0);
  o.frequency.exponentialRampToValueAtTime(up ? 260 : 70, t0 + 0.7);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 9;
  f.frequency.setValueAtTime(up ? 300 : 2400, t0);
  f.frequency.exponentialRampToValueAtTime(up ? 2400 : 250, t0 + 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.045, t0 + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  o.connect(f).connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + 0.85);
}

export const sfx = {
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
  pulse(pos, pitch = 1800) {
    const { pan, gain } = placed(pos, 25);
    tone(pitch, 0, 0.6, { gain: 0.08 * gain, slide: 0.45, pan });
    tone(pitch * 1.5, 0, 0.3, { gain: 0.03 * gain, slide: 0.5, pan });
  },
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
  // A hit at the shooting gallery: a bright clang.
  clang(pos) {
    const { pan, gain } = placed(pos, 20);
    [1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.04, 0.6, { type: "triangle", gain: 0.06 * gain, pan }));
  },
  // Light slowing down: a long falling shimmer settling into a low hum.
  slowdown(dur = 5) {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.8;
    const s = noiseSource();
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(5000, t0);
    f.frequency.exponentialRampToValueAtTime(140, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.6);
    g.gain.setValueAtTime(0.12, t0 + dur - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.5);
    s.connect(f).connect(g).connect(master);
    s.start(t0);
    s.stop(t0 + dur + 2);
    [[880, 110], [1320, 165], [1760, 220]].forEach(([a, b], i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(a, t0);
      o.frequency.exponentialRampToValueAtTime(b, t0 + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.03 / (i + 1), t0 + 1);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.8);
      o.connect(og).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 2);
    });
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
