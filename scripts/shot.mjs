// Quick look: node scripts/shot.mjs '#pier@0,-60,0,0' [name] [--wait 2] [--advance 10]
//   [--js 'code'] [--hud] [--size 1200x750] [--hold w+Shift:2000] [--warp 4]
import { open, report } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] ?? true; };
const has = (k) => args.includes(`--${k}`);
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--hud"].includes(args[i - 1])));
const hash = pos[0] ?? "";
const name = pos[1] ?? (hash.slice(1).split("@")[0] || "title");
const size = (flag("size", "1200x750")).split("x").map(Number);

const t = await open({ hash, size });
if (!has("hud")) await t.hud(false);
if (flag("warp")) await t.q((k) => (pacetime.warp = k), Number(flag("warp")));
if (flag("advance")) await t.advance(Number(flag("advance")));
if (flag("js")) console.log(await t.q(new Function(`return (${flag("js")})`)));
await t.wait(Number(flag("wait", 1.5)) * 1000);
if (flag("hold")) {
  const [keys, ms] = String(flag("hold")).split(":");
  for (const k of keys.split("+")) await t.page.keyboard.down(k);
  await t.wait(Number(ms ?? 1500));
  console.log(await t.snap(name + "-held"));
  for (const k of keys.split("+")) await t.page.keyboard.up(k);
}
if (!has("hud")) await t.hud(false);
console.log(await t.snap(name));
report(t.errors);
await t.close();
