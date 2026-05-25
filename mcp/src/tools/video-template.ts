import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { renderVideoConcept } from "./video-concept.js";
import { concatWithXfade } from "../video/ffmpeg.js";
import {
  buildTemplate,
  templateExists,
  listVideoTemplates as listSpecTemplates,
  type TemplateCtx,
  type TemplateMetadata,
} from "../video/templates.js";
import { REPO_ROOT } from "../config.js";

export const RenderVideoTemplateInputSchema = z.object({
  template: z.string().min(1),
  images: z.array(z.string().min(1)).min(1),
  output_path: z.string().min(1),
  app_name: z.string().optional(),
  headlines: z.array(z.string()).optional(),
  subheadlines: z.array(z.string()).optional(),
  fps: z.number().int().min(10).max(60).optional(),
  output_device: z
    .enum(["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"])
    .default("iphone-6.9"),
  language: z.string().default("en"),
  // Look-and-feel overrides (optional — templates have sensible defaults).
  gradient: z.string().optional(),
  accent: z.string().optional(),
  font: z.string().optional(),
  mode: z.enum(["2d", "3d"]).optional(),
  quality: z.enum(["draft", "preview", "final"]).default("preview").optional(),
  parallelism: z.number().int().min(1).max(8).optional(),
  smooth_motion: z.boolean().default(false).optional(),
});

export type RenderVideoTemplateInput = z.infer<typeof RenderVideoTemplateInputSchema>;

export interface RenderVideoTemplateResult {
  path: string;
  template: string;
  clips: number;
  total_duration_seconds: number;
  fps: number;
  render_ms: number;
}

export function listVideoTemplates(): TemplateMetadata[] {
  return listSpecTemplates();
}

export async function renderVideoTemplate(input: RenderVideoTemplateInput): Promise<RenderVideoTemplateResult> {
  if (!templateExists(input.template)) {
    const all = listSpecTemplates()
      .map((t) => t.slug)
      .join(", ");
    throw new Error(`unknown template "${input.template}". Known: ${all}`);
  }

  // Resolve image paths to absolute up-front so renderVideoConcept's loadImage works.
  const shots = input.images.map((p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)));
  for (const s of shots) {
    try {
      await fs.access(s);
    } catch {
      throw new Error(`image not found: ${s}`);
    }
  }

  const ctx: TemplateCtx = {
    shots,
    headlines: input.headlines || [],
    subheadlines: input.subheadlines || [],
    appName: input.app_name,
    fps: input.fps ?? 30,
    mode: input.mode ?? "3d",
    device3D: "iphone",
    fontOverride: input.font,
    gradientOverride: input.gradient,
    accentOverride: input.accent,
  };

  const built = buildTemplate(input.template, ctx);
  const fps = input.fps ?? 30;

  // Render each clip to a temp file, then ffmpeg-xfade-concat into the final output.
  const absOut = path.isAbsolute(input.output_path)
    ? input.output_path
    : path.resolve(process.cwd(), input.output_path);
  await fs.mkdir(path.dirname(absOut), { recursive: true });

  const clipsDir = path.join(REPO_ROOT, "appscreen-output", "_video-template-clips");
  await fs.mkdir(clipsDir, { recursive: true });

  const t0 = Date.now();
  const clipPaths: string[] = [];
  let totalDuration = 0;

  for (let i = 0; i < built.clips.length; i++) {
    const plan = built.clips[i];
    const clipOut = path.join(clipsDir, `clip-${Date.now()}-${i}.mp4`);
    const result = await renderVideoConcept({
      image: plan.image,
      output_path: clipOut,
      fps,
      format: "mp4",
      language: input.language,
      output_device: input.output_device,
      concept: plan.concept,
      quality: input.quality ?? "preview",
      parallelism: input.parallelism,
      smooth_motion: input.smooth_motion ?? false,
    });
    clipPaths.push(clipOut);
    totalDuration += result.total_duration_seconds;
  }

  await concatWithXfade(clipPaths, absOut, built.xfadeSec);

  // Cleanup temp clips on success.
  for (const c of clipPaths) await fs.unlink(c).catch(() => {});

  // Total reported duration accounts for xfade overlap shrinkage.
  const overlap = (built.clips.length - 1) * built.xfadeSec;
  const finalDuration = Math.max(0, totalDuration - overlap);

  return {
    path: absOut,
    template: input.template,
    clips: built.clips.length,
    total_duration_seconds: Math.round(finalDuration * 100) / 100,
    fps,
    render_ms: Date.now() - t0,
  };
}
