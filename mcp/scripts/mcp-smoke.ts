#!/usr/bin/env node
// Smoke test that talks to the server over real stdio JSON-RPC, just like an MCP client would.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

function startServer() {
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ANTHROPIC_API_KEY: "" },
  });

  let buf = "";
  const pending = new Map<number, (r: JsonRpcResponse) => void>();

  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const cb = pending.get(msg.id as number);
        if (cb) {
          pending.delete(msg.id as number);
          cb(msg);
        }
      } catch (e) {
        process.stderr.write(`[parse] ${line}\n`);
      }
    }
  });

  let nextId = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpcResponse>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      proc.stdin.write(req + "\n");
    });
  }

  function close() {
    proc.stdin.end();
    proc.kill();
  }

  return { call, close };
}

async function main() {
  const inputImage =
    process.argv[2] ||
    "/Users/shantanubombatkar/Documents/GitHub/appscreen/img/screenshot-generator.png";
  const outputFile = process.argv[3] || "/tmp/mcp-smoke.png";

  console.error(`[mcp-smoke] starting server: ${serverPath}`);
  const client = startServer();

  // initialize
  const init = await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-smoke", version: "0.0.1" },
  });
  console.error(`[mcp-smoke] init -> server: ${init.result?.serverInfo?.name}`);

  // list tools
  const tools = await client.call("tools/list", {});
  const names = (tools.result?.tools || []).map((t: any) => t.name);
  console.error(`[mcp-smoke] tools: ${names.join(", ")}`);

  // list_presets
  const lp = await client.call("tools/call", {
    name: "list_presets",
    arguments: {},
  });
  const presetText = lp.result?.content?.[0]?.text || "";
  const presets = JSON.parse(presetText);
  console.error(
    `[mcp-smoke] presets: ${presets.gradientPresets.length} gradients, ${presets.positionPresets.length} positions`
  );

  // render_screenshot — pretend the client AI looked at the screenshot and chose these.
  const args = {
    image: inputImage,
    headline: "Make every shot pop",
    subheadline: "Polished App Store screenshots in seconds",
    mode: "2d",
    position_preset: "tilt-right",
    background_preset: "Synthwave Dusk",
    accent_color: "#ff2d78",
    text_color: "light",
    output_path: outputFile,
  };
  console.error(`[mcp-smoke] calling render_screenshot...`);
  const t0 = Date.now();
  const rs = await client.call("tools/call", {
    name: "render_screenshot",
    arguments: args,
  });
  const ms = Date.now() - t0;
  if (rs.error) {
    console.error("[mcp-smoke] error:", rs.error);
    process.exit(1);
  }
  const result = JSON.parse(rs.result.content[0].text);
  console.error(`[mcp-smoke] render done in ${ms}ms`);
  console.error(`[mcp-smoke] output: ${result.path}`);
  console.error(`[mcp-smoke] decisions: ${JSON.stringify(result.decisions)}`);

  client.close();
}

main().catch((e) => {
  console.error("[mcp-smoke] fatal:", e);
  process.exit(1);
});
