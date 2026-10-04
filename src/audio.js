let ctx;

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

function tone(freq, start, dur, { type = "sine", gain = 0.12, slide = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  pop: () => { tone(520, 0, 0.18, { slide: 2.2 }); tone(1040, 0.06, 0.2, { gain: 0.06 }); },
  ding: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: "triangle", gain: 0.08 })),
  choir: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.12, 1.2, { type: "triangle", gain: 0.07 })),
  whistle: () => { tone(1400, 0, 1.4, { type: "sine", gain: 0.08, slide: 1.25 }); tone(2100, 0.1, 1.3, { gain: 0.03 }); },
  womp: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.22, 0.4, { type: "square", gain: 0.04 })),
};
