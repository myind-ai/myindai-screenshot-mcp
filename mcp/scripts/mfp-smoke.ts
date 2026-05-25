#!/usr/bin/env node
// Render the same kaabil input in the MFP "Stay [healthy]" style:
// solid blue bg, big phone bleeding from the bottom, headline at top with a yellow pill highlight.
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
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
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

async function main() {
  const inputImage = process.argv[2] || "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const out = process.argv[3] || "/tmp/mfp-style.png";

  const c = start();
  await c.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "mfp-smoke", version: "0.0.1" } });

  const t0 = Date.now();
  const r = await c.call("tools/call", {
    name: "render_screenshot",
    arguments: {
      image: inputImage,
      output_path: out,
      text_color: "light",
      // Solid blue MFP-style background.
      background: { type: "solid", solid: "#2563eb" },
      screenshot: {
        scale: 92, x: 50, y: 80,        // tight: phone is BIG and pushed to lower portion
        shadow: { enabled: true, blur: 100, opacity: 30, y: 40 },
      },
      text: {
        position: "top",
        offsetY: 6,                      // text close to top
        font: "Manrope",
        headlineWeight: "900",
        headlineSize: 150,
        headlineLetterSpacing: -3,
        headlineMaxWidthPct: 80,
        lineHeight: 96,
        headlineToSubheadlineGap: 30,
        headline: "Scan Job Requirements Fast",
        headlineHighlightWord: "Scan",
        headlineHighlightStyle: "pill",      // ← yellow pill behind "Scan"
        headlineHighlightColor: "#ffd84d",
        headlineHighlightPillTextColor: "#1a1a1a",
        subheadline: "Paste any URL, extract keywords instantly",
        subheadlineWeight: "600",
        subheadlineOpacity: 92,
        subheadlineSize: 46,
        subheadlineMaxWidthPct: 80,
      },
    },
  });
  console.error(`[mfp-smoke] ${Date.now() - t0}ms`);
  if (r.result?.isError) {
    console.error("ERROR:", r.result.content[0].text);
    process.exit(1);
  }
  console.error(JSON.parse(r.result.content[0].text));

  c.close();
}

main().catch((e) => { console.error("[mfp-smoke] fatal:", e); process.exit(1); });
