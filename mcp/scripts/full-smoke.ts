#!/usr/bin/env node
// Drive the FULL render_screenshot surface end-to-end through stdio MCP.
// Verifies that custom font, weight, shadow, 3D rotation, and a custom gradient all reach the renderer.
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
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  return { call, close: () => { proc.stdin.end(); proc.kill(); } };
}

async function main() {
  const inputImage = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const outputDir = process.argv[3] || "/tmp";

  const client = startServer();
  await client.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "full-smoke", version: "0.0.1" } });

  // 1. resources/list + read
  const resList = await client.call("resources/list", {});
  console.error(`[full-smoke] resources: ${(resList.result?.resources || []).map((r: any) => r.uri).join(", ")}`);

  const presetsRes = await client.call("resources/read", { uri: "appscreen://presets" });
  const presets = JSON.parse(presetsRes.result.contents[0].text);
  console.error(`[full-smoke] resource appscreen://presets: ${presets.gradients.length} gradients, ${Object.keys(presets.positionPresets).length} positions, ${presets.fontFamilies.length} fonts`);

  const guideRes = await client.call("resources/read", { uri: "appscreen://design-guide" });
  console.error(`[full-smoke] design guide length: ${guideRes.result.contents[0].text.length} chars`);

  // 2. prompts/list
  const promptList = await client.call("prompts/list", {});
  console.error(`[full-smoke] prompts: ${(promptList.result?.prompts || []).map((p: any) => p.name).join(", ")}`);

  const prompt = await client.call("prompts/get", { name: "design_app_store_screenshot", arguments: { app_name: "Yuzu Shot" } });
  console.error(`[full-smoke] prompt design_app_store_screenshot length: ${prompt.result.messages[0].content.text.length} chars`);

  // 3. render_screenshot with FULL spec — custom font, custom shadow, custom gradient, 3D rotation
  console.error(`[full-smoke] calling render_screenshot with full spec...`);
  const t0 = Date.now();
  const args = {
    image: inputImage,
    output_path: path.join(outputDir, "full-smoke-2d.png"),
    headline: "Beautiful by default",
    subheadline: "Pixel-perfect screenshots in seconds",
    mode: "2d",
    text_color: "light",
    background: {
      type: "gradient",
      gradient: {
        angle: 145,
        stops: [
          { color: "#0f0c29", position: 0 },
          { color: "#302b63", position: 50 },
          { color: "#24243e", position: 100 },
        ],
      },
      noise: true,
      noiseIntensity: 12,
    },
    screenshot: {
      scale: 78,
      x: 50,
      y: 65,
      rotation: 0,
      perspective: 8,
      shadow: { enabled: true, color: "#000000", blur: 90, opacity: 45, x: 0, y: 35 },
    },
    text: {
      position: "top",
      font: "Manrope",
      headlineSize: 115,
      headlineWeight: "800",
      subheadlineSize: 55,
      subheadlineWeight: "400",
      subheadlineOpacity: 75,
      lineHeight: 105,
    },
  };
  const r1 = await client.call("tools/call", { name: "render_screenshot", arguments: args });
  if (r1.error) { console.error("[full-smoke] 2D error:", r1.error); process.exit(1); }
  console.error(`[full-smoke] 2D render: ${Date.now() - t0}ms → ${JSON.parse(r1.result.content[0].text).path}`);

  // 4. 3D mode with rotation
  const t1 = Date.now();
  const args3D = {
    image: inputImage,
    output_path: path.join(outputDir, "full-smoke-3d.png"),
    headline: "Bring screens to life",
    subheadline: "Real device frame, real depth",
    mode: "3d",
    background_preset: "Synthwave Dusk",
    text_color: "light",
    screenshot: {
      scale: 70,
      y: 55,
      rotation3D: { x: -10, y: 22, z: 0 },
      shadow: { enabled: true, blur: 110, opacity: 50, y: 50 },
    },
    text: { font: "Plus Jakarta Sans", headlineWeight: "800", headlineSize: 110 },
  };
  const r2 = await client.call("tools/call", { name: "render_screenshot", arguments: args3D });
  if (r2.error) { console.error("[full-smoke] 3D error:", r2.error); process.exit(1); }
  if (r2.result?.isError) {
    console.error(`[full-smoke] 3D tool returned error: ${r2.result.content[0].text}`);
    process.exit(1);
  }
  console.error(`[full-smoke] 3D render: ${Date.now() - t1}ms → ${JSON.parse(r2.result.content[0].text).path}`);

  client.close();
}

main().catch((e) => { console.error("[full-smoke] fatal:", e); process.exit(1); });
