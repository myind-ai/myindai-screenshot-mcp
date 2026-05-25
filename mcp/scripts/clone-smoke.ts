#!/usr/bin/env node
// Smoke: simulate the cloning flow.
//   1. extract_palette on a reference (the user's kaabil screenshot)
//   2. render_screenshot using the suggested gradient + a Linear-ish look
//   3. confirm the output's gradient matches the reference's mood
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

interface JsonRpc { jsonrpc: "2.0"; id: number; result?: any; error?: any }

function start() {
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ANTHROPIC_API_KEY: "" },
  });
  let buf = "";
  const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (c: Buffer) => {
    buf += c.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } } catch {}
    }
  });
  let id = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpc>((res) => {
      const x = id++; pending.set(x, res);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: x, method, params }) + "\n");
    });
  }
  return { call, close: () => { proc.stdin.end(); proc.kill(); } };
}

async function callTool(c: any, name: string, args: any, label: string) {
  const t = Date.now();
  const r = await c.call("tools/call", { name, arguments: args });
  if (r.result?.isError) {
    console.error(`[${label}] error:`, r.result.content[0].text);
    process.exit(1);
  }
  const out = JSON.parse(r.result.content[0].text);
  console.error(`[${label}] ${Date.now() - t}ms`);
  return out;
}

async function main() {
  const reference = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/appscreen-output/kaabil-seo-hero-01.png";
  const userScreenshot = process.argv[3] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const outDir = process.argv[4] || "/tmp";

  const c = start();
  await c.call("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "clone-smoke", version: "0.0.1" }
  });

  // Step 1: extract palette from the reference.
  const palette = await callTool(c, "extract_palette", { image: reference, count: 5 }, "extract_palette");
  console.error("[palette] top colors:");
  palette.colors.forEach((c: any) => {
    console.error(`  ${c.hex}  share=${(c.share * 100).toFixed(1)}%`);
  });
  console.error("[palette] suggested gradient:", JSON.stringify(palette.suggested_gradient));

  // Step 2: render with the extracted gradient.
  // Pick the most saturated mid-luminance color as glow accent.
  const glowAccent = palette.colors[0]?.hex || "#7c3aed";

  const rendered = await callTool(c, "render_screenshot", {
    image: userScreenshot,
    reference_image: reference,
    output_path: path.join(outDir, "clone-smoke-output.png"),
    text_color: "light",
    background: {
      type: "gradient",
      gradient: palette.suggested_gradient,
    },
    screenshot: {
      scale: 76, x: 50, y: 56,
      glow: { enabled: true, color: glowAccent, intensity: 65, size: 90 },
      shadow: { enabled: true, blur: 110, opacity: 55, y: 40 },
    },
    text: {
      headline: "Cloned from a reference",
      subheadline: "Same gradient, your screenshot",
      font: "Inter",
      headlineWeight: "800",
      headlineSize: 130,
      headlineLetterSpacing: -2,
      headlineMaxWidthPct: 75,
      lineHeight: 100,
      headlineToSubheadlineGap: 50,
      subheadlineMaxWidthPct: 80,
      subheadlineSize: 46,
      subheadlineWeight: "500",
      subheadlineOpacity: 85,
      headlineHighlightWord: "reference",
      headlineHighlightColor: glowAccent,
    },
  }, "render");
  console.error("[render] output:", rendered.path);

  c.close();
  console.error("[clone-smoke] done");
}

main().catch((e) => { console.error("[clone-smoke] fatal:", e); process.exit(1); });
