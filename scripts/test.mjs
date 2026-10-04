// Runs every check: UI, the experiments, and the everyday scenes.
// Usage: bun run dev (in another shell), then: node scripts/test.mjs
import { spawn } from "node:child_process";

const runs = [
  ["ui", ["scripts/ui.mjs"]],
  ["railway", ["scripts/experiments.mjs", "railway"]],
  ["beam", ["scripts/experiments.mjs", "beam"]],
  ["scenes", ["scripts/scenes.mjs"]],
];
const t0 = Date.now();
const results = await Promise.all(runs.map(([name, args]) => new Promise((resolve) => {
  const p = spawn("node", args, { env: { ...process.env, WARP: "6" } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => resolve({ name, code, out }));
})));
let ok = true;
for (const { name, code, out } of results) {
  const todo = (out.match(/^\s*"?· .*$/gm) ?? []).filter((l) => !/· [A-Z][a-z]+( [a-z]+)?"?,?$/.test(l.trim()));
  const fails = out.match(/^FAIL.*$/gm) ?? [];
  const errs = /ERRORS:|Error|error/.test(out) && !/no console errors/.test(out.split("\n").filter((l) => /ERRORS|no console errors/.test(l)).pop() ?? "");
  const good = code === 0 && !fails.length;
  ok &&= good;
  console.log(`${good ? "PASS" : "FAIL"} ${name}${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  if (!good || process.env.VERBOSE === "1") console.log(out.split("\n").map((l) => "    " + l).join("\n"));
  void todo, void errs;
}
console.log(`${ok ? "all passed" : "failures"} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(ok ? 0 : 1);
