#!/usr/bin/env node
// Confirm every issue fix is live on npmjs.org. Spawns the published package
// via `npx -y myindai-screenshot-mcp@latest`, exercises the public MCP
// surface, asserts each fix landed.
//
// Run:  node /tmp/confirm-all-fixes.mjs <input.png>
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

const INPUT = process.argv[2];
if (!INPUT) { console.error("usage: confirm-all-fixes <input.png>"); process.exit(1); }

function ts() { return new Date().toISOString().slice(11, 23); }
function log(...a) { console.error(`[${ts()}]`, ...a); }

async function pixelAt(buf, x, y) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const off = (y * info.width + x) * info.channels;
  return [data[off], data[off + 1], data[off + 2]];
}

log("spawning npx -y myindai-screenshot-mcp@latest …");
const srv = spawn("npx", ["-y", "myindai-screenshot-mcp@latest"], { stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
srv.stderr.on("data", (b) => (stderr += b.toString()));

let buf = "";
const responses = new Map();
srv.stdout.on("data", (c) => {
  buf += c.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try { const m = JSON.parse(line); if (m.id != null) responses.set(m.id, m); } catch {}
  }
});

function send(m) { srv.stdin.write(JSON.stringify(m) + "\n"); }
async function wait(id, ms = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (responses.has(id)) return responses.get(id);
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`timeout id=${id}`);
}

let nextId = 1;
async function call(name, args, timeout = 120000) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const resp = await wait(id, timeout);
  if (resp.error) throw new Error(`${name}: ${resp.error.message}`);
  return resp.result;
}

const failures = [];
function check(cond, label, info) {
  if (cond) log(`  ✅ ${label}` + (info ? `  (${info})` : ""));
  else { log(`  ❌ ${label}` + (info ? `  (${info})` : "")); failures.push(label); }
}

try {
  // initialize
  send({ jsonrpc: "2.0", id: nextId++, method: "initialize", params: {
    protocolVersion: "2025-06-18",
    capabilities: { sampling: {} },
    clientInfo: { name: "confirm", version: "1.0" },
  }});
  const init = await wait(1, 300000);
  log(`server: ${JSON.stringify(init.result.serverInfo)}`);
  check(init.result.serverInfo.version === "1.0.0-rc.6", "server reports v1.0.0-rc.6");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  // ─── #1 + #9 (rc.5): a gradient renders, an object background renders.
  log("── #1 #9: gradient preset + rich background object render ──");
  for (const [label, args] of [
    ["#1 backgroundPreset path",
      { image: INPUT, headline: "X", background_preset: "violet", output_path: "/tmp/c1.png" }],
    ["#9 rich background object path",
      { image: INPUT, headline: "X", background: { type: "gradient", gradient: { angle: 135, stops: [
        { color: "#ec4899", position: 0 }, { color: "#7c3aed", position: 100 }] } }, output_path: "/tmp/c9.png" }],
  ]) {
    const result = await call("render_screenshot", args);
    const path = result.content?.[0]?.text?.match(/wrote\s+(\S+)/)?.[1] || args.output_path;
    const png = await fs.readFile(path);
    const [r, g, b] = await pixelAt(png, 10, 10);
    check(!(r === 255 && g === 255 && b === 255), label, `top-left=(${r},${g},${b})`);
  }

  // ─── #2: omit background → template default applies (not white).
  log("── #2: omit optional → template default ──");
  {
    const result = await call("render_screenshot", { image: INPUT, headline: "Defaults", output_path: "/tmp/c2.png" });
    const png = await fs.readFile("/tmp/c2.png");
    const [r, g, b] = await pixelAt(png, 10, 10);
    check(!(r === 255 && g === 255 && b === 255), "#2 default background applies", `top-left=(${r},${g},${b})`);
  }

  // ─── #3: mode: "3d" returns explicit warning.
  log("── #3: 3D request returns warning ──");
  {
    const result = await call("render_screenshot", { image: INPUT, headline: "3D", mode: "3d", output_path: "/tmp/c3.png" });
    const responseText = JSON.stringify(result);
    check(/warning/i.test(responseText) && /3d|placeholder|webgl/i.test(responseText),
      "#3 response contains 3D warning",
      `warning detected: ${/warning/i.test(responseText)}`);
  }

  // ─── #4: screenshot.scale/x/y produces different layout.
  log("── #4: screenshot overrides applied ──");
  {
    await call("render_screenshot", { image: INPUT, headline: "A", background_preset: "ocean", output_path: "/tmp/c4-default.png" });
    await call("render_screenshot", { image: INPUT, headline: "B", background_preset: "ocean",
      screenshot: { scale: 60, x: 80, y: 50 }, output_path: "/tmp/c4-shifted.png" });
    const a = await fs.readFile("/tmp/c4-default.png");
    const b = await fs.readFile("/tmp/c4-shifted.png");
    const [r1] = await pixelAt(a, 200, 1000);
    const [r2] = await pixelAt(b, 200, 1000);
    check(r1 !== r2, "#4 screenshot.{scale,x,y} changes layout", `pixel.r before=${r1} after=${r2}`);
  }

  // ─── #5: text.headlineColor produces red glyphs.
  log("── #5: text overrides applied ──");
  {
    await call("render_screenshot", { image: INPUT, headline: "RED RED RED RED",
      background_preset: "ocean", text: { headlineSize: 140, headlineColor: "#ff0000", headlineWeight: "900" },
      output_path: "/tmp/c5.png" });
    const png = await fs.readFile("/tmp/c5.png");
    let red = 0;
    for (let x = 80; x < 1210; x += 4) {
      for (let y = 80; y < 200; y += 4) {
        const [r, g, b] = await pixelAt(png, x, y);
        if (r > 180 && g < 100 && b < 100) { red++; break; }
      }
    }
    check(red > 5, "#5 text.headlineColor honoured", `${red} red glyph pixels`);
  }

  // ─── #6: position_preset tilt-right vs center differ.
  log("── #6: position_preset tilt applied ──");
  {
    await call("render_screenshot", { image: INPUT, headline: "C", background_preset: "ocean", position_preset: "centered", output_path: "/tmp/c6-c.png" });
    await call("render_screenshot", { image: INPUT, headline: "T", background_preset: "ocean", position_preset: "tilt-right", output_path: "/tmp/c6-t.png" });
    const c = await fs.readFile("/tmp/c6-c.png");
    const t = await fs.readFile("/tmp/c6-t.png");
    let diff = 0;
    for (const [x, y] of [[200, 1000], [1090, 1000], [200, 1800], [1090, 1800]]) {
      const a = await pixelAt(c, x, y);
      const b = await pixelAt(t, x, y);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 50) diff++;
    }
    check(diff >= 1, "#6 tilt-right differs from centered", `${diff}/4 pixels differ`);
  }

  // ─── #7: text_color "light" → light glyphs on dark bg.
  log("── #7: text_color semantics correct ──");
  {
    await call("render_screenshot", { image: INPUT, headline: "WIDE WHITE TEXT", background_preset: "violet", text_color: "light", output_path: "/tmp/c7.png" });
    const png = await fs.readFile("/tmp/c7.png");
    let bright = 0;
    for (let x = 80; x < 1210; x += 6) {
      const [r, g, b] = await pixelAt(png, x, 130);
      if ((r + g + b) / 3 > 200) bright++;
    }
    check(bright > 10, "#7 light text on dark bg", `${bright} bright pixels`);
  }

  // ─── #8: AI tool without API key returns warning.
  log("── #8: generate_screenshot AI warning when no key ──");
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await call("generate_screenshot", { image: INPUT, app_name: "TestApp", hints: "vibrant", output_path: "/tmp/c8.png" }, 60000);
      const responseText = JSON.stringify(result);
      check(/warning/i.test(responseText) && /(api[_ ]?key|sampling|deterministic|ai)/i.test(responseText),
        "#8 response contains AI-unavailable warning",
        `warning detected: ${/warning/i.test(responseText)}`);
    } catch (e) {
      check(false, `#8 generate_screenshot crashed: ${e.message.slice(0, 100)}`);
    }
  } else {
    log("  ⊘ skipping #8 (ANTHROPIC_API_KEY is set in env)");
  }

  // ─── #10: each advertised device renders.
  log("── #10: all advertised devices render ──");
  for (const device of ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"]) {
    try {
      await call("render_screenshot", { image: INPUT, headline: device, background_preset: "ocean",
        output_device: device, output_path: `/tmp/c10-${device}.png` });
      const png = await fs.readFile(`/tmp/c10-${device}.png`);
      check(png.length > 100000, `#10 ${device}`, `${png.length} bytes`);
    } catch (e) {
      check(false, `#10 ${device} threw: ${e.message.slice(0, 80)}`);
    }
  }

  log("");
  if (failures.length === 0) {
    log("✅ ALL FIXES CONFIRMED LIVE ON npmjs.org via myindai-screenshot-mcp@latest");
  } else {
    log(`❌ ${failures.length} check(s) failed:`);
    for (const f of failures) log(`   - ${f}`);
    process.exitCode = 1;
  }
} catch (e) {
  log(`❌ FAILED: ${e.message}`);
  log(`stderr last 500 chars:\n${stderr.slice(-500)}`);
  process.exitCode = 1;
} finally {
  srv.kill("SIGTERM");
  await new Promise((r) => srv.on("exit", r));
}
