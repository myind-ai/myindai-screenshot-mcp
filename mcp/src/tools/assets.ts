import { z } from "zod";

// Bundled asset library — accent shapes, decoration SVGs, and pre-tinted device
// frame textures. Inlined as data URLs so the npm package stays self-contained
// and these can be passed straight to `render_screenshot.background.image` or
// composited via downstream tools.

export type AssetCategory =
  | "accent-shape"
  | "decoration"
  | "device-tint"
  | "pattern";

export interface BundledAsset {
  id: string;
  category: AssetCategory;
  name: string;
  description: string;
  // Inline SVG (no width/height attrs — caller scales). Tint by passing
  // `tint_color` to `get_asset` which substitutes `currentColor` placeholders.
  svg: string;
}

const ASSETS: BundledAsset[] = [
  // ---- accent shapes ----
  {
    id: "blob-soft",
    category: "accent-shape",
    name: "Soft Blob",
    description: "Organic ink-blot shape — great as a background bloom behind a centered device.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<path fill="currentColor" d="M315 50c92 0 175 50 215 130s30 178-30 252-160 110-260 95S65 460 50 360s40-185 120-235S260 50 315 50z"/>` +
      `</svg>`,
  },
  {
    id: "blob-sharp",
    category: "accent-shape",
    name: "Sharp Blob",
    description: "Edgier blob with steeper curves — pairs well with bold typography.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<path fill="currentColor" d="M450 70c60 70 80 170 50 260s-110 170-210 175-200-60-240-150 5-205 75-265 215-70 325-20z"/>` +
      `</svg>`,
  },
  {
    id: "ring-thin",
    category: "accent-shape",
    name: "Thin Ring",
    description: "Hollow ring — corner accent under or beside the device.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="300" cy="300" r="240" fill="none" stroke="currentColor" stroke-width="14"/>` +
      `</svg>`,
  },
  {
    id: "circle-fill",
    category: "accent-shape",
    name: "Solid Circle",
    description: "Single solid disk — bottom-corner bleed accent.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="300" cy="300" r="260" fill="currentColor"/>` +
      `</svg>`,
  },
  {
    id: "wedge",
    category: "accent-shape",
    name: "Wedge",
    description: "Diagonal triangular accent — corner stripe substitute.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<polygon fill="currentColor" points="0,600 600,0 600,600"/>` +
      `</svg>`,
  },

  // ---- decorations ----
  {
    id: "dotted-grid",
    category: "decoration",
    name: "Dotted Grid",
    description: "Subtle dotted background grid — use with low opacity (8-15%) under hero.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="dg" width="40" height="40" patternUnits="userSpaceOnUse">` +
      `<circle cx="2" cy="2" r="2" fill="currentColor"/></pattern></defs>` +
      `<rect width="600" height="600" fill="url(#dg)"/>` +
      `</svg>`,
  },
  {
    id: "diagonal-lines",
    category: "decoration",
    name: "Diagonal Lines",
    description: "Soft hatching — great as 12% accent over a saturated brand colour.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="dl" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="24" stroke="currentColor" stroke-width="2"/></pattern></defs>` +
      `<rect width="600" height="600" fill="url(#dl)"/>` +
      `</svg>`,
  },
  {
    id: "burst",
    category: "decoration",
    name: "Burst",
    description: "Sun-burst rays — adds drama behind a centered device. 20% opacity max.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<g fill="currentColor" transform="translate(300 300)">` +
      Array.from({ length: 12 })
        .map((_, i) => {
          const a = (i / 12) * 360;
          return `<polygon points="-10,-300 10,-300 0,0" transform="rotate(${a})"/>`;
        })
        .join("") +
      `</g></svg>`,
  },
  {
    id: "stars-scattered",
    category: "decoration",
    name: "Scattered Stars",
    description: "Sparkles — useful for kids, games, social, AI categories.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      [
        [120, 100, 18],
        [480, 140, 12],
        [80, 380, 14],
        [520, 460, 20],
        [300, 60, 10],
        [280, 540, 14],
        [180, 240, 8],
        [420, 320, 10],
      ]
        .map(
          ([x, y, s]) =>
            `<path d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z" fill="currentColor"/>`
        )
        .join("") +
      `</svg>`,
  },

  // ---- device tints ----
  // Tint overlays meant to be composited over the device frame at low opacity
  // for a brand-tinted feel.
  {
    id: "device-glow",
    category: "device-tint",
    name: "Device Glow",
    description: "Radial soft-light overlay — sits behind the device for an aura effect.",
    svg:
      `<svg viewBox="0 0 600 1300" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="currentColor" stop-opacity="0.7"/>` +
      `<stop offset="100%" stop-color="currentColor" stop-opacity="0"/>` +
      `</radialGradient></defs>` +
      `<ellipse cx="300" cy="650" rx="280" ry="600" fill="url(#g)"/>` +
      `</svg>`,
  },

  // ---- patterns ----
  {
    id: "wavy-lines",
    category: "pattern",
    name: "Wavy Lines",
    description: "Sinewave repeat — premium accent over solid backgrounds.",
    svg:
      `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><pattern id="wl" width="120" height="40" patternUnits="userSpaceOnUse">` +
      `<path d="M0 20 Q30 0 60 20 T120 20" stroke="currentColor" stroke-width="2" fill="none"/></pattern></defs>` +
      `<rect width="600" height="600" fill="url(#wl)"/>` +
      `</svg>`,
  },
];

// ---------- list_assets ----------

export const ListAssetsInputSchema = z.object({
  category: z
    .enum(["accent-shape", "decoration", "device-tint", "pattern"])
    .optional(),
});

export type ListAssetsInput = z.infer<typeof ListAssetsInputSchema>;

export interface ListAssetsResult {
  count: number;
  assets: Array<{ id: string; category: AssetCategory; name: string; description: string }>;
}

export async function listAssets(input: ListAssetsInput): Promise<ListAssetsResult> {
  const filtered = input.category ? ASSETS.filter((a) => a.category === input.category) : ASSETS;
  return {
    count: filtered.length,
    assets: filtered.map(({ svg, ...rest }) => rest),
  };
}

// ---------- get_asset ----------

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const GetAssetInputSchema = z.object({
  id: z.string().min(1, "asset id required (call list_assets first)"),
  tint_color: HexColor.optional().describe("Optional hex — substitutes 'currentColor' in the SVG."),
  format: z.enum(["svg", "data-url"]).default("data-url").optional(),
});

export type GetAssetInput = z.infer<typeof GetAssetInputSchema>;

export interface GetAssetResult {
  id: string;
  category: AssetCategory;
  name: string;
  format: "svg" | "data-url";
  data: string;
}

export async function getAsset(input: GetAssetInput): Promise<GetAssetResult> {
  const asset = ASSETS.find((a) => a.id === input.id);
  if (!asset) throw new Error(`unknown asset id '${input.id}' — call list_assets to see options`);

  const tinted = input.tint_color ? asset.svg.replace(/currentColor/g, input.tint_color) : asset.svg;
  const format = input.format ?? "data-url";
  const data =
    format === "svg"
      ? tinted
      : `data:image/svg+xml;base64,${Buffer.from(tinted, "utf-8").toString("base64")}`;

  return {
    id: asset.id,
    category: asset.category,
    name: asset.name,
    format,
    data,
  };
}

// Also exposed as an MCP resource — pure description (no payload bodies).
export function describeAssetLibrary(): string {
  const byCat: Record<string, BundledAsset[]> = {};
  for (const a of ASSETS) {
    (byCat[a.category] ||= []).push(a);
  }
  const lines: string[] = ["# Bundled asset library", ""];
  for (const [cat, items] of Object.entries(byCat)) {
    lines.push(`## ${cat}`);
    for (const it of items) lines.push(`- **${it.id}** — ${it.name}: ${it.description}`);
    lines.push("");
  }
  lines.push(
    "Pull the SVG / data-URL via `get_asset` and pass `tint_color` (hex) to recolor. " +
      "The data-URL form drops straight into `render_screenshot.background.image` or any HTML/CSS surface."
  );
  return lines.join("\n");
}
