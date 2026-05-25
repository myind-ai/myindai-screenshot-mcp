#!/usr/bin/env node
// Pre-publish validator. In the v1.0.0 layout the renderer lives canonically
// at `mcp/frontend/`, so prepack no longer needs to copy anything — it just
// asserts that every file the headless renderer needs is present, with a
// non-zero size, before `tsc` runs.
//
// Why a validator and not a no-op: catches the case where someone deletes
// a renderer file by accident and ships a broken npm package. Better to fail
// the publish than to ship a server that boot-loops.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const frontend = path.join(pkgRoot, "frontend");

const REQUIRED_FILES = [
  "index.html",
  "app.js",
  "three-renderer.js",
  "language-utils.js",
  "styles.css",
];

let ok = true;
for (const f of REQUIRED_FILES) {
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

console.log("[prepack] all renderer assets present.");
