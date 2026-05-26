#!/usr/bin/env node
// Pre-publish: validate renderer assets at their canonical location
// (mcp/frontend/) and copy the top-level skills/ folder into mcp/skills/
// so the published npm tarball includes the Claude Code skill — letting
// users run `npx -y myindai-screenshot-mcp --install-skill` to drop it
// into ~/.claude/skills/ without having to clone the repo.
//
// Why we copy instead of a sibling files entry: npm `files` is rooted at
// the package directory and doesn't follow `..` references, so the skill
// folder has to live inside mcp/ at publish time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "..");
const frontend = path.join(pkgRoot, "frontend");
const skillsSrc = path.join(repoRoot, "skills");
const skillsDst = path.join(pkgRoot, "skills");

// 1. Validate renderer files exist and aren't empty.
const REQUIRED_RENDERER = [
  "index.html",
  "app.js",
  "three-renderer.js",
  "language-utils.js",
  "styles.css",
];

let ok = true;
for (const f of REQUIRED_RENDERER) {
  const p = path.join(frontend, f);
  if (!fs.existsSync(p)) {
    console.error(`[prepack] MISSING: ${path.relative(pkgRoot, p)}`);
    ok = false;
    continue;
  }
  const stat = fs.statSync(p);
  if (stat.size === 0) {
    console.error(`[prepack] EMPTY: ${path.relative(pkgRoot, p)}`);
    ok = false;
    continue;
  }
  console.log(`[prepack] ok ${path.relative(pkgRoot, p)} (${stat.size} bytes)`);
}

if (!ok) {
  console.error("[prepack] FATAL: renderer assets missing or empty — aborting publish.");
  process.exit(1);
}

// 2. Copy the skill folder into the package so `--install-skill` can find it.
if (fs.existsSync(skillsSrc)) {
  fs.rmSync(skillsDst, { recursive: true, force: true });
  fs.cpSync(skillsSrc, skillsDst, { recursive: true });
  // Sanity-check the canonical skill landed.
  const skillFile = path.join(skillsDst, "myindai-screenshot", "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    console.error(`[prepack] FATAL: SKILL.md missing after copy — aborting publish.`);
    process.exit(1);
  }
  console.log(`[prepack] ok skills/ copied → ${path.relative(pkgRoot, skillsDst)} (${countFiles(skillsDst)} files)`);
} else {
  console.warn(`[prepack] note: ${skillsSrc} not found — publishing without bundled skills (--install-skill won't work).`);
}

console.log("[prepack] all required assets present.");

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n += 1;
  }
  return n;
}
