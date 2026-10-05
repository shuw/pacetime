// Joins the recorded frames with the music and the game's sound effects into
// video/out/slowlight.mp4 (high quality) and slowlight-web.mp4 (small enough
// to share), brought up to a typical loudness for online video. The music is
// the track in timeline.js, cut as it says, or the stand-in score if there's none.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { FPS, LENGTH, MUSIC } from "./timeline.mjs";

const HERE = new URL("./", import.meta.url).pathname, OUT = HERE + "out/";
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

// The music, cut to length: each part of the song in turn, joined with a
// short crossfade that ends just as the next part's first downbeat lands.
let music = null;
if (MUSIC && existsSync(HERE + MUSIC.file)) {
  const X = 0.02;
  const chains = MUSIC.parts.map(([a, b], i) => `[0:a]atrim=${i ? a - X : a}:${b},asetpts=PTS-STARTPTS[p${i}]`);
  let last = "p0";
  for (let i = 1; i < MUSIC.parts.length; i++) { chains.push(`[${last}][p${i}]acrossfade=d=${X}:c1=tri:c2=tri[x${i}]`); last = `x${i}`; }
  ff(["-i", HERE + MUSIC.file, "-filter_complex", chains.join(";"), "-map", `[${last}]`, "-ar", "48000", "-ac", "2", OUT + "music.wav"]);
  music = OUT + "music.wav";
}
if (!music) throw new Error(`No music: put ${MUSIC.file} in video/`);
const inputs = ["-i", music];
let mix = "[1:a]volume=1.0[m]";
if (existsSync(OUT + "effects.wav")) {
  inputs.push("-i", OUT + "effects.wav");
  mix = "[1:a]volume=1.0[mu];[2:a]volume=2.2[fx];[mu][fx]amix=inputs=2:duration=first:normalize=0[m]";
}
for (const [name, crf, preset] of [["slowlight.mp4", 19, "slow"], ["slowlight-web.mp4", 26, "slower"]]) {
  ff([
    "-framerate", String(FPS), "-i", OUT + "frames/%05d.jpg", ...inputs,
    "-filter_complex", `${mix};[m]loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:${LENGTH.toFixed(3)}[a]`,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest",
    OUT + name,
  ]);
  console.log("video/out/" + name);
}
// A 720p copy under 30 MB, for phones.
ff(["-i", OUT + "slowlight.mp4", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slower", "-b:v", "1800k", "-maxrate", "2400k", "-bufsize", "3600k",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", OUT + "slowlight-720p.mp4"]);
console.log("video/out/slowlight-720p.mp4");
