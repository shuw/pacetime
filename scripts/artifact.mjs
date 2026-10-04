// Builds dist/, then a copy for hosting as a single embedded page in
// artifact/: the page body without its own <html>/<head> wrappers.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
execSync("bun build ./index.html --outdir dist --minify", { stdio: "inherit" });
rmSync("artifact", { recursive: true, force: true });
mkdirSync("artifact");
const html = readFileSync("dist/index.html", "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta[^>]*>\s*/g, "");
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync("artifact/index.html", `${head.trim()}\n${body.trim()}\n`);
for (const f of readdirSync("dist")) if (f !== "index.html") copyFileSync(`dist/${f}`, `artifact/${f}`);
console.log(readdirSync("artifact"));
