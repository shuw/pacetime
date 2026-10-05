// The hype video's timeline, shared by the recorder and the score: 60 s at
// 120 beats a minute, so a bar of four beats is two seconds.
export const FPS = 30;
export const BPM = 120;
export const BAR = (4 * 60) / BPM;
export const LENGTH = 60;

// Sections of the score, in bars from the start.
export const SECTIONS = {
  intro: [0, 8], // the funfair: a music box, then soft pads
  groove: [8, 15], // the crossroads and the railway: bass and drums come in
  build: [15, 19], // the endless road: rising, faster and faster
  drop: [19, 26], // the starship and the montage: everything at once
  outro: [26, 30], // the title: one big chord, then the music box again
};

// Captions, in seconds. Each pops in and fades out.
export const CAPTIONS = [
  { from: 0.8, to: 5.4, text: "What if light moved at a walking pace?" },
  { from: 6.4, to: 9.6, text: "You'd see everything a little late." },
  { from: 16.6, to: 19.7, text: "Taxis at 85% of light speed…" },
  { from: 21.6, to: 23.8, text: "…are closer than they look." },
  { from: 24.6, to: 29.6, text: "Fast trains shrink. Their clocks run slow." },
  { from: 38.6, to: 43.6, text: "Proxima Centauri in one minute…" },
  { from: 44.4, to: 47.8, text: "…and eight years pass back home." },
];

// Sound effects the score mixes in, in seconds.
export const HITS = [
  { at: 22.0, kind: "bonk" }, // the bonk shot puts the taxi there two seconds in
  { at: 48, kind: "whoosh" }, { at: 49, kind: "whoosh" }, { at: 50, kind: "whoosh" }, { at: 51, kind: "whoosh" }, { at: 52, kind: "whoosh" },
];
