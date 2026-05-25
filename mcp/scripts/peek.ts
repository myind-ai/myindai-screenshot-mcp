// Quick debug: render once, then ask the bridge what fields actually got set on s.text.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

interface JsonRpc { jsonrpc: "2.0"; id: number; result?: any; error?: any }

function start() {
  const proc = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, ANTHROPIC_API_KEY: "" } });
  let buf = ""; const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (c: Buffer) => {
    buf += c.toString("utf8");
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } } catch {}
    }
  });
  let id = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpc>((res) => { const x = id++; pending.set(x, res); proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: x, method, params }) + "\n"); });
  }
  return { call, close: () => { proc.stdin.end(); proc.kill(); } };
}

async function main() {
  const c = start();
  await c.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "peek", version: "0.0.1" } });

  // Render Linear-style with a highlightWord we know should match.
  await c.call("tools/call", {
    name: "render_screenshot",
    arguments: {
      image: "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png",
      output_path: "/tmp/peek-render.png",
      text_color: "light",
      background: { type: "gradient", gradient: { angle: 145, stops: [{color:"#0a0a0f",position:0},{color:"#1a1033",position:50},{color:"#0d1b2a",position:100}]}},
      screenshot: { glow: { enabled: true, color: "#7c3aed", intensity: 70, size: 95 } },
      text: {
        headline: "Ship faster, sleep better",
        font: "Inter",
        headlineWeight: "800",
        headlineSize: 145,
        headlineHighlightWord: "faster",
        headlineHighlightColor: "#a78bfa",
      }
    }
  });

  // Now peek: ask the bridge what s.text actually contains.
  const resourcesList = await c.call("resources/list", {});
  // We need a way to call peek. We don't have it as a tool yet, so I'll just call it via the bridge ourselves.
  // The fastest path: define a small temporary tool. Instead, let's add a peek tool. -- we can also just spawn a separate playwright session.
  // For now, use the existing bridge by reading from inside the same page evaluate. We need a tool that exposes peek.
  c.close();
  console.error("peek script: this needs a peek tool to be useful — adding one is the next step.");
}

main().catch(e => { console.error(e); process.exit(1); });
