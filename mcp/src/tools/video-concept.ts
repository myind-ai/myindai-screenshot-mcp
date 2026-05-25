import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { withConcurrentPages } from "../renderer/browser.js";
import { loadImage } from "../renderer/render.js";
import { MAX_IMAGE_BYTES } from "../config.js";
import { encodeFrames, ensureFfmpeg } from "../video/ffmpeg.js";
import { planFrames, type Concept } from "../video/concept.js";

// One keyframe inside an act's motion track.
const KeyframeSchema = z.object({
  t: z.number().min(0).max(1),
  decision: z.record(z.any()),
});

const ActTextSchema = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  fade_in: z.number().min(0).max(1).optional(),
  hold: z.number().min(0).max(1).optional(),
  fade_out: z.number().min(0).max(1).optional(),
});

const ActSchema = z.object({
  name: z.string().optional(),
  duration: z.number().min(0.2).max(15),
  motion: z.array(KeyframeSchema).min(1),
  text: ActTextSchema.optional(),
  transition: z
    .object({
      kind: z.enum(["cut", "crossfade"]),
      duration: z.number().min(0.05).max(2).optional(),
    })
    .optional(),
});

const ConceptSchema = z.object({
  base: z.record(z.any()).optional(),
  acts: z.array(ActSchema).min(1).max(8),
});

export const VideoConceptInputSchema = z.object({
  image: z.string().min(1),
  output_path: z.string().min(1),
  fps: z.number().int().min(10).max(60).default(30),
  format: z.enum(["mp4", "gif", "webm"]).default("mp4"),
  language: z.string().default("en"),
  output_device: z
    .enum(["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"])
    .optional(),
  concept: ConceptSchema,
  // Speed knob — render at target_fps / fpsDivisor and let ffmpeg minterpolate
  // back to target_fps. "preview" cuts wall-clock by ~3-4× with no visible loss.
  quality: z.enum(["draft", "preview", "final"]).default("preview").optional(),
  parallelism: z.number().int().min(1).max(8).optional(),
  smooth_motion: z.boolean().default(false).optional(),
});

export type VideoConceptInput = z.infer<typeof VideoConceptInputSchema>;

export interface VideoConceptResult {
  path: string;
  format: "mp4" | "gif" | "webm";
  fps: number;
  native_fps: number;
  total_frames: number;
  rendered_frames: number;
  parallelism: number;
  total_duration_seconds: number;
  acts: Array<{ name?: string; duration: number }>;
  render_ms: number;
}

const QUALITY_PROFILE: Record<string, { fpsDivisor: number; pages: number }> = {
  draft:   { fpsDivisor: 3, pages: 4 },
  preview: { fpsDivisor: 2, pages: 4 },
  final:   { fpsDivisor: 1, pages: 2 },
};

export async function renderVideoConcept(input: VideoConceptInput): Promise<VideoConceptResult> {
  await ensureFfmpeg();

  const { dataUrl, buffer, name } = await loadImage(input.image);
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
  }

  const concept: Concept = input.concept;
  const totalDuration = concept.acts.reduce((s, a) => s + a.duration, 0);
  const targetFps = input.fps;
  const profile = QUALITY_PROFILE[input.quality ?? "preview"];
  const nativeFps = Math.max(8, Math.round(targetFps / profile.fpsDivisor));
  const parallelism = Math.max(1, Math.min(input.parallelism ?? profile.pages, 8));

  // planFrames takes a fps — give it nativeFps so we render fewer real frames
  // and let ffmpeg minterpolate up to targetFps.
  const frames = planFrames(concept, nativeFps);

  const absOut = path.isAbsolute(input.output_path)
    ? input.output_path
    : path.resolve(process.cwd(), input.output_path);
  await fs.mkdir(path.dirname(absOut), { recursive: true });

  const t0 = Date.now();
  const frameBuffers = new Array<Buffer | null>(frames.length).fill(null);

  await withConcurrentPages(parallelism, async (pages) => {
    await Promise.all(
      pages.map((p) =>
        p.evaluate(
          async (initSpec: any) => {
            const mcp = (window as any).__mcp;
            await mcp.ready;
            await mcp.applySpec(initSpec);
          },
          {
            dataUrl,
            name,
            language: input.language,
            outputDevice: input.output_device,
            decision: concept.base || {},
          } as any
        )
      )
    );

    let nextIndex = 0;
    async function worker(p: (typeof pages)[number]) {
      while (true) {
        const i = nextIndex++;
        if (i >= frames.length) return;
        const jpegB64 = await p.evaluate(async (d: any) => {
          const mcp = (window as any).__mcp;
          await mcp.applyFrameSpec({ decision: d });
          if (typeof mcp.exportCanvasAsJpeg === "function") {
            return mcp.exportCanvasAsJpeg(0.92) as string;
          }
          return mcp.exportCanvasAsPng() as string;
        }, frames[i].decision);
        frameBuffers[i] = Buffer.from(jpegB64, "base64");
      }
    }
    await Promise.all(pages.map((p) => worker(p)));
  });

  async function* frameGen() {
    for (let i = 0; i < frames.length; i++) {
      const buf = frameBuffers[i];
      if (!buf) throw new Error(`frame ${i} missing — render failed`);
      yield buf;
    }
  }

  await encodeFrames(frameGen(), {
    outputPath: absOut,
    format: input.format,
    fps: targetFps,
    nativeFps,
    smoothMotion: input.smooth_motion ?? false,
    width: 1320,
    height: 2868,
    inputFormat: "jpeg",
  });

  return {
    path: absOut,
    format: input.format,
    fps: targetFps,
    native_fps: nativeFps,
    total_frames: Math.round(totalDuration * targetFps),
    rendered_frames: frames.length,
    parallelism,
    total_duration_seconds: totalDuration,
    acts: concept.acts.map((a) => ({ name: a.name, duration: a.duration })),
    render_ms: Date.now() - t0,
  };
}
