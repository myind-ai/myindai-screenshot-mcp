#!/usr/bin/env node
// Regression smoke covering issues #2, #4, #5, #6, #7, #9, #10.
// Issues #3 (real 3D) + #8 (server-side warning) are exercised by ad-hoc
// inspection — they're behavioural / response-shape changes, not pixel checks.
//
// Run:  npx tsx scripts/issues-2-to-10-smoke.ts <input.png>

import path from "node:path";
import fs from "node:fs/promises";
import { loadImage, render } from "../src/renderer/render.js";
import { shutdown } from "../src/renderer/browser.js";

const INPUT = process.argv[2];
if (!INPUT) { console.error("usage: tsx scripts/issues-2-to-10-smoke.ts <input.png>"); process.exit(1); }

async function pixelAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const off = (y * info.width + x) * info.channels;
  return [data[off], data[off + 1], data[off + 2]];
}

const failures: string[] = [];
function assert(cond: boolean, label: string, info?: string) {
  if (cond) console.error(`  ✅ ${label}${info ? `  (${info})` : ""}`);
  else { console.error(`  ❌ ${label}${info ? `  (${info})` : ""}`); failures.push(label); }
}

async function main() {
  const abs = path.isAbsolute(INPUT) ? INPUT : path.resolve(process.cwd(), INPUT);
  await fs.access(abs);
  const { dataUrl } = await loadImage(abs);

  // ── Issue #2: passing nothing means `decision.background` should NOT be
  //    undefined-set. The template default `background: "ocean"` must apply.
  console.error("--- #2 omit optional fields ---");
  {
    const png = await render({ dataUrl, decision: { headline: "Defaults" } });
    const [r, g, b] = await pixelAt(png, 10, 10);
    const isWhite = r === 255 && g === 255 && b === 255;
    assert(!isWhite, "#2 template default background renders when no override passed", `top-left=(${r},${g},${b})`);
    await fs.writeFile("/tmp/issue2-defaults.png", png);
  }

  // ── Issue #7: textColor: "light" should produce LIGHT (white) text. Render
  //    a long all-caps headline and scan a wide horizontal band where the
  //    glyphs sit, count pixels that are bright vs dark.
  console.error("--- #7 textColor light/dark ---");
  {
    const pngLight = await render({ dataUrl, decision: {
      headline: "WIDE WHITE HEADLINE", backgroundPreset: "violet", textColor: "light"
    }});
    await fs.writeFile("/tmp/issue7-light.png", pngLight);
    // Headline is at y≈90-180 in 1290×2796. Sample a band of 200 x-positions
    // at y=130, count "bright" (white-ish) and "dark" (purple-ish bg) pixels.
    let bright = 0, dark = 0;
    for (let x = 80; x < 1210; x += 6) {
      const [r, g, b] = await pixelAt(pngLight, x, 130);
      const lum = (r + g + b) / 3;
      if (lum > 200) bright++;
      else if (lum < 100) dark++;
    }
    assert(bright > 10, "#7 light text — bright glyph pixels detected on dark bg", `${bright} bright / ${dark} dark in headline band`);
  }

  // ── Issue #10: every device key in PRESET_CATALOG.canvasDimensions must
  //    render without throwing "unknown outputDevice".
  console.error("--- #10 every advertised device renders ---");
  for (const device of ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5", "iphone-15-pro-max", "google-pixel-8"]) {
    try {
      const png = await render({ dataUrl, outputDevice: device, decision: { headline: device, backgroundPreset: "ocean" } });
      assert(png.length > 0, `#10 ${device}`, `${png.length} bytes`);
    } catch (e) {
      assert(false, `#10 ${device} throws: ${(e as Error).message}`);
    }
  }

  // ── Issue #6: positionPreset "tilt-right" must produce a visibly different
  //    output from "center" (rotation applied → some pixel near top-right
  //    that's bg in centered becomes device-dark in tilted, or vice versa).
  console.error("--- #6 position preset rotation actually applied ---");
  {
    const pngCenter = await render({ dataUrl, decision: { headline: "C", positionPreset: "center", backgroundPreset: "ocean" } });
    const pngTilt   = await render({ dataUrl, decision: { headline: "T", positionPreset: "tilt-right", backgroundPreset: "ocean" } });
    await fs.writeFile("/tmp/issue6-center.png", pngCenter);
    await fs.writeFile("/tmp/issue6-tilt.png", pngTilt);
    // Sample two pixels near the device edge — they should differ.
    let differences = 0;
    for (const [x, y] of [[200, 1000], [1090, 1000], [200, 1800], [1090, 1800]]) {
      const a = await pixelAt(pngCenter, x, y);
      const b = await pixelAt(pngTilt, x, y);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 50) differences++;
    }
    assert(differences >= 1, "#6 tilt-right produces different pixels than centered", `${differences}/4 sampled pixels differ`);
  }

  // ── Issue #4: screenshot.scale + screenshot.x override produces device at
  //    a different location. We push x to 80% and check the device is right
  //    of canvas centre vs default.
  console.error("--- #4 screenshot overrides apply ---");
  {
    const pngDefault = await render({ dataUrl, decision: { headline: "D", backgroundPreset: "ocean" } });
    const pngShifted = await render({ dataUrl, decision: { headline: "S", backgroundPreset: "ocean", screenshot: { scale: 60, x: 80, y: 50 } } });
    await fs.writeFile("/tmp/issue4-default.png", pngDefault);
    await fs.writeFile("/tmp/issue4-shifted.png", pngShifted);
    // Sample a pixel at top-left where default device is but shifted is not.
    const [r1] = await pixelAt(pngDefault, 200, 1000);
    const [r2] = await pixelAt(pngShifted, 200, 1000);
    assert(r1 !== r2, "#4 screenshot.scale/x/y override changes layout", `default.r=${r1} shifted.r=${r2}`);
  }

  // ── Issue #5: text.headlineSize + text.headlineColor override apply.
  //    Scan a wide band where the huge red headline glyphs should sit.
  console.error("--- #5 text overrides apply ---");
  {
    const png = await render({ dataUrl, decision: {
      headline: "HUGE RED HEADLINE",
      backgroundPreset: "ocean",
      text: { headlineSize: 140, headlineColor: "#ff0000", headlineWeight: "900" },
    }});
    await fs.writeFile("/tmp/issue5-huge-red.png", png);
    // headlineSize 140 on a 1290px canvas renders ~137 px tall. With
    // textPosition "top" the centre lands around y≈100-180. Scan that band.
    let redPixels = 0;
    for (let x = 80; x < 1210; x += 4) {
      for (let y = 80; y < 200; y += 4) {
        const [r, g, b] = await pixelAt(png, x, y);
        if (r > 180 && g < 100 && b < 100) { redPixels++; break; }
      }
    }
    assert(redPixels > 5, "#5 text.headlineColor renders the text in the chosen colour", `${redPixels} red glyph pixels found in headline band`);
  }

  // ── Issue #9: passing a rich background OBJECT no longer crashes.
  console.error("--- #9 rich background object does not crash ---");
  {
    try {
      const png = await render({ dataUrl, decision: {
        headline: "X",
        background: { type: "gradient", gradient: { angle: 135, stops: [
          { color: "#4c1d95", position: 0 }, { color: "#7c3aed", position: 100 }
        ]}},
      }});
      const [r, g, b] = await pixelAt(png, 10, 10);
      const isWhite = r === 255 && g === 255 && b === 255;
      assert(png.length > 0 && !isWhite, "#9 rich background object renders without throwing", `top-left=(${r},${g},${b})`);
      await fs.writeFile("/tmp/issue9-object-bg.png", png);
    } catch (e) {
      assert(false, `#9 throws: ${(e as Error).message}`);
    }
  }

  await shutdown();
  if (failures.length) {
    console.error(`\n❌ ${failures.length} smoke check(s) failed:`);
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }
  console.error("\n✅ all issues #2,4,5,6,7,9,10 smoke checks passed.");
}

main().catch(async (err) => {
  console.error("smoke error:", err);
  await shutdown().catch(() => {});
  process.exit(1);
});
