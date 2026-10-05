// Joins the recorded frames and the score into video/out/slowlight.mp4 (high
// quality) and slowlight-web.mp4 (small enough to share), with the sound
// brought up to a typical loudness for online video.
import { execFileSync } from "node:child_process";
import { FPS } from "./timeline.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
for (const [name, crf, preset] of [["slowlight.mp4", 20, "slow"], ["slowlight-web.mp4", 27, "slower"]]) {
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-framerate", String(FPS), "-i", OUT + "frames/%05d.jpg",
    "-i", OUT + "score.wav",
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest",
    OUT + name,
  ], { stdio: "inherit" });
  console.log("video/out/" + name);
}
