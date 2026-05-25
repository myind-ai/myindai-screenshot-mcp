import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { withConcurrentPages } from "../renderer/browser.js";
import { loadImage } from "../renderer/render.js";
import { MAX_IMAGE_BYTES } from "../config.js";
import { buildScene, sampleAt, type Keyframe, type SceneName } from "../video/scenes.js";
import { encodeFrames, ensureFfmpeg } from "../video/ffmpeg.js";

// Shared video schemas
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Reuse the same nested decision shape as render_screenshot, but everything is optional
// at the video tool level — these become the BASE decision for the scene.
const BaseDecisionSchema = z
  .object({
    headline: z.string().optional(),
    subheadline: z.string().optional(),
    mode: z.enum(["2d", "3d"]).optional(),
    position_preset: z
      .enum([
        "centered",
        "bleed-bottom",
        "bleed-top",
        "float-center",
        "tilt-left",
        "tilt-right",
        "perspective",
        "float-bottom",
      ])
      .optional(),
    background_preset: z.string().optional(),
    text_color: z.enum(["light", "dark"]).optional(),
    background: z.record(z.any()).optional(),
    screenshot: z.record(z.any()).optional(),
    text: z.record(z.any()).optional(),
  })
  .strict();

const KeyframeSchema = z.object({
  t: z.number().min(0).max(1),
  decision: z.record(z.any()),
});

export const VideoInputSchema = z.object({
  image: z.string().min(1),
  output_path: z.string().min(1, "output_path is required for video"),
  duration_seconds: z.number().min(0.5).max(60).default(3),
  fps: z.number().int().min(10).max(60).default(30),
  format: z.enum(["mp4", "gif", "webm"]).default("mp4"),
  scene: z
    .enum(["tilt-in", "rotate-360", "float", "fade-in", "zoom-in", "custom"])
    .default("tilt-in"),
  intensity: z.number().min(0.1).max(1.5).optional(),
  base: BaseDecisionSchema.optional(),
  custom_keyframes: z.array(KeyframeSchema).min(2).optional(),
  language: z.string().default("en"),
  output_device: z
    .enum(["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"])
    .optional(),
  // Speed/quality knob. Defaults to "preview" — renders at half the target fps
  // and lets the encoder duplicate frames to hit the target. For typical hero
  // scenes (tilt-in, float, fade) this is visually indistinguishable from
  // every-frame rendering at a fraction of the wall-clock.
  //   "draft"   — render at fps/3, parallelism=4 (fastest, fine for QA)
  //   "preview" — render at fps/2, parallelism=4 (default — good enough to ship)
  //   "final"   — render every frame, parallelism=2 (highest fidelity)
  quality: z.enum(["draft", "preview", "final"]).default("preview"),
  // Override parallelism explicitly (otherwise derived from quality).
  parallelism: z.number().int().min(1).max(8).optional(),
  // Enable ffmpeg `minterpolate` motion-estimated frame synthesis. Default
  // false — we just frame-duplicate to fill in. Only set true when the scene
  // has fast motion (rotate-360, custom pans) AND the user is OK with the
  // 5-10× extra encode time at 1320×2868.
  smooth_motion: z.boolean().default(false),
});

export type VideoInput = z.infer<typeof VideoInputSchema>;

interface VideoResult {
  path: string;
  format: "mp4" | "gif" | "webm";
  duration_seconds: number;
  fps: number;
  native_fps: number;
  total_frames: number;
  rendered_frames: number;
  parallelism: number;
  scene: string;
  quality: string;
  render_ms: number;
  encode_ms: number;
}

// Map quality knob → (fps divisor, page count). These were tuned on an M3 Mac
// rendering 30s tilt-in scenes: draft = ~3 min, preview = ~6 min, final = ~12 min.
const QUALITY_PROFILE: Record<string, { fpsDivisor: number; pages: number }> = {
  draft:   { fpsDivisor: 3, pages: 4 },
  preview: { fpsDivisor: 2, pages: 4 },
  final:   { fpsDivisor: 1, pages: 2 },
};

export async function renderVideo(input: VideoInput): Promise<VideoResult> {
  await ensureFfmpeg();

  const { dataUrl, buffer, name } = await loadImage(input.image);
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`
    );
  }

  const baseDecision = collapseBase(input.base);
  const targetFps = input.fps;
  const profile = QUALITY_PROFILE[input.quality];
  const nativeFps = Math.max(8, Math.round(targetFps / profile.fpsDivisor));
  const parallelism = Math.max(1, Math.min(input.parallelism ?? profile.pages, 8));
  const renderedFrames = Math.max(2, Math.round(input.duration_seconds * nativeFps));
  const totalFrames = Math.round(input.duration_seconds * targetFps);

  // Build keyframes
  let keyframes: Keyframe[];
  if (input.scene === "custom") {
    if (!input.custom_keyframes || input.custom_keyframes.length < 2) {
      throw new Error("scene='custom' requires custom_keyframes with at least 2 entries");
    }
    keyframes = input.custom_keyframes.slice().sort((a, b) => a.t - b.t);
  } else {
    keyframes = buildScene(input.scene as SceneName, baseDecision, {
      intensity: input.intensity,
    });
  }

  const absOut = path.isAbsolute(input.output_path)
    ? input.output_path
    : path.resolve(process.cwd(), input.output_path);
  await fs.mkdir(path.dirname(absOut), { recursive: true });

  // Pre-compute every frame's decision so each worker page gets a fixed slice.
  const decisions: Record<string, any>[] = [];
  for (let i = 0; i < renderedFrames; i++) {
    const t = i / (renderedFrames - 1);
    decisions.push(sampleAt(keyframes, t));
  }

  const renderStart = Date.now();
  let encodeMs = 0;

  // Render every frame's JPEG using parallelism worker pages, then yield in
  // order to the encoder. JPEG instead of PNG — ~5-10× smaller payload across
  // the Playwright IPC boundary, with no observable quality loss after ffmpeg
  // re-encodes. Workers each hold their own warm page; the keyframe spec is
  // serialized per-frame but the input image and base style live on the page.
  const frameBuffers = new Array<Buffer | null>(renderedFrames).fill(null);

  await withConcurrentPages(parallelism, async (pages) => {
    // Each page needs the input image + base decision applied once, then
    // applyFrameSpec is cheap per frame.
    await Promise.all(
      pages.map((p) =>
        p.evaluate(
          async (spec: any) => {
            const mcp = (window as any).__mcp;
            await mcp.ready;
            await mcp.applySpec(spec);
          },
          {
            dataUrl,
            name,
            language: input.language,
            outputDevice: input.output_device,
            decision: baseDecision,
          } as any
        )
      )
    );

    // Round-robin work queue: each worker pulls the next index until exhausted.
    let nextIndex = 0;
    async function worker(p: (typeof pages)[number]) {
      while (true) {
        const i = nextIndex++;
        if (i >= renderedFrames) return;
        const decision = decisions[i];
        const jpegB64 = await p.evaluate(async (d: any) => {
          const mcp = (window as any).__mcp;
          await mcp.applyFrameSpec({ decision: d });
          // exportCanvasAsJpeg is in app.js — falls back to PNG if absent.
          if (typeof mcp.exportCanvasAsJpeg === "function") {
            return mcp.exportCanvasAsJpeg(0.92) as string;
          }
          return mcp.exportCanvasAsPng() as string;
        }, decision);
        frameBuffers[i] = Buffer.from(jpegB64, "base64");
      }
    }
    await Promise.all(pages.map((p) => worker(p)));
  });

  // Stream the in-order frames to ffmpeg. ffmpeg's minterpolate filter (set by
  // encodeFrames when nativeFps < targetFps) synthesizes the missing frames
  // with motion estimation, producing smoother motion than naive duplication.
  async function* frameGenerator() {
    for (let i = 0; i < renderedFrames; i++) {
      const buf = frameBuffers[i];
      if (!buf) throw new Error(`frame ${i} missing — render failed`);
      yield buf;
    }
  }

  const encStart = Date.now();
  await encodeFrames(frameGenerator(), {
    outputPath: absOut,
    format: input.format,
    fps: targetFps,
    nativeFps,
    smoothMotion: input.smooth_motion,
    width: 1320,
    height: 2868,
    inputFormat: "jpeg",
  });
  encodeMs = Date.now() - encStart;
  const renderMs = Date.now() - renderStart;

  return {
    path: absOut,
    format: input.format,
    duration_seconds: input.duration_seconds,
    fps: targetFps,
    native_fps: nativeFps,
    total_frames: totalFrames,
    rendered_frames: renderedFrames,
    parallelism,
    scene: input.scene,
    quality: input.quality,
    render_ms: renderMs,
    encode_ms: encodeMs,
  };
}

// Collapse high-level fields (headline, position_preset, background_preset, text_color)
// into the nested decision shape that applySpec expects.
function collapseBase(base?: Record<string, any>): Record<string, any> {
  const b = base || {};
  return {
    headline: b.headline,
    subheadline: b.subheadline,
    mode: b.mode,
    positionPreset: b.position_preset,
    backgroundPreset: b.background_preset,
    textColor: b.text_color,
    background: b.background,
    screenshot: b.screenshot,
    text: b.text,
  };
}
