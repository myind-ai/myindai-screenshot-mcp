import { z } from "zod";
import { extractPalette } from "./palette.js";

const Domain = z.enum([
  "auto",
  "finance",
  "fitness",
  "health",
  "wellness",
  "games",
  "kids",
  "productivity",
  "social",
  "creative",
  "education",
  "travel",
  "news",
  "shopping",
  "business",
  "developer",
]);

export const PickBrandColorInputSchema = z.object({
  image: z
    .union([z.string(), z.array(z.string()).min(1)])
    .describe("One simulator screenshot path, or an array of paths to sample from."),
  domain: Domain.default("auto").optional(),
  // Stricter rejection thresholds — reject washed-out / near-white / near-black hits.
  min_saturation: z.number().min(0).max(1).default(0.35).optional(),
  min_luminance: z.number().min(0).max(255).default(40).optional(),
  max_luminance: z.number().min(0).max(255).default(210).optional(),
  // If the dominant UI colour is too close to a candidate, reject so the device doesn't
  // disappear into the background. Distance threshold in RGB euclidean.
  ui_color_min_distance: z.number().min(0).max(442).default(80).optional(),
});

export type PickBrandColorInput = z.infer<typeof PickBrandColorInputSchema>;

export interface BrandColorCandidate {
  hex: string;
  rgb: [number, number, number];
  saturation: number;
  luminance: number;
  ui_distance: number; // distance from the UI's most dominant colour
  source: "palette" | "domain-fallback";
}

export interface PickBrandColorResult {
  picked: BrandColorCandidate;
  reasoning: string;
  rejected: Array<{ hex: string; reason: string }>;
  candidates: BrandColorCandidate[];
  ui_dominant_color: string;
  domain: string;
}

// Per-domain defaults — used when no palette candidate survives filtering.
// These are the user's battle-tested winners from `appstore-screenshot-templates`
// plus standard ASO conversion knowledge.
const DOMAIN_DEFAULTS: Record<string, { hex: string; name: string }[]> = {
  finance: [
    { hex: "#0a3d91", name: "Deep Blue" },
    { hex: "#1e2a4a", name: "Navy" },
    { hex: "#003459", name: "Stripe Navy" },
  ],
  fitness: [
    { hex: "#2563eb", name: "Vibrant Blue" },
    { hex: "#16a34a", name: "Bold Green" },
    { hex: "#e11d48", name: "Rose" },
  ],
  health: [
    { hex: "#0f766e", name: "Deep Teal" },
    { hex: "#2563eb", name: "Vibrant Blue" },
  ],
  wellness: [
    { hex: "#0f766e", name: "Deep Teal" },
    { hex: "#7c2d6f", name: "Aubergine" },
  ],
  games: [
    { hex: "#e91e63", name: "Hot Pink" },
    { hex: "#7c3aed", name: "Violet" },
    { hex: "#f59e0b", name: "Amber" },
  ],
  kids: [
    { hex: "#f59e0b", name: "Amber" },
    { hex: "#22d3ee", name: "Sky Cyan" },
    { hex: "#e94691", name: "Bright Pink" },
  ],
  productivity: [
    { hex: "#5b21b6", name: "Deep Purple" },
    { hex: "#ea580c", name: "Warm Orange" },
    { hex: "#1e3a8a", name: "Things 3 Indigo" },
  ],
  social: [
    { hex: "#7c3aed", name: "Violet" },
    { hex: "#e94691", name: "Bright Pink" },
  ],
  creative: [
    { hex: "#7c3aed", name: "Violet" },
    { hex: "#ea580c", name: "Warm Orange" },
  ],
  education: [
    { hex: "#2563eb", name: "Vibrant Blue" },
    { hex: "#7c3aed", name: "Violet" },
  ],
  travel: [
    { hex: "#0891b2", name: "Pacific Cyan" },
    { hex: "#ea580c", name: "Sunset Orange" },
  ],
  news: [
    { hex: "#0a0a0a", name: "Charcoal" },
    { hex: "#dc2626", name: "Editorial Red" },
  ],
  shopping: [
    { hex: "#e94691", name: "Bright Pink" },
    { hex: "#ea580c", name: "Warm Orange" },
  ],
  business: [
    { hex: "#1e2a4a", name: "Navy" },
    { hex: "#0f172a", name: "Slate" },
  ],
  developer: [
    { hex: "#7c3aed", name: "Violet" },
    { hex: "#0a0a0f", name: "Linear Black" },
  ],
};

const AUTO_DEFAULT = { hex: "#7c3aed", name: "Violet" };

export async function pickBrandColor(input: PickBrandColorInput): Promise<PickBrandColorResult> {
  const images = Array.isArray(input.image) ? input.image : [input.image];
  const domain = input.domain ?? "auto";
  const minSat = input.min_saturation ?? 0.35;
  const minLum = input.min_luminance ?? 40;
  const maxLum = input.max_luminance ?? 210;
  const minDist = input.ui_color_min_distance ?? 80;

  // Aggregate palettes from every image (typically 1 representative screenshot is enough,
  // but accept multiple for set-wide brand picking).
  const buckets = new Map<string, { rgb: [number, number, number]; share: number }>();
  for (const img of images) {
    const p = await extractPalette({ image: img, count: 8 });
    for (const c of p.colors) {
      const prev = buckets.get(c.hex);
      if (prev) prev.share += c.share;
      else buckets.set(c.hex, { rgb: c.rgb, share: c.share });
    }
  }
  const palette = [...buckets.entries()]
    .map(([hex, v]) => ({ hex, rgb: v.rgb, share: v.share }))
    .sort((a, b) => b.share - a.share);

  if (palette.length === 0) throw new Error("could not extract any palette colours from input");

  const uiDominant = palette[0];

  const rejected: Array<{ hex: string; reason: string }> = [];
  const candidates: BrandColorCandidate[] = [];

  for (const c of palette) {
    const sat = saturation(c.rgb);
    const lum = luminance(c.rgb);
    const dist = rgbDistance(c.rgb, uiDominant.rgb);

    if (sat < minSat) {
      rejected.push({ hex: c.hex, reason: `saturation ${sat.toFixed(2)} < ${minSat} (washed-out / near-grey)` });
      continue;
    }
    if (lum < minLum) {
      rejected.push({ hex: c.hex, reason: `luminance ${Math.round(lum)} < ${minLum} (too dark)` });
      continue;
    }
    if (lum > maxLum) {
      rejected.push({ hex: c.hex, reason: `luminance ${Math.round(lum)} > ${maxLum} (too light — disappears on App Store)` });
      continue;
    }
    if (dist < minDist) {
      rejected.push({ hex: c.hex, reason: `distance ${Math.round(dist)} from UI dominant ${uiDominant.hex} < ${minDist} (device would blend in)` });
      continue;
    }
    candidates.push({
      hex: c.hex,
      rgb: c.rgb,
      saturation: round2(sat),
      luminance: Math.round(lum),
      ui_distance: Math.round(dist),
      source: "palette",
    });
  }

  if (candidates.length > 0) {
    // Prefer the most saturated survivor — it stops the scroll best.
    candidates.sort((a, b) => b.saturation - a.saturation);
    const picked = candidates[0];
    return {
      picked,
      reasoning: `Picked ${picked.hex} from the screenshot palette — saturation ${picked.saturation}, luminance ${picked.luminance}, ${picked.ui_distance} away from UI dominant ${uiDominant.hex}.`,
      rejected,
      candidates,
      ui_dominant_color: uiDominant.hex,
      domain,
    };
  }

  // Fallback: per-domain defaults. Avoid one whose distance from UI dominant is too close.
  const pool = (domain !== "auto" && DOMAIN_DEFAULTS[domain]) || [AUTO_DEFAULT];
  let chosen: { hex: string; name: string } | null = null;
  for (const def of pool) {
    const rgb = hexToRgb(def.hex);
    const dist = rgbDistance(rgb, uiDominant.rgb);
    if (dist >= minDist) {
      chosen = def;
      break;
    }
  }
  if (!chosen) chosen = pool[0];

  const rgb = hexToRgb(chosen.hex);
  const picked: BrandColorCandidate = {
    hex: chosen.hex,
    rgb,
    saturation: round2(saturation(rgb)),
    luminance: Math.round(luminance(rgb)),
    ui_distance: Math.round(rgbDistance(rgb, uiDominant.rgb)),
    source: "domain-fallback",
  };

  return {
    picked,
    reasoning: `No palette colour survived filters (UI dominant is ${uiDominant.hex} — likely a white/light app). Falling back to ${chosen.name} (${chosen.hex}) from the ${domain === "auto" ? "auto" : domain} domain defaults.`,
    rejected,
    candidates,
    ui_dominant_color: uiDominant.hex,
    domain,
  };
}

function saturation(rgb: [number, number, number]): number {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min;
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
