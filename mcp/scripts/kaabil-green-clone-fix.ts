#!/usr/bin/env node
// Re-render the kaabil-green-clone-set with corrected Tight-density params:
//   - subheadlineSize bumped from 46 -> 68 (no more footnote-sized subtitles)
//   - screenshot.y bumped from 56 -> 80 (phone sits close to the text, not floating mid-canvas)
//   - screenshot.scale bumped from ~76 -> ~94 (phone fills the bottom)
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

// Shared green palette / typography across the 4-shot set.
const greenGradient = {
  angle: 165,
  stops: [
    { color: "#10b981", position: 0 },
    { color: "#059669", position: 50 },
    { color: "#047857", position: 100 },
  ],
};
const ACCENT = "#fde047";    // bright yellow used for highlight pill / glow

const SHOTS = [
  {
    file: "01_practice_home_streak_skills.png",
    out: "01-smarter-way.png",
    headline: "The Smarter Way to Land Jobs",
    highlight: "Smarter",
    subheadline: "Track ATS score and improve daily",
  },
  {
    file: "04_new_application_5_input_methods.png",
    out: "02-create-applications.png",
    headline: "Create Applications in Seconds",
    highlight: "Seconds",
    subheadline: "Five fast ways to add a new role",
  },
  {
    file: "13_interview_prep_questions_star.png",
    out: "03-smart-prep.png",
    headline: "Smart Interview Prep",
    highlight: "Smart",
    subheadline: "Practice STAR answers that recruiters love",
  },
  {
    file: "17_email_templates_followup.png",
    out: "04-grow-offer-chances.png",
    headline: "Grow Your Offer Chances",
    highlight: "Grow",
    subheadline: "Send polished follow-ups fast",
  },
];

async function main() {
  const inputDir = "/Users/shantanubombatkar/Documents/GitHub/appscreen/kaabil_screenshot";
  const outDir = "/Users/shantanubombatkar/Documents/GitHub/appscreen/appscreen-output/kaabil-green-clone-set";

  const c = start();
  await c.call("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "kaabil-green-clone-fix", version: "0.0.1" },
  });

  for (const shot of SHOTS) {
    const inputPath = path.join(inputDir, shot.file);
    const outPath = path.join(outDir, shot.out);

    const result = await callTool(c, "render_screenshot", {
      image: inputPath,
      output_path: outPath,
      text_color: "light",
      background: { type: "gradient", gradient: greenGradient },
      screenshot: {
        // Tight density — phone hugs the canvas bottom, text fills the top.
        // scale must stay ≤ 78 so the renderer's moveY headroom can pull the
        // phone all the way down (high-scale phones can't move below center).
        scale: 72,
        x: 50,
        y: 100,
        glow: { enabled: true, color: ACCENT, intensity: 35, size: 70 },
        shadow: { enabled: true, color: "#022c22", blur: 90, opacity: 45, y: 35 },
      },
      text: {
        headline: shot.headline,
        subheadline: shot.subheadline,
        position: "top",
        offsetY: 6,
        font: "Manrope",
        // Headline
        headlineWeight: "900",
        headlineSize: 140,
        headlineLetterSpacing: -2,
        headlineMaxWidthPct: 80,
        lineHeight: 100,
        // Highlight word in yellow pill
        headlineHighlightWord: shot.highlight,
        headlineHighlightStyle: "pill",
        headlineHighlightColor: ACCENT,
        headlineHighlightPillTextColor: "#022c22",
        // Subheadline — properly sized (was 46, now 64)
        headlineToSubheadlineGap: 28,
        subheadlineSize: 64,
        subheadlineWeight: "600",
        subheadlineOpacity: 92,
        subheadlineMaxWidthPct: 86,
      },
    }, shot.out);

    console.error(`[done] ${result.path}`);
  }

  c.close();
  console.error("[kaabil-green-clone-fix] all 4 shots re-rendered");
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
