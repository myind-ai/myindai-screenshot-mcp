#!/usr/bin/env node
// v1.0.0-rc.1 smoke test.
// Bypasses the AI layer (no ANTHROPIC_API_KEY needed) and drives the renderer
// directly to confirm the clean-room rewrite implements the contract:
//   __mcp.ready / applySpec / exportCanvasAsPng / listPresets.
//
// Usage:
//   npx tsx scripts/rc1-smoke.ts <input.png> [output.png]

import path from "node:path";
import fs from "node:fs/promises";
import { listPresets, loadImage, render } from "../src/renderer/render.js";
import { shutdown } from "../src/renderer/browser.js";

async function main() {
  const input = process.argv[2];
  const out = process.argv[3] || path.resolve(process.cwd(), "rc1-smoke-output.png");
  if (!input) {
    console.error("Usage: tsx scripts/rc1-smoke.ts <input.png> [output.png]");
    process.exit(1);
  }
  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  await fs.access(abs);

  console.error(`[rc1-smoke] input  = ${abs}`);
  console.error(`[rc1-smoke] output = ${out}`);

  // 1. Sanity-check listPresets contract.
  console.error(`[rc1-smoke] step 1/3: listPresets`);
  const presets = await listPresets();
  if (presets.contractVersion !== 1) {
    throw new Error(`unexpected contractVersion: ${presets.contractVersion}`);
  }
  console.error(`[rc1-smoke]   contractVersion = ${presets.contractVersion}`);
  console.error(`[rc1-smoke]   templates       = ${presets.gradientPresets.length} gradients, ${presets.outputDevices.length} devices`);

  // 2. Load the input image.
  console.error(`[rc1-smoke] step 2/3: loadImage`);
  const { dataUrl, name } = await loadImage(abs);
  console.error(`[rc1-smoke]   name = ${name}`);
  console.error(`[rc1-smoke]   dataUrl prefix = ${dataUrl.slice(0, 32)}...`);

  // 3. Render one screenshot with the clean-minimal template.
  console.error(`[rc1-smoke] step 3/3: render(clean-minimal, ocean, iphone-15-pro-max)`);
  const t0 = Date.now();
  const png = await render({
    dataUrl,
    name,
    language: "en",
    outputDevice: "iphone-15-pro-max",
    decision: {
      template: "clean-minimal",
      headline: "Hello, App Store.",
      subheadline: "Clean-room rewrite preview — v1.0.0-rc.1.",
      background: "ocean",
      mode: "light",
      textPosition: "top",
      fontFamily: "Inter",
      fontWeight: "700",
    },
  });
  const ms = Date.now() - t0;
  console.error(`[rc1-smoke]   render done in ${ms}ms (${png.length} bytes)`);

  // 4. Sanity check: PNG magic.
  if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
    throw new Error("output is not a PNG (wrong magic bytes)");
  }

  await fs.writeFile(out, png);
  console.error(`[rc1-smoke] ✅ wrote ${out} (${png.length} bytes)`);
  await shutdown();
}

main().catch(async (err) => {
  console.error("[rc1-smoke] ❌ error:", err);
  await shutdown().catch(() => {});
  process.exit(1);
});
