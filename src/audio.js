let ctx;

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

function tone(freq, start, dur, { type = "sine", gain = 0.1, slide = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, gain, cutoff) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  strike: () => { noise(1.4, 0.35, 900); tone(55, 0, 1.2, { type: "sine", gain: 0.2, slide: 0.6 }); },
  door: () => { noise(0.3, 0.2, 400); tone(90, 0, 0.3, { type: "triangle", gain: 0.12, slide: 0.7 }); },
  chime: () => [659, 988].forEach((f, i) => tone(f, i * 0.12, 1.4, { type: "sine", gain: 0.05 })),
};
