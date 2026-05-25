#!/usr/bin/env node
// Benchmark the video pipeline at all three quality settings.
// Renders a 30-sec tilt-in scene and reports wall-clock per quality tier.
//
// Usage:
//   tsx scripts/v0.5-video-bench.ts [duration] [outputDir]
// Default duration is 6s for the smoke (set to 30 for the full bench).

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const duration = Number(process.argv[2] ?? "6");
const outDir = process.argv[3] ?? path.join(REPO_ROOT, "appscreen-output", "v0.5-video-bench");

const inputImage = path.join(REPO_ROOT, "img", "kaabil_screenshot", "01_practice_home_streak_skills.png");

await fs.mkdir(outDir, { recursive: true });

const { renderVideo } = await import("../dist/tools/video.js");

const results: Array<{ quality: string; wall_ms: number; result: any }> = [];

for (const quality of ["draft", "preview", "final"] as const) {
  console.error(`\n[bench] starting quality=${quality} duration=${duration}s ...`);
  const t0 = Date.now();
  const r = await renderVideo({
    image: inputImage,
    output_path: path.join(outDir, `tilt-${quality}-${duration}s.mp4`),
    duration_seconds: duration,
    fps: 30,
    format: "mp4" as const,
    scene: "tilt-in" as const,
    quality,
    language: "en",
  });
  const wallMs = Date.now() - t0;
  console.error(
    `[bench] quality=${quality} wall=${(wallMs / 1000).toFixed(1)}s rendered=${r.rendered_frames} target=${r.total_frames} parallel=${r.parallelism} encode=${r.encode_ms}ms → ${r.path}`
  );
  results.push({ quality, wall_ms: wallMs, result: r });
}

console.error(`\n==== summary (${duration}s @ 30fps target) ====`);
for (const r of results) {
  const speedup = (duration * 1000) / r.wall_ms; // wall-clock vs real-time
  console.error(
    `  ${r.quality.padEnd(8)} ${(r.wall_ms / 1000).toFixed(1)}s wall  (${speedup.toFixed(2)}× real-time)  rendered ${r.result.rendered_frames}/${r.result.total_frames} frames @ parallel=${r.result.parallelism}`
  );
}

process.exit(0);
