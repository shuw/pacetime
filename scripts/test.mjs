// Runs the browser tests: the controls and links, the railway experiments,
// every place's goals, and the reference screenshots. Starts the dev server if
// it isn't running. Usage: node scripts/test.mjs [--update]   (--update saves
// new reference screenshots after a deliberate change to how things look)
import { execFileSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEV_LOG } from "./lib.mjs";

const URL = process.env.URL ?? "http://localhost:5180/";
const t0 = Date.now();

// A build error would otherwise show up as every page timing out.
try {
  execFileSync("bun", ["build", "./index.html", "--outdir", join(tmpdir(), "pacetime-check")], { stdio: "pipe" });
} catch (e) {
  console.log("FAIL build\n" + (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""));
  process.exit(1);
}

const up = () => fetch(URL).then((r) => r.ok, () => false);
let server = null;
if (!(await up())) {
  const log = openSync(DEV_LOG, "w");
  server = spawn("bun", ["scripts/serve.ts"], { stdio: ["ignore", log, log], detached: false });
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}

const runs = [
  ["ui", ["scripts/ui.mjs"]],
  ["railway", ["scripts/experiments.mjs", "railway"]],
  ["scenes", ["scripts/scenes.mjs"]],
  ["looks", ["scripts/looks.mjs", ...(process.argv.includes("--update") ? ["--update"] : [])]],
];
const results = await Promise.all(runs.map(([name, args]) => new Promise((resolve) => {
  const p = spawn("node", args, { env: { ...process.env, WARP: "6", PACETIME_LOG: DEV_LOG } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => resolve({ name, code, out }));
})));
server?.kill();

let ok = true;
for (const { name, code, out } of results) {
  const problems = [
    ...(out.match(/^\s*FAIL.*$/gm) ?? []).map((l) => l.trim()),
    // Goals left undone (group headings like "· Simultaneity" don't count).
    ...(out.match(/^\s*"?· .*$/gm) ?? []).filter((l) => !/· [A-Z][a-z]+( [a-z]+)?"?,?$/.test(l.trim())).map((l) => "not done: " + l.trim().replace(/^"?· |",?$/g, "")),
    ...(/^ERRORS:/m.test(out) ? ["the page logged errors"] : []),
  ];
  const good = code === 0 && !problems.length;
  ok &&= good;
  console.log(`${good ? "PASS" : "FAIL"} ${name}${problems.length ? "\n  " + problems.join("\n  ") : ""}`);
  if (!good || process.env.VERBOSE === "1") console.log(out.split("\n").map((l) => "    " + l).join("\n"));
}
console.log(`${ok ? "all passed" : "failures"} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(ok ? 0 : 1);
