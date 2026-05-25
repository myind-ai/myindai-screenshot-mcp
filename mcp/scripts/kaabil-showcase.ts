#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");
const repoRoot = path.resolve(__dirname, "..", "..");
const kaabilDir = path.join(repoRoot, "kaabil_screenshot", "best", "6.7");
const outDir = path.join(repoRoot, "appscreen-output", "kaabil-video");

interface JsonRpc {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

function startServer() {
  const proc = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:${process.env.PATH || ""}`,
      ANTHROPIC_API_KEY: "",
    },
  });
  let buf = "";
  const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpc;
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg);
        }
      } catch {}
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
  return {
    call,
    close: () => {
      proc.stdin.end();
      proc.kill();
    },
  };
}

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ""}` },
    });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const shots = [
    {
      image: path.join(kaabilDir, "1_ats_scores_you_are_losing_interviews.png"),
      headline: "Beat ATS Filters",
      subheadline: "Know your score before every application",
      scene: "tilt-in",
      out: "01-ats.mp4",
    },
    {
      image: path.join(kaabilDir, "2_paste_any_jd_5_ways.png"),
      headline: "Paste Any Job URL",
      subheadline: "Import job descriptions in seconds",
      scene: "tilt-in",
      out: "02-jd-import.mp4",
    },
    {
      image: path.join(kaabilDir, "3_ai_cover_letter_generated.png"),
      headline: "Generate Tailored Letters",
      subheadline: "AI writes role-specific cover letters instantly",
      scene: "float",
      out: "03-cover-letter.mp4",
    },
    {
      image: path.join(kaabilDir, "4_interview_prep_star_stories.png"),
      headline: "Master STAR Stories",
      subheadline: "Get interview-ready with smart prep prompts",
      scene: "float",
      out: "04-interview-prep.mp4",
    },
    {
      image: path.join(kaabilDir, "5_practice_quiz_learn_daily.png"),
      headline: "Practice Daily Quizzes",
      subheadline: "Build confidence with role-focused practice",
      scene: "tilt-in",
      out: "05-quiz.mp4",
    },
    {
      image: path.join(kaabilDir, "6_email_templates_ready_to_send.png"),
      headline: "Use Ready Templates",
      subheadline: "Send follow-ups and salary emails with ease",
      scene: "zoom-in",
      out: "06-templates.mp4",
    },
  ] as const;

  const client = startServer();
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "kaabil-showcase", version: "0.0.1" },
  });

  for (const shot of shots) {
    const outPath = path.join(outDir, shot.out);
    const r = await client.call("tools/call", {
      name: "render_video",
      arguments: {
        image: shot.image,
        output_path: outPath,
        duration_seconds: 2.2,
        fps: 24,
        format: "mp4",
        scene: shot.scene,
        intensity: 0.9,
        output_device: "iphone-6.7",
        base: {
          headline: shot.headline,
          subheadline: shot.subheadline,
          mode: "3d",
          background_preset: "Pacific Sunset",
          text_color: "light",
          screenshot: {
            shadow: { enabled: true, color: "#3B0823", blur: 96, opacity: 38, x: 0, y: 36 },
          },
          text: {
            font: "Inter",
            headlineWeight: "900",
            subheadlineWeight: "600",
            headlineSize: 98,
            subheadlineSize: 38,
          },
        },
      },
    });
    if (r.result?.isError) {
      throw new Error(`render_video failed for ${shot.out}: ${r.result.content?.[0]?.text || "unknown error"}`);
    }
  }

  client.close();

  const concatFile = path.join(outDir, "concat.txt");
  const concatBody = shots.map((s) => `file '${path.join(outDir, s.out)}'`).join("\n");
  await fs.writeFile(concatFile, `${concatBody}\n`, "utf8");

  const finalPath = path.join(repoRoot, "appscreen-output", "kaabil-3d-production-showcase.mp4");
  await run(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFile,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      finalPath,
    ],
    repoRoot
  );

  console.error(`\n[kaabil-showcase] Final video: ${finalPath}`);
}

main().catch((e) => {
  console.error("[kaabil-showcase] fatal:", e);
  process.exit(1);
});
