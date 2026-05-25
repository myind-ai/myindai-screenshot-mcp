#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const serverPath = path.resolve(__dirname, "..", "dist", "server.js");
const outDir = path.join(repoRoot, "appscreen-output", "kaabil-final-video-v4");
const clipsDir = path.join(outDir, "clips");

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
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function main() {
  await fs.mkdir(clipsDir, { recursive: true });

  // Shared anchor pose keeps scene boundaries clean after concat.
  const anchor = { x: 50, y: 70, scale: 70, rotation3D: { x: -7, y: 12, z: -1 } };
  const sceneDurations = [5.0, 5.0, 4.0, 3.5, 2.5] as const;
  const sceneKeyframes = [
    // video_3_orbit_showcase / scene_1_orbit_in
    [
      { t: 0, decision: { screenshot: { x: 120, y: 82, scale: 22, rotation3D: { x: 30, y: -90, z: 0 } }, text: { subheadlineOpacity: 0 } } },
      { t: 0.3, decision: { screenshot: { x: 74, y: 74, scale: 46, rotation3D: { x: 18, y: -40, z: 0 } }, text: { subheadlineOpacity: 70 } } },
      { t: 0.7, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: 10, y: -15, z: 0 } }, text: { subheadlineOpacity: 100 } } },
      { t: 1, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: 10, y: -15, z: 0 } }, text: { subheadlineOpacity: 100 } } },
    ],
    // video_3_orbit_showcase / scene_2_slow_orbit
    [
      { t: 0, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: 10, y: -15, z: 0 } }, text: { subheadlineOpacity: 100 } } },
      { t: 0.4, decision: { screenshot: { x: 52, y: 68, scale: 72, rotation3D: { x: 4, y: -4, z: 0 } }, text: { subheadlineOpacity: 100 } } },
      { t: 0.8, decision: { screenshot: { x: 48, y: 66, scale: 72, rotation3D: { x: -5, y: 15, z: 0 } }, text: { subheadlineOpacity: 90 } } },
      { t: 1, decision: { screenshot: { ...anchor }, text: { subheadlineOpacity: 100 } } },
    ],
    // video_3_orbit_showcase / scene_3_tilt_zoom
    [
      { t: 0, decision: { screenshot: { ...anchor }, text: { subheadlineOpacity: 100 } } },
      { t: 0.5, decision: { screenshot: { x: 50, y: 78, scale: 92, rotation3D: { x: 35, y: 0, z: 0 } }, text: { subheadlineOpacity: 92 } } },
      { t: 1, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: 5, y: -10, z: 0 } }, text: { subheadlineOpacity: 100 } } },
    ],
    // video_3_orbit_showcase / scene_4_triple_orbit (single-track approximation)
    [
      { t: 0, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: 5, y: -10, z: 0 } }, text: { subheadlineOpacity: 100 } } },
      { t: 0.3, decision: { screenshot: { x: 22, y: 70, scale: 48, rotation3D: { x: 8, y: 30, z: 0 } }, text: { subheadlineOpacity: 92 } } },
      { t: 0.6, decision: { screenshot: { x: 50, y: 64, scale: 58, rotation3D: { x: 3, y: 0, z: 0 } }, text: { subheadlineOpacity: 100 } } },
      { t: 0.85, decision: { screenshot: { x: 78, y: 70, scale: 48, rotation3D: { x: 8, y: -30, z: 0 } }, text: { subheadlineOpacity: 90 } } },
      { t: 1, decision: { screenshot: { ...anchor }, text: { subheadlineOpacity: 100 } } },
    ],
    // video_3_orbit_showcase / scene_5_converge_exit (single-track approximation)
    [
      { t: 0, decision: { screenshot: { ...anchor }, text: { subheadlineOpacity: 100 } } },
      { t: 0.45, decision: { screenshot: { x: 50, y: 68, scale: 28, rotation3D: { x: 0, y: 0, z: 0 } }, text: { subheadlineOpacity: 60 } } },
      { t: 0.7, decision: { screenshot: { x: 50, y: 64, scale: 12, rotation3D: { x: 0, y: 0, z: 0 } }, text: { subheadlineOpacity: 0 } } },
      { t: 1, decision: { screenshot: { x: 50, y: 70, scale: 70, rotation3D: { x: -7, y: 12, z: -1 } }, text: { subheadlineOpacity: 100 } } },
    ],
  ] as const;

  const shots = [
    ["07_home_ats_scores_skill_match.png", "3D Orbit Entry", "Phone spins in from side"],
    ["12_application_detail_overview.png", "Gentle Orbit", "Floating showcase with depth"],
    ["04_new_application_5_input_methods.png", "Dramatic Tilt + Zoom", "Highlight key creation flow"],
    ["11_application_detail_timeline_status.png", "Triple Orbit Flow", "Left center right depth pass"],
    ["17_email_templates_followup.png", "Converge + Reveal", "Devices merge into final CTA"],
  ] as const;

  const client = startServer();
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "kaabil-final-video-v4", version: "0.0.1" },
  });

  for (let i = 0; i < shots.length; i++) {
    const [file, headline, subheadline] = shots[i];
    const imagePath = path.join(repoRoot, "img", "kaabil_screenshot", file);
    const clipPath = path.join(clipsDir, `${String(i + 1).padStart(2, "0")}.mp4`);
    const r = await client.call("tools/call", {
      name: "render_video",
      arguments: {
        image: imagePath,
        output_path: clipPath,
        duration_seconds: sceneDurations[i],
        fps: 24,
        format: "mp4",
        scene: "custom",
        output_device: "iphone-6.9",
        base: {
          headline,
          subheadline,
          mode: "3d",
          text_color: "light",
          background: {
            type: "gradient",
            gradient: {
              angle: 145,
              stops: [
                { color: "#7A1146", position: 0 },
                { color: "#E53584", position: 58 },
                { color: "#F474B6", position: 100 },
              ],
            },
          },
          text: {
            position: "top",
            offsetY: 0,
            lineHeight: 102,
            font: "-apple-system, BlinkMacSystemFont, \"SF Pro Display\"",
            headlineSize: 80,
            subheadlineSize: 34,
            headlineWeight: "900",
            subheadlineWeight: "700",
            headlineColor: "#FFFFFF",
            subheadlineColor: "#FFE8F3",
            subheadlineOpacity: 100,
            headlineTextAlign: "center",
            headlineMaxWidthPct: 74,
          },
          screenshot: {
            use3D: true,
            device3D: "iphone",
            x: anchor.x,
            y: anchor.y,
            shadow: { enabled: true, color: "#4D1232", blur: 84, opacity: 34, x: 0, y: 30 },
            glow: { enabled: true, color: "#EE59A2", intensity: 48, size: 84 },
            decoration: { type: "none" },
          },
        },
        custom_keyframes: sceneKeyframes[i],
      },
    });
    if (r.result?.isError) {
      throw new Error(r.result.content?.[0]?.text || `render failed for ${file}`);
    }
  }
  client.close();

  const concatPath = path.join(clipsDir, "concat.txt");
  await fs.writeFile(
    concatPath,
    shots.map((_, i) => `file '${path.join(clipsDir, `${String(i + 1).padStart(2, "0")}.mp4`)}'`).join("\n") + "\n",
    "utf8"
  );

  const finalPath = path.join(outDir, "kaabil-final-video-v4.mp4");
  await run(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", finalPath],
    repoRoot
  );

  console.error(`\n[kaabil-final-video-v4] Final video: ${finalPath}`);
}

main().catch((e) => {
  console.error("[kaabil-final-video-v4] fatal:", e);
  process.exit(1);
});
