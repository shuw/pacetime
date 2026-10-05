// The trailer's timeline, cut to the music. The track is "Music Box
// Adventure" (made with Suno) at 122.9 beats a minute: its opening up to the
// end of the first build, spliced on a downbeat into the second drop and
// played out to the final chord. Everything is placed on its bar grid.
export const FPS = 30;
export const BPM = 122.9;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
export const FIRST = 0.342; // the first downbeat
export const bar = (k) => +(FIRST + k * BAR).toFixed(3); // where bar k starts, in seconds

export const MUSIC = {
  file: "Music Box Adventure.m4a",
  parts: [[0, 58.93], [111.65, 161.6]], // seconds of the song, played one after the other
};
export const LENGTH = 58.93 + (161.6 - 111.65);

// Sections, in bars (for the stand-in score, and for reference).
export const SECTIONS = {
  intro: [0, 6], // music box
  funfair: [6, 11], // pads build
  groove: [11, 20], // the beat comes in
  build: [20, 30], // rising
  drop: [30, 44], // the second drop
  outro: [44, 56], // a break, a last blast, the final chord
};

// Captions. Words pop in one after another (`per` seconds apart); *word* is highlighted.
export const CAPTIONS = [
  { from: bar(1), to: bar(2) + 0.1, text: "What if light", per: BEAT / 2 },
  { from: bar(2) + 0.1, to: bar(4) - 0.2, text: "moved at a *walking* *pace?*", per: BEAT / 2 },
  { from: bar(5), to: bar(7) - 0.2, text: "You'd see everything a little *late.*", per: BEAT / 2 },
  { from: bar(7) + 0.2, to: bar(9) - 0.2, text: "Even your *reflections.*", per: BEAT / 2 },
  { from: bar(9) + 0.3, to: bar(11) - 0.2, text: "Aim *ahead* of what you see.", per: BEAT / 2 },
  { from: bar(11) + 0.3, to: bar(12) + 1.2, text: "Hear the *bang…*", per: BEAT / 2 },
  { from: bar(13), to: bar(14) - 0.1, text: "…then see the *flash.*", per: BEAT / 2 },
  { from: bar(15), to: bar(16) - 0.05, text: "Taxis at *85%* of light speed…", per: BEAT / 3 },
  { from: bar(16) + 1.0, to: bar(18), text: "…are *closer* than they look.", per: BEAT / 2 },
  { from: bar(19) + 0.2, to: bar(21) - 0.2, text: "Trust the *timetable,* not your eyes.", per: BEAT / 2 },
  { from: bar(21) + 0.2, to: bar(23) - 0.2, text: "Fast trains *shrink.*", per: BEAT / 2 },
  { from: bar(23) + 0.2, to: bar(25) - 0.2, text: "Too long for the tunnel? It *fits.*", per: BEAT / 2 },
  { from: bar(30) + 0.3, to: bar(32) - 0.2, text: "Light still *outruns* you. Always.", per: BEAT / 2 },
  { from: bar(32) + 0.6, to: bar(35) - 0.2, text: "Proxima Centauri in *one* *minute…*", per: BEAT / 2 },
  { from: bar(35) + 0.2, to: bar(37) - 0.2, text: "…*4.24* light-years from home.", per: BEAT / 2 },
  { from: bar(40) + 0.2, to: bar(42) - 0.2, text: "Back home, *eight* *years* have passed.", per: BEAT / 2 },
];
