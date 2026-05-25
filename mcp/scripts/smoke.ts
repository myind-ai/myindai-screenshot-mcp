#!/usr/bin/env node
// Smoke test: render one screenshot end-to-end without going through the MCP transport.
// Usage:
//   ANTHROPIC_API_KEY=... npx tsx scripts/smoke.ts <image-path> [output-path]
import path from "node:path";
import fs from "node:fs/promises";
import { generateScreenshot } from "../src/tools/generate.js";
import { shutdown } from "../src/renderer/browser.js";

async function main() {
  const input = process.argv[2];
  const out = process.argv[3] || path.resolve(process.cwd(), "smoke-output.png");
  if (!input) {
    console.error("Usage: tsx scripts/smoke.ts <image-path> [output-path]");
    process.exit(1);
  }

  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  await fs.access(abs);

  console.error(`[smoke] input:  ${abs}`);
  console.error(`[smoke] output: ${out}`);
  console.error(`[smoke] AI:     ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (deterministic fallback)"}`);

  const t0 = Date.now();
  const result = await generateScreenshot({
    image: abs,
    output_path: out,
    app_name: process.env.APP_NAME,
    hints: process.env.HINTS,
    language: process.env.LANG_CODE || "en",
    device: (process.env.DEVICE as any) || "auto",
  });
  const ms = Date.now() - t0;

  console.error(`[smoke] done in ${ms}ms`);
  console.error(`[smoke] decisions: ${JSON.stringify(result.decisions, null, 2)}`);
  console.error(`[smoke] file: ${result.path}`);
  await shutdown();
}

main().catch(async (err) => {
  console.error("[smoke] error:", err);
  await shutdown().catch(() => {});
  process.exit(1);
});
