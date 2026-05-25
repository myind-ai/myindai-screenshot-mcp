#!/usr/bin/env node
// Smoke test: render a short MP4 via the real MCP stdio transport.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
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

async function main() {
  const inputImage = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const outDir = process.argv[3] || "/tmp";

  const client = startServer();
  await client.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "video-smoke", version: "0.0.1" } });

  const tools = await client.call("tools/list", {});
  console.error(`[video-smoke] tools: ${(tools.result?.tools || []).map((t: any) => t.name).join(", ")}`);

  // 1. Quick 2D zoom-in (fast)
  console.error("[video-smoke] rendering 2D zoom-in (1.5s @ 24fps mp4)...");
  let t0 = Date.now();
  const r1 = await client.call("tools/call", {
    name: "render_video",
    arguments: {
      image: inputImage,
      output_path: path.join(outDir, "video-zoom.mp4"),
      duration_seconds: 1.5,
      fps: 24,
      format: "mp4",
      scene: "zoom-in",
      base: {
        headline: "Beautiful by default",
        subheadline: "Pixel-perfect screenshots",
        mode: "2d",
        background_preset: "Indigo Rush",
        text_color: "light",
      },
    },
  });
  if (r1.result?.isError) { console.error("[video-smoke] zoom-in error:", r1.result.content[0].text); process.exit(1); }
  console.error(`[video-smoke] zoom-in done: ${Date.now() - t0}ms`);
  console.error(JSON.parse(r1.result.content[0].text));

  // 2. 3D tilt-in (slower)
  console.error("[video-smoke] rendering 3D tilt-in (2s @ 24fps mp4)...");
  t0 = Date.now();
  const r2 = await client.call("tools/call", {
    name: "render_video",
    arguments: {
      image: inputImage,
      output_path: path.join(outDir, "video-tilt-in.mp4"),
      duration_seconds: 2,
      fps: 24,
      format: "mp4",
      scene: "tilt-in",
      base: {
        headline: "Bring screens to life",
        subheadline: "Real device, real depth",
        background_preset: "Synthwave Dusk",
        text_color: "light",
      },
    },
  });
  if (r2.result?.isError) { console.error("[video-smoke] tilt-in error:", r2.result.content[0].text); process.exit(1); }
  console.error(`[video-smoke] tilt-in done: ${Date.now() - t0}ms`);
  console.error(JSON.parse(r2.result.content[0].text));

  // 3. Tiny GIF
  console.error("[video-smoke] rendering 1.5s GIF...");
  t0 = Date.now();
  const r3 = await client.call("tools/call", {
    name: "render_video",
    arguments: {
      image: inputImage,
      output_path: path.join(outDir, "video-fade.gif"),
      duration_seconds: 1.5,
      fps: 18,
      format: "gif",
      scene: "fade-in",
      base: {
        headline: "Hello world",
        background_preset: "Reef Lagoon",
        text_color: "light",
      },
    },
  });
  if (r3.result?.isError) { console.error("[video-smoke] gif error:", r3.result.content[0].text); process.exit(1); }
  console.error(`[video-smoke] gif done: ${Date.now() - t0}ms`);
  console.error(JSON.parse(r3.result.content[0].text));

  for (const f of ["video-zoom.mp4", "video-tilt-in.mp4", "video-fade.gif"]) {
    const p = path.join(outDir, f);
    const stat = await fs.stat(p);
    console.error(`[video-smoke] ${f}: ${(stat.size / 1024).toFixed(0)} KB`);
  }

  client.close();
}

main().catch((e) => { console.error("[video-smoke] fatal:", e); process.exit(1); });
