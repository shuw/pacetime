// The trailer's timeline, shared by the recorder and the score: 120 beats a
// minute, so a bar of four beats is two seconds.
export const FPS = 30;
export const BPM = 120;
export const BAR = (4 * 60) / BPM;
export const LENGTH = 96;

// Sections of the score, in bars from the start.
export const SECTIONS = {
  intro: [0, 4], // golden hour on the pier: a music box
  funfair: [4, 14], // the funfair: pads, a soft beat
  groove: [14, 25], // the crossroads and the railway: bass and drums
  build: [25, 29], // the endless road: faster and faster
  drop: [29, 43], // the pulse, the starship, the montage: everything at once
  outro: [43, 48], // the title: one big chord, then the music box again
};

// Captions, in seconds. Each pops in and fades out.
export const CAPTIONS = [
  { from: 0.8, to: 5.8, text: "What if light moved at a walking pace?" },
  { from: 8.4, to: 11.6, text: "You'd see everything a little late." },
  { from: 12.6, to: 15.7, text: "Even your reflections." },
  { from: 19.3, to: 21.8, text: "Aim ahead of what you see." },
  { from: 22.6, to: 25.0, text: "Hear the bang…" },
  { from: 25.8, to: 27.8, text: "…then see the flash." },
  { from: 28.6, to: 31.7, text: "Taxis at 85% of light speed…" },
  { from: 33.6, to: 35.8, text: "…are closer than they look." },
  { from: 36.4, to: 39.7, text: "Trust the timetable, not your eyes." },
  { from: 40.6, to: 45.7, text: "Fast trains shrink. Their clocks run slow." },
  { from: 46.4, to: 49.7, text: "Too long for the tunnel? It fits." },
  { from: 58.4, to: 61.7, text: "Light still outruns you. Always." },
  { from: 62.6, to: 67.7, text: "Proxima Centauri in one minute…" },
  { from: 68.4, to: 71.7, text: "…4.24 light-years from home." },
  { from: 78.4, to: 81.7, text: "Back home, eight years have passed." },
];

// Sound effects the score mixes in, in seconds.
export const HITS = [
  { at: 22.8, kind: "boom" }, // the fireworks shot is timed for a bang 0.8 s in
  { at: 34.0, kind: "bonk" }, // the bonk shot puts the taxi there two seconds in
  ...[82, 83, 84, 85, 86].map((at) => ({ at, kind: "whoosh" })), // the montage's cuts
];
