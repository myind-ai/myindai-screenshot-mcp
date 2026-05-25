#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");
const repoRoot = path.resolve(__dirname, "..", "..");
const shotDir = path.join(repoRoot, "img", "kaabil_screenshot");
const outDir = path.join(repoRoot, "appscreen-output", "kaabil-final-video-v5");

interface JsonRpc {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

interface ShotPlan {
  image: string;
  out: string;
  scene: "zoom-in" | "tilt-in" | "float" | "fade-in";
  headline: string;
  subheadline: string;
}

function startServer() {
  const proc = spawn("node", [serverPath], {
    cwd: path.resolve(__dirname, ".."),
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
    let idx = -1;
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
      } catch {
        // ignore non-json logs
      }
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

async function writeStoryboard(shots: ShotPlan[], finalPath: string) {
  const lines: string[] = [];
  lines.push("# Kaabil AI — 60s Premium Cinematic Storyboard");
  lines.push("");
  lines.push("- Audience: Students + professionals");
  lines.push("- Tone: Premium cinematic");
  lines.push("- Duration: 60s (12 scenes x 5s)");
  lines.push(`- Output: \`${finalPath}\``);
  lines.push("");
  lines.push("| Scene | Screenshot | Headline | Subheadline |");
  lines.push("|---|---|---|---|");
  shots.forEach((s, idx) => {
    lines.push(`| ${idx + 1} | \`${path.basename(s.image)}\` | ${s.headline} | ${s.subheadline} |`);
  });
  lines.push("");
  lines.push("## CTA");
  lines.push("Download Kaabil AI");
  await fs.writeFile(path.join(outDir, "STORYBOARD.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const shots: ShotPlan[] = [
    {
      image: path.join(shotDir, "07_home_ats_scores_skill_match.png"),
      out: "01.mp4",
      scene: "tilt-in",
      headline: "Still missing interview calls?",
      subheadline: "Most resumes fail ATS before recruiters read them.",
    },
    {
      image: path.join(shotDir, "02_profile_cv_completeness_71pct.png"),
      out: "02.mp4",
      scene: "zoom-in",
      headline: "Build job-ready profiles faster",
      subheadline: "Create a complete resume baseline in minutes.",
    },
    {
      image: path.join(shotDir, "01_practice_home_streak_skills.png"),
      out: "03.mp4",
      scene: "float",
      headline: "Track growth every day",
      subheadline: "Streaks and skills keep your prep consistent.",
    },
    {
      image: path.join(shotDir, "03_paste_job_url_input.png"),
      out: "04.mp4",
      scene: "fade-in",
      headline: "Paste any job link",
      subheadline: "Kaabil AI reads role needs instantly.",
    },
    {
      image: path.join(shotDir, "04_new_application_5_input_methods.png"),
      out: "05.mp4",
      scene: "tilt-in",
      headline: "Import jobs 5 smart ways",
      subheadline: "From URL, text, PDF, screenshot, or manual entry.",
    },
    {
      image: path.join(shotDir, "07_home_ats_scores_skill_match.png"),
      out: "06.mp4",
      scene: "zoom-in",
      headline: "Match your skills to every role",
      subheadline: "Know gaps before you apply.",
    },
    {
      image: path.join(shotDir, "15_cover_letter_full_ai_generated.png"),
      out: "07.mp4",
      scene: "float",
      headline: "Generate ATS-friendly cover letters",
      subheadline: "Tailored to each job in one click.",
    },
    {
      image: path.join(shotDir, "08_practice_quiz_mcq_docker.png"),
      out: "08.mp4",
      scene: "fade-in",
      headline: "Practice role-specific quizzes",
      subheadline: "Prepare for skills companies actually test.",
    },
    {
      image: path.join(shotDir, "13_interview_prep_questions_star.png"),
      out: "09.mp4",
      scene: "tilt-in",
      headline: "Master interview answers",
      subheadline: "Use STAR questions to build confidence.",
    },
    {
      image: path.join(shotDir, "14_interview_prep_star_retailor_cta.png"),
      out: "10.mp4",
      scene: "zoom-in",
      headline: "Retailor with instant feedback",
      subheadline: "Refine answers for role and experience level.",
    },
    {
      image: path.join(shotDir, "17_email_templates_followup.png"),
      out: "11.mp4",
      scene: "float",
      headline: "Send smart LinkedIn and email follow-ups",
      subheadline: "Use proven templates after every application.",
    },
    {
      image: path.join(shotDir, "12_application_detail_overview.png"),
      out: "12.mp4",
      scene: "tilt-in",
      headline: "Download Kaabil AI",
      subheadline: "Resume. Apply. Practice. Get hired.",
    },
  ];

  for (const shot of shots) {
    await fs.access(shot.image);
  }

  const client = startServer();
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "kaabil-final-video-v5", version: "0.0.1" },
  });

  for (const shot of shots) {
    const outPath = path.join(outDir, shot.out);
    const r = await client.call("tools/call", {
      name: "render_video",
      arguments: {
        image: shot.image,
        output_path: outPath,
        duration_seconds: 5,
        fps: 30,
        format: "mp4",
        scene: shot.scene,
        intensity: 0.92,
        output_device: "iphone-6.9",
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
            headlineSize: 88,
            subheadlineSize: 34,
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

  const finalPath = path.join(outDir, "kaabil-final-video-v5.mp4");
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

  await writeStoryboard(shots, finalPath);
  console.error(`\n[kaabil-final-video-v5] Final video: ${finalPath}`);
}

main().catch((e) => {
  console.error("[kaabil-final-video-v5] fatal:", e);
  process.exit(1);
});
