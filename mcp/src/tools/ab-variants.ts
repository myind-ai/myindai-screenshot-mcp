import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { renderAsoSet, RenderAsoSetInputSchema, type RenderAsoSetResult } from "./aso-set.js";
import { makeShowcase } from "./showcase.js";

// A/B variant generator. Render the same ASO set in N brand-colour variants
// plus a contact-sheet so the user can eyeball which colour stops the scroll
// best for paid acquisition tests.

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Curated colour palette for variant sweeps — covers warm, cool, vivid,
// premium, and editorial buckets so the contact sheet shows real spread.
const DEFAULT_VARIANT_PALETTE: Array<{ hex: string; name: string }> = [
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#e94691", name: "Pink" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#16a34a", name: "Green" },
  { hex: "#0891b2", name: "Cyan" },
  { hex: "#1e3a8a", name: "Indigo" },
  { hex: "#dc2626", name: "Red" },
  { hex: "#0f172a", name: "Slate" },
];

export const RenderAbVariantsInputSchema = RenderAsoSetInputSchema.omit({
  brand_color: true,
  brand_gradient_to: true,
  output_dir: true,
  showcase: true,
  showcase_caption: true,
}).extend({
  output_root: z.string().min(1, "output_root required (e.g. './screenshots/variants')"),
  variants: z
    .array(z.object({ hex: HexColor, name: z.string().min(1) }))
    .min(1)
    .max(8)
    .optional()
    .describe("Optional override list. Default: 4 from the curated default palette."),
  variant_count: z
    .number()
    .int()
    .min(2)
    .max(8)
    .default(4)
    .optional()
    .describe("How many variants from the default palette. Ignored if `variants` is provided."),
  contact_sheet: z.boolean().default(true).optional(),
});

export type RenderAbVariantsInput = z.infer<typeof RenderAbVariantsInputSchema>;

export interface AbVariantEntry {
  variant_name: string;
  brand_color: string;
  output_dir: string;
  set: RenderAsoSetResult;
}

export interface RenderAbVariantsResult {
  output_root: string;
  variants: AbVariantEntry[];
  contact_sheet_path?: string;
}

export async function renderAbVariants(input: RenderAbVariantsInput): Promise<RenderAbVariantsResult> {
  const root = path.isAbsolute(input.output_root)
    ? input.output_root
    : path.resolve(process.cwd(), input.output_root);
  await fs.mkdir(root, { recursive: true });

  const palette =
    input.variants && input.variants.length > 0
      ? input.variants
      : DEFAULT_VARIANT_PALETTE.slice(0, input.variant_count ?? 4);

  const variants: AbVariantEntry[] = [];
  for (const v of palette) {
    const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "variant";
    const subDir = path.join(root, slug);
    await fs.mkdir(subDir, { recursive: true });

    const set = await renderAsoSet({
      ...input,
      brand_color: v.hex,
      output_dir: subDir,
      // Per-variant showcase; we'll also build a master contact sheet below.
      showcase: true,
      showcase_caption: `${v.name} — ${v.hex}`,
    });

    variants.push({
      variant_name: v.name,
      brand_color: v.hex,
      output_dir: subDir,
      set,
    });
  }

  // Master contact sheet — one tall composite showing every variant's showcase
  // stacked, so a user can pick a winner at a glance.
  let contactSheetPath: string | undefined;
  if ((input.contact_sheet ?? true) && variants.length > 0) {
    const showcasePaths = variants
      .map((v) => v.set.showcase_path)
      .filter((p): p is string => typeof p === "string");
    if (showcasePaths.length > 0) {
      const out = path.join(root, "contact-sheet.png");
      const result = await makeShowcase({
        screenshots: showcasePaths,
        output_path: out,
        caption: "A/B variants — pick the one that stops the scroll",
        target_height: 360,
        gap: 24,
        padding: 40,
      });
      contactSheetPath = result.path;
    }
  }

  return {
    output_root: root,
    variants,
    contact_sheet_path: contactSheetPath,
  };
}
