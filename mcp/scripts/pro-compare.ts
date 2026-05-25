#!/usr/bin/env node
// Render the SAME input twice — once with the old "1/10" defaults, once with a Named Look.
// This is the visual proof that the design pipeline works.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

interface JsonRpc { jsonrpc: "2.0"; id: number; result?: any; error?: { code: number; message: string } }

function startServer() {
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ANTHROPIC_API_KEY: "" },
  });
  let buf = "";
  const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line) continue;
      try { const msg = JSON.parse(line) as JsonRpc; const cb = pending.get(msg.id); if (cb) { pending.delete(msg.id); cb(msg); } } catch {}
    }
  });
  let nextId = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpc>((resolve) => {
      const id = nextId++; pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  return { call, close: () => { proc.stdin.end(); proc.kill(); } };
}

async function callRender(client: any, args: any, label: string) {
  const t = Date.now();
  const r = await client.call("tools/call", { name: "render_screenshot", arguments: args });
  if (r.result?.isError) {
    console.error(`[${label}] error:`, r.result.content[0].text);
    process.exit(1);
  }
  const out = JSON.parse(r.result.content[0].text);
  console.error(`[${label}] ${Date.now() - t}ms → ${out.path}`);
}

async function main() {
  const inputImage = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const outDir = process.argv[3] || "/tmp";

  const client = startServer();
  await client.call("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "pro-compare", version: "0.0.1" }
  });

  // 1/10 — what we used to ship: small caption headline, a preset, no glow, no decoration, weight 600.
  await callRender(client, {
    image: inputImage,
    output_path: path.join(outDir, "compare-noob.png"),
    headline: "App Store screenshots",
    subheadline: "Beautiful, every time",
    background_preset: "Indigo Rush",
    text_color: "light",
  }, "noob");

  // 10/10 — Look D (Duolingo-style) with custom gradient stops, 900 weight, big size, highlight word, glow, and big-number decoration.
  await callRender(client, {
    image: inputImage,
    output_path: path.join(outDir, "compare-pro-duolingo.png"),
    text_color: "light",
    background: {
      type: "gradient",
      gradient: {
        angle: 150,
        stops: [
          { color: "#2d1b69", position: 0 },
          { color: "#ff2d78", position: 50 },
          { color: "#ff901f", position: 100 },
        ],
      },
    },
    screenshot: {
      scale: 76, x: 50, y: 56,
      glow: { enabled: true, color: "#ff2d78", intensity: 75, size: 90 },
      shadow: { enabled: true, blur: 120, opacity: 50, y: 45 },
      decoration: { type: "big-number", value: "01", color: "#ffffff", opacity: 10, position: "top-right" },
    },
    text: {
      headline: "Beautiful by default",
      subheadline: "Pixel-perfect screenshots, every time",
      font: "Manrope",
      headlineWeight: "900",
      headlineSize: 160,
      headlineLetterSpacing: -3,
      headlineMaxWidthPct: 70,
      lineHeight: 95,
      headlineHighlightWord: "Beautiful",
      headlineHighlightColor: "#ffd84d",
      subheadlineWeight: "500",
      subheadlineOpacity: 90,
    },
  }, "pro-duolingo");

  // 10/10 — Look E (Apple Marketing) with gradient text, big shadow, no decoration.
  await callRender(client, {
    image: inputImage,
    output_path: path.join(outDir, "compare-pro-apple.png"),
    text_color: "light",
    background: {
      type: "gradient",
      gradient: { angle: 180, stops: [
        { color: "#0a0a0a", position: 0 },
        { color: "#1c1c1e", position: 100 }
      ]}
    },
    screenshot: {
      scale: 70, x: 50, y: 55,
      glow: { enabled: true, color: "#ffffff", intensity: 35, size: 110 },
      shadow: { enabled: true, color: "#000000", blur: 140, opacity: 70, y: 50 },
    },
    text: {
      headline: "Designed in California",
      subheadline: "Loved everywhere",
      font: "Inter",
      headlineWeight: "700",
      headlineSize: 150,
      headlineLetterSpacing: -3,
      headlineMaxWidthPct: 65,
      lineHeight: 100,
      headlineGradient: { colors: ["#ffffff", "#a8a8b3"], angle: 180 },
      subheadlineWeight: "500",
      subheadlineOpacity: 75,
    },
  }, "pro-apple");

  // 10/10 — Look A (Linear) with glow + tight letter spacing.
  await callRender(client, {
    image: inputImage,
    output_path: path.join(outDir, "compare-pro-linear.png"),
    text_color: "light",
    background: {
      type: "gradient",
      gradient: { angle: 145, stops: [
        { color: "#0a0a0f", position: 0 },
        { color: "#1a1033", position: 50 },
        { color: "#0d1b2a", position: 100 },
      ]},
    },
    screenshot: {
      scale: 72, x: 50, y: 56,
      glow: { enabled: true, color: "#7c3aed", intensity: 70, size: 95 },
      shadow: { enabled: true, color: "#000000", blur: 110, opacity: 60, y: 40 },
    },
    text: {
      headline: "Ship faster, sleep better",
      subheadline: "Built for engineers who care",
      font: "Inter",
      headlineWeight: "800",
      headlineSize: 145,
      headlineLetterSpacing: -2,
      headlineMaxWidthPct: 65,
      lineHeight: 98,
      headlineHighlightWord: "faster",
      headlineHighlightColor: "#a78bfa",
      subheadlineWeight: "500",
      subheadlineOpacity: 85,
    },
  }, "pro-linear");

  client.close();
  console.error("[pro-compare] done");
}

main().catch((e) => { console.error("[pro-compare] fatal:", e); process.exit(1); });
