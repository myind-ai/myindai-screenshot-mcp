import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { renderAsoSet, RenderAsoSetInputSchema, type RenderAsoSetResult } from "./aso-set.js";

// Multi-size export: render the same ASO set at every Apple-required device
// size in one call. Each size goes into its own subdirectory so uploads can
// hit ASC's per-size slots without manual organising.
//
// Apple's required canvas dimensions:
//   6.9" → 1320×2868 (aspect 9:19.55)
//   6.7" → 1290×2796 (aspect 9:19.5)
//   6.5" → 1284×2778 (aspect 9:19.5)
//   5.5" → 1242×2208 (aspect 9:16) — different aspect, must be re-rendered.
//
// We re-render per size rather than scaling because the 5.5" canvas is a
// different aspect ratio (16:9 vs ~19.5:9) so naive resizing distorts.

const ALL_DEVICES = ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"] as const;
type Device = (typeof ALL_DEVICES)[number];

// Re-export the benefits shape from RenderAsoSetInputSchema so callers don't
// need to redefine it; we extract sizes via input.sizes.

export const RenderMultiSizeInputSchema = RenderAsoSetInputSchema.omit({
  output_device: true,
  output_dir: true,
  showcase: true,
  showcase_caption: true,
}).extend({
  output_root: z.string().min(1, "output_root required (e.g. './screenshots/multi')"),
  sizes: z
    .array(z.enum(ALL_DEVICES))
    .min(1, "at least one size required")
    .default([...ALL_DEVICES] as unknown as Device[])
    .optional(),
  showcase: z.boolean().default(true).optional(),
  showcase_caption: z.string().optional(),
});

export type RenderMultiSizeInput = z.infer<typeof RenderMultiSizeInputSchema>;

export interface RenderMultiSizeResult {
  output_root: string;
  brand_color: string;
  per_size: Array<{
    device: Device;
    output_dir: string;
    set: RenderAsoSetResult;
  }>;
}

export async function renderMultiSize(input: RenderMultiSizeInput): Promise<RenderMultiSizeResult> {
  const sizes = (input.sizes ?? [...ALL_DEVICES]) as Device[];
  const root = path.isAbsolute(input.output_root)
    ? input.output_root
    : path.resolve(process.cwd(), input.output_root);
  await fs.mkdir(root, { recursive: true });

  // Resolve brand colour ONCE so every size uses the same hue. We do this by
  // letting the first render derive it (if not provided), then forwarding to
  // the rest.
  let brandColor = input.brand_color;
  let brandGradientTo = input.brand_gradient_to;

  const perSize: RenderMultiSizeResult["per_size"] = [];
  for (const device of sizes) {
    const subDir = path.join(root, device);
    await fs.mkdir(subDir, { recursive: true });

    const set = await renderAsoSet({
      ...input,
      brand_color: brandColor,
      brand_gradient_to: brandGradientTo,
      output_dir: subDir,
      output_device: device,
      showcase: input.showcase ?? true,
      showcase_caption: input.showcase_caption,
    });

    if (!brandColor) {
      brandColor = set.brand_color;
      // Subsequent sizes reuse the auto-derived colour for visual consistency.
    }

    perSize.push({ device, output_dir: subDir, set });
  }

  return {
    output_root: root,
    brand_color: brandColor!,
    per_size: perSize,
  };
}
