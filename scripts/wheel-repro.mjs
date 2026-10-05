// Screenshots the Ferris wheel from many angles and conditions, tiled into
// contact sheets in shots/. Usage: node scripts/wheel-repro.mjs [tag]
import { open, report } from "./lib.mjs";
import { execFileSync } from "node:child_process";

const tag = process.argv[2] ?? "a";
if (!/^[\w-]+$/.test(tag)) throw new Error("The tag can only use letters, digits, - and _");
const t = await open({ hash: "#pier@0,-100,0,0", size: [900, 560] });
await t.hud(false);
const W = { x: -16, y: 14.5, z: -146 };
const views = [
  ["front", [-16, -127]], ["front-left", [-26, -132]], ["front-right", [-5, -133]],
  ["under", [-13, -139]], ["side", [4, -146]], ["behind", [-16, -168]],
  ["close-right", [-7, -140]], ["close-left", [-25, -141]], ["close-top", [-12, -134]],
];
const conds = [
  ["day", 0, 6], ["day-late", 1800, 6], ["night", 150, 6], ["slow-light", 0, 2.5],
];
const shots = [];
for (const [cname, adv, c] of conds) {
  await t.q(([c]) => { pacetime.load("pier"); pacetime.closeMenu(); pacetime.world.c = c; document.getElementById("hud").hidden = true; }, [c]);
  if (adv) await t.advance(adv);
  for (const [vname, [x, z]] of views) {
    // Close views aim at a rim point rather than the hub.
    const tx = vname === "close-right" ? W.x + 9 : vname === "close-left" ? W.x - 9 : W.x;
    const ty = vname.startsWith("close") ? W.y + (vname === "close-top" ? 10 : 2) : W.y;
    const yaw = Math.atan2(-(tx - x), -(W.z - z));
    const pitch = Math.atan2(ty - 1.6, Math.hypot(tx - x, W.z - z)) * 0.95;
    await t.place(x, z, yaw, pitch);
    await t.advance(0.3);
    await t.wait(120);
    shots.push(await t.snap(`wr-${tag}-${cname}-${vname}`));
  }
  // and one walking toward the wheel
  await t.place(-16, -118, 0, 0.35);
  await t.page.keyboard.down("w"); await t.wait(1200);
  shots.push(await t.snap(`wr-${tag}-${cname}-walk`));
  await t.page.keyboard.up("w");
}
report(t.errors);
await t.close();
// Contact sheets of 9.
const py = `
import sys
from PIL import Image
files = sys.argv[2:]
for s in range(0, len(files), 9):
    group = files[s:s+9]
    w, h = 900, 560
    sheet = Image.new("RGB", (w*3+8, h*3+8), "white")
    for i, f in enumerate(group):
        sheet.paste(Image.open(f), ((i%3)*(w+4), (i//3)*(h+4)))
    sheet.save(f"shots/wheel-sheet-{sys.argv[1]}-{s//9}.png")
`;
execFileSync("python3", ["-c", py, tag, ...shots]);
console.log(`shots/wheel-sheet-${tag}-0..${Math.ceil(shots.length / 9) - 1}.png`);
