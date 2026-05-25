import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { autoPick } from "../ai/auto-template-pick.js";
import { renderVideoTemplate } from "./video-template.js";

/**
 * One-shot product video tool.
 *
 *   { prompt: "premium fintech, calm and trustworthy", images: [...] }
 *      → Claude (or keyword fallback) picks template + writes headlines
 *      → renders mp4
 *      → returns { path, template_chosen, reasoning, ... }
 *
 * The user does NOT have to know template names. They give a one-line vibe and
 * the screenshots; the tool does template selection, headline writing, and
 * rendering in a single MCP call.
 */
export const AutoVideoInputSchema = z.object({
  images: z.array(z.string().min(1)).min(1),
  output_path: z.string().min(1),
  prompt: z
    .string()
    .max(400)
    .optional()
    .describe(
      "One-line vibe / brand brief, e.g. 'premium fintech, calm and trustworthy' or 'energetic gaming app'. Optional — if omitted, the picker chooses based on screenshot count."
    ),
  app_name: z.string().optional(),
  template: z
    .string()
    .optional()
    .describe(
      "If the user already named a template (e.g. 'gravity-drop'), pass it here to skip auto-picking. Headlines are still auto-written."
    ),
  fps: z.number().int().min(10).max(60).optional(),
  output_device: z
    .enum(["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"])
    .default("iphone-6.9"),
  language: z.string().default("en"),
  quality: z.enum(["draft", "preview", "final"]).default("preview").optional(),
  parallelism: z.number().int().min(1).max(8).optional(),
  smooth_motion: z.boolean().default(false).optional(),
});

export type AutoVideoInput = z.infer<typeof AutoVideoInputSchema>;

export interface AutoVideoResult {
  path: string;
  template_chosen: string;
  reasoning: string;
  headlines_used: string[];
  subheadlines_used?: string[];
  accent_used?: string;
  source: "user" | "llm" | "keyword" | "fallback";
  total_duration_seconds: number;
  fps: number;
  render_ms: number;
}

export async function autoVideo(input: AutoVideoInput): Promise<AutoVideoResult> {
  // Resolve absolute paths early so the picker can read them for vision.
  const shots = input.images.map((p) =>
    path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
  );
  for (const s of shots) {
    try {
      await fs.access(s);
    } catch {
      throw new Error(`image not found: ${s}`);
    }
  }

  const t0 = Date.now();

  // 1. Pick template + write headlines (LLM or fallback).
  const pick = await autoPick({
    prompt: input.prompt,
    appName: input.app_name,
    imagePaths: shots,
    preferredTemplate: input.template,
  });

  // 2. Render via the existing template tool.
  const rendered = await renderVideoTemplate({
    template: pick.template_slug,
    images: shots,
    output_path: input.output_path,
    app_name: input.app_name,
    headlines: pick.headlines,
    subheadlines: pick.subheadlines,
    fps: input.fps,
    output_device: input.output_device,
    language: input.language,
    accent: pick.accent,
    quality: input.quality ?? "preview",
    parallelism: input.parallelism,
    smooth_motion: input.smooth_motion ?? false,
  });

  return {
    path: rendered.path,
    template_chosen: pick.template_slug,
    reasoning: pick.reasoning,
    headlines_used: pick.headlines,
    subheadlines_used: pick.subheadlines,
    accent_used: pick.accent,
    source: pick.source,
    total_duration_seconds: rendered.total_duration_seconds,
    fps: rendered.fps,
    render_ms: Date.now() - t0,
  };
}
