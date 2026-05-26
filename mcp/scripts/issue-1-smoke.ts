#!/usr/bin/env node
// Regression smoke for issue #1.
// https://github.com/myind-ai/myindai-screenshot-mcp/issues/1
//
// Before the fix: render_screenshot with background_preset always produced a
// white canvas because the server set `decision.backgroundPreset` while the
// renderer read `decision.background`.
//
// This test renders three times — once per representative input shape — and
// asserts the top-left pixel is NOT white. If gradient painting regresses,
// the pixel goes back to (255, 255, 255) and the test fails.
//
// Run:  npx tsx scripts/issue-1-smoke.ts <input.png>

import path from "node:path";
import fs from "node:fs/promises";
import { loadImage, render } from "../src/renderer/render.js";
import { shutdown } from "../src/renderer/browser.js";

const INPUT = process.argv[2];
if (!INPUT) { console.error("usage: tsx scripts/issue-1-smoke.ts <input.png>"); process.exit(1); }

// Minimal PNG IHDR-aware top-left RGB extractor. PNGs use deflate so we can't
// read pixels without inflating; instead we strip alpha-channel sniffing and
// rely on sharp (already a runtime dep) to decode.
async function topLeftRgb(pngBuffer: Buffer): Promise<[number, number, number]> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error("PNG decoded to fewer than 3 channels");
  return [data[0], data[1], data[2]];
}

const cases: Array<{ name: string; decision: Record<string, unknown> }> = [
  { name: "(a) input.background_preset path (what render_screenshot sends)",
    decision: { template: "clean-minimal", headline: "Hi", backgroundPreset: "violet", textColor: "light" } },
  { name: "(b) legacy decision.background = preset name (string)",
    decision: { template: "clean-minimal", headline: "Hi", background: "ocean", textColor: "light" } },
  { name: "(c) rich background object — gradient",
    decision: { template: "clean-minimal", headline: "Hi",
      background: { type: "gradient", gradient: { angle: 180, stops: [
        { color: "#ff8a00", position: 0 }, { color: "#e52e71", position: 100 }
      ]}}, textColor: "light" } },
];

async function main() {
  const abs = path.isAbsolute(INPUT) ? INPUT : path.resolve(process.cwd(), INPUT);
  await fs.access(abs);
  const { dataUrl } = await loadImage(abs);

  let allOk = true;
  for (const [i, c] of cases.entries()) {
    const png = await render({ dataUrl, decision: c.decision });
    const [r, g, b] = await topLeftRgb(png);
    const isWhite = r === 255 && g === 255 && b === 255;
    const verdict = isWhite ? "❌ WHITE — gradient missing" : "✅ coloured";
    console.error(`  ${i + 1}. ${c.name}`);
    console.error(`     top-left RGB = (${r}, ${g}, ${b})  ${verdict}`);
    if (isWhite) allOk = false;

    // Save for visual inspection too.
    const outPath = `/tmp/issue1-case-${i + 1}.png`;
    await fs.writeFile(outPath, png);
    console.error(`     wrote ${outPath} (${png.length} bytes)`);
  }

  await shutdown();
  if (!allOk) {
    console.error("\n❌ issue #1 regression — at least one case rendered a white background.");
    process.exit(1);
  }
  console.error("\n✅ all 3 cases rendered a non-white background — issue #1 fix holds.");
}

main().catch(async (err) => {
  console.error("smoke error:", err);
  await shutdown().catch(() => {});
  process.exit(1);
});
