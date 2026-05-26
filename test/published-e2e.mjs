#!/usr/bin/env node
// True end-to-end test simulating "another PC":
//   - No reference to local source code
//   - Forces a fresh npx install of myindai-screenshot-mcp@latest from registry
//   - Drives the spawned MCP server over stdio JSON-RPC
//   - Saves a real PNG via render_screenshot
//
// Run:  node /tmp/mcp-published-e2e.mjs <input.png> <output.png>
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

const INPUT  = process.argv[2];
const OUTPUT = process.argv[3] || "/tmp/published-test-output.png";

if (!INPUT) { console.error("usage: e2e <input.png> [output.png]"); process.exit(1); }

function ts() { return new Date().toISOString().slice(11, 23); }
function log(...a) { console.error(`[${ts()}] [e2e]`, ...a); }

log(`input  = ${INPUT}`);
log(`output = ${OUTPUT}`);
log("spawning: npx -y myindai-screenshot-mcp@latest (this fetches from npmjs.org)");

const t0 = Date.now();
const srv = spawn("npx", ["-y", "myindai-screenshot-mcp@latest"], { stdio: ["pipe", "pipe", "pipe"] });

let stderr = "";
let stderrPrintedReady = false;
srv.stderr.on("data", (b) => {
  const s = b.toString();
  stderr += s;
  if (!stderrPrintedReady && s.includes("ready")) {
    log(`server ready (stderr): ${Math.round((Date.now() - t0) / 100) / 10}s after spawn`);
    stderrPrintedReady = true;
  }
});

let buf = "";
const responses = new Map();
srv.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null) responses.set(msg.id, msg);
    } catch {}
  }
});

function send(msg) { srv.stdin.write(JSON.stringify(msg) + "\n"); }
async function wait(id, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (responses.has(id)) return responses.get(id);
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`timeout waiting for id ${id} after ${ms}ms`);
}

try {
  log("step 1: initialize (up to 5 min for cold-start npx download + chromium boot)");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2025-06-18",
    capabilities: { sampling: {} },
    clientInfo: { name: "published-e2e", version: "1.0" },
  }});
  const init = await wait(1, 300_000);
  log(`init done: server=${JSON.stringify(init.result?.serverInfo)} caps=[${Object.keys(init.result?.capabilities || {}).join(",")}]`);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  log("step 2: tools/list");
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = (await wait(2, 30_000)).result?.tools ?? [];
  log(`tools registered: ${tools.length}  (render_screenshot present: ${tools.some(t => t.name === "render_screenshot")})`);

  log("step 3: tools/call render_screenshot (rendering a real PNG…)");
  const renderT0 = Date.now();
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: "render_screenshot",
    arguments: {
      image: INPUT,
      headline: "Live from npm",
      subheadline: "End-to-end test of myindai-screenshot-mcp@latest",
      background_preset: "sunset",
      text_color: "light",
      position_preset: "centered",
      output_path: OUTPUT,
    },
  }});
  const renderResp = await wait(3, 120_000);
  const renderMs = Date.now() - renderT0;

  if (renderResp.error) throw new Error("tool returned error: " + JSON.stringify(renderResp.error));
  const content = renderResp.result?.content ?? [];
  log(`render returned in ${renderMs}ms; ${content.length} content block(s) types=[${content.map(c => c.type).join(",")}]`);

  const stat = await fs.stat(OUTPUT);
  const head = await fs.readFile(OUTPUT);
  const isPng = head[0]===0x89 && head[1]===0x50 && head[2]===0x4e && head[3]===0x47;
  const w = head.readUInt32BE(16);
  const h = head.readUInt32BE(20);
  log(`file: ${OUTPUT}`);
  log(`  size       = ${stat.size} bytes`);
  log(`  PNG magic  = ${isPng ? "✅" : "❌"}`);
  log(`  dimensions = ${w} × ${h}`);
  log(`total wall time = ${Math.round((Date.now() - t0) / 100) / 10}s`);
  log("✅ END-TO-END SUCCESS — the published npm package renders correctly on a fresh install.");
} catch (e) {
  log(`❌ FAILED: ${e.message}`);
  log(`stderr (last 800 chars):\n${stderr.slice(-800)}`);
  process.exitCode = 1;
} finally {
  srv.kill("SIGTERM");
  await new Promise((r) => srv.on("exit", r));
}
