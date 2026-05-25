#!/usr/bin/env node
// Smoke test for v0.5: kaabil-style still re-render (gap fix) + multi-act concept video.
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
  console.error(`[${label}] ${Date.now() - t}ms → ${out.path || ""}`);
  return out;
}

async function main() {
  // Use the kaabil image the user shared.
  const inputImage = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/appscreen-output/kaabil-seo-hero-01.png";
  const outDir = process.argv[3] || "/tmp";

  const c = start();
  await c.call("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "concept-smoke", version: "0.0.1" }
  });

  // 1. Re-render kaabil-style with the gap fix + a Linear look.
  await callTool(c, "render_screenshot", {
    image: inputImage,
    output_path: path.join(outDir, "kaabil-fixed.png"),
    text_color: "light",
    background: {
      type: "gradient",
      gradient: { angle: 145, stops: [
        { color: "#0a0a0f", position: 0 },
        { color: "#1a1033", position: 50 },
        { color: "#0d1b2a", position: 100 }
      ]},
    },
    screenshot: {
      scale: 76, x: 50, y: 56,
      glow: { enabled: true, color: "#ec4899", intensity: 65, size: 90 },
      shadow: { enabled: true, blur: 110, opacity: 55, y: 40 },
    },
    text: {
      headline: "AI Resume Builder for ATS",
      subheadline: "Check ATS score, fix skill gaps, get interview-ready faster",
      font: "Inter",
      headlineWeight: "800",
      headlineSize: 130,                 // smaller than the kaabil one to fit on 2 lines
      headlineLetterSpacing: -2,
      headlineMaxWidthPct: 78,           // wider so "ATS" doesn't orphan
      lineHeight: 100,
      headlineToSubheadlineGap: 60,      // breathing room — was ~10px before
      subheadlineMaxWidthPct: 80,        // keeps subheadline within margins
      subheadlineSize: 48,
      subheadlineWeight: "500",
      subheadlineOpacity: 85,
      headlineHighlightWord: "ATS",
      headlineHighlightColor: "#f472b6",
    },
  }, "still-fixed");

  // 2. Multi-act concept video — 5s premium reveal with proper enter/hold/exit.
  await callTool(c, "render_video_concept", {
    image: inputImage,
    output_path: path.join(outDir, "kaabil-concept.mp4"),
    fps: 30,
    format: "mp4",
    concept: {
      base: {
        mode: "3d",
        background: {
          type: "gradient",
          gradient: { angle: 145, stops: [
            { color: "#0a0a0f", position: 0 },
            { color: "#1a1033", position: 50 },
            { color: "#0d1b2a", position: 100 }
          ]},
        },
        screenshot: {
          x: 50, y: 55,
          glow: { enabled: true, color: "#ec4899", intensity: 60, size: 90 },
          shadow: { enabled: true, blur: 110, opacity: 55, y: 40 },
        },
        text: {
          font: "Inter",
          headlineWeight: "800",
          headlineSize: 130,
          headlineLetterSpacing: -2,
          headlineMaxWidthPct: 78,
          lineHeight: 100,
          headlineToSubheadlineGap: 50,
          subheadlineMaxWidthPct: 80,
          subheadlineSize: 46,
          subheadlineWeight: "500",
          subheadlineOpacity: 85,
        },
        headline: "AI Resume Builder",
        subheadline: "Built to beat the ATS",
      },
      acts: [
        {
          name: "Reveal",
          duration: 1.6,
          motion: [
            { t: 0,   decision: { screenshot: { scale: 60, y: 65, rotation3D: { x: 0, y: 35, z: 0 } } } },
            { t: 1.0, decision: { screenshot: { scale: 76, y: 55, rotation3D: { x: -8, y: 18, z: 0 } } } },
          ],
          text: { fade_in: 0.55, fade_out: 0 },
          transition: { kind: "crossfade", duration: 0.3 },
        },
        {
          name: "Hold + glow pulse",
          duration: 1.6,
          motion: [
            { t: 0,   decision: { screenshot: { scale: 76, y: 55, rotation3D: { x: -8, y: 18, z: 0 }, glow: { intensity: 60 } } } },
            { t: 0.5, decision: { screenshot: { glow: { intensity: 85 } } } },
            { t: 1.0, decision: { screenshot: { glow: { intensity: 60 } } } },
          ],
          text: { fade_in: 0, fade_out: 0 },
          transition: { kind: "crossfade", duration: 0.35 },
        },
        {
          name: "Pivot",
          duration: 1.2,
          motion: [
            { t: 0,   decision: { screenshot: { scale: 76, y: 55, rotation3D: { x: -8, y: 18, z: 0 } } } },
            { t: 1.0, decision: { screenshot: { scale: 80, y: 52, rotation3D: { x: -5, y: 0, z: 0 } } } },
          ],
          text: {
            headline: "Land more interviews",
            subheadline: "ATS-optimized in seconds",
            fade_in: 0.3, fade_out: 0,
          },
          transition: { kind: "cut" },
        },
        {
          name: "Exit",
          duration: 0.8,
          motion: [
            { t: 0, decision: { screenshot: { scale: 80, y: 52, rotation3D: { x: -5, y: 0, z: 0 } } } },
            { t: 1, decision: { screenshot: { scale: 88, y: 50, rotation3D: { x: 0, y: 0, z: 0 } } } },
          ],
          text: { fade_in: 0, fade_out: 0.6 },
        },
      ],
    },
  }, "concept-video");

  c.close();
  console.error("[concept-smoke] done");
}

main().catch((e) => { console.error("[concept-smoke] fatal:", e); process.exit(1); });
