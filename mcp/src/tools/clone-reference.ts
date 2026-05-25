import path from "node:path";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, MAX_IMAGE_BYTES } from "../config.js";
import { extractPalette } from "./palette.js";

// Programmatic reference cloning. The `clone_template` MCP prompt is
// conversational — this is the deterministic, single-call version. Vision
// inspects a reference image, returns a render decision JSON that can be
// passed straight to `render_screenshot.background`, `.screenshot`, and
// `.text`.

export const CloneReferenceInputSchema = z.object({
  reference_image: z.string().min(1, "reference_image (path | data-URL | base64) required"),
  // Optional: the user's own raw screenshot. We don't render it here, but the
  // model uses it to retone the headline so it fits the user's app.
  user_screenshot: z.string().optional(),
  user_app_name: z.string().optional(),
  user_app_description: z.string().optional(),
});

export type CloneReferenceInput = z.infer<typeof CloneReferenceInputSchema>;

export interface CloneReferenceResult {
  // The 8-element design extraction from the design-guide.
  extraction: {
    background_type: "gradient" | "solid" | "image";
    gradient_stops: Array<{ color: string; position: number }>;
    gradient_angle: number;
    phone: { scale: number; x: number; y: number; rotation3d: { x: number; y: number; z: number } };
    device_mode: "2d" | "3d";
    glow: { present: boolean; color?: string };
    decoration: { type: string; description?: string };
    typography: {
      font: string;
      weight: string;
      size: number;
      letter_spacing: number;
      max_width_pct: number;
      alignment: "left" | "center" | "right";
      highlight_word?: string;
      gradient_text: boolean;
    };
  };
  retoned_headline?: string;
  retoned_subheadline?: string;
  // A ready-to-pass spec: drop straight into `render_screenshot` with `image`
  // and (optionally) `output_path` added.
  render_spec: Record<string, unknown>;
  // Extracted palette (independent of vision — deterministic).
  palette: { hex: string; share: number }[];
  notes: string;
}

const SYSTEM_PROMPT = `You are an App Store creative-director assistant. You inspect a REFERENCE App Store screenshot (someone else's polished marketing image) and decompose it into a render decision JSON that can be reproduced.

Extract these 8 elements (the design-guide cookbook):
1. background_type: "gradient" | "solid" | "image"
2. gradient_stops: 2-4 stops with hex + position 0..100 (set [] if not gradient)
3. gradient_angle: 0..360 (best estimate)
4. phone: { scale (% of canvas, 30-100), x (% 0-100), y (% 0-100), rotation3d: { x, y, z in degrees -180..180 } }
5. device_mode: "2d" | "3d"
6. glow: { present: bool, color: hex if present }
7. decoration: { type: "none"|"big-number"|"big-word"|"dotted-grid"|"blobs"|"accent-stripe", description }
8. typography: { font (one of: Plus Jakarta Sans, Inter, SF Pro Display, Cabinet Grotesk, system-ui), weight (300-900), size (px on a 1320 canvas, 60-160), letter_spacing (-3..3), max_width_pct (40-100), alignment (left|center|right), highlight_word (single word from headline if any), gradient_text (bool) }

Then retone the reference's headline so it fits the USER'S app (not the reference's). Use the same TONE and structure but write a new line for the user's product. If a user_screenshot is provided, look at it; if app_name and description are provided, use those.

Return ONLY valid JSON of this exact shape:
{
  "extraction": { ... 8 elements ... },
  "retoned_headline": "...",
  "retoned_subheadline": "..." or "",
  "notes": "<1-2 sentence on what you couldn't reproduce>"
}`;

export async function cloneReference(input: CloneReferenceInput): Promise<CloneReferenceResult> {
  // 1. Always extract the palette — deterministic and accurate.
  const palette = await extractPalette({ image: input.reference_image, count: 6 });

  // 2. Vision call.
  const refImg = await loadImageForVision(input.reference_image);
  if (refImg.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`reference image too large: ${refImg.buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
  }

  const userImg = input.user_screenshot ? await loadImageForVision(input.user_screenshot) : null;

  let visionExtraction: any = null;
  let retonedHeadline = "";
  let retonedSubheadline = "";
  let notes = "";

  if (ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const ctxBlocks: any[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: refImg.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: refImg.buffer.toString("base64"),
        },
      },
    ];
    if (userImg) {
      ctxBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: userImg.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: userImg.buffer.toString("base64"),
        },
      });
    }
    ctxBlocks.push({
      type: "text",
      text: [
        "First image = REFERENCE template you must analyze.",
        userImg ? "Second image = the user's RAW app screenshot — use ONLY for retoning the headline." : "",
        input.user_app_name ? `User's app name: ${input.user_app_name}` : "",
        input.user_app_description ? `What the user's app does: ${input.user_app_description}` : "",
        "",
        "Pre-extracted dominant colours (more accurate than your eyeball — prefer these for gradient_stops if applicable):",
        palette.colors.map((c) => `  ${c.hex} (share ${(c.share * 100).toFixed(1)}%)`).join("\n"),
        "",
        "Return the JSON.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1200,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] as any,
          messages: [{ role: "user", content: ctxBlocks }],
        });
        const text = (resp.content.find((c: any) => c.type === "text") as any)?.text;
        const parsed = parseJson(text);
        if (parsed && parsed.extraction) {
          visionExtraction = parsed.extraction;
          retonedHeadline = String(parsed.retoned_headline ?? "");
          retonedSubheadline = String(parsed.retoned_subheadline ?? "");
          notes = String(parsed.notes ?? "");
          break;
        }
      } catch (err: any) {
        process.stderr.write(`[clone_reference] attempt ${attempt} error: ${err?.message || err}\n`);
      }
    }
  }

  const extraction = normalizeExtraction(visionExtraction, palette);
  const renderSpec = buildRenderSpec(extraction, retonedHeadline, retonedSubheadline);

  return {
    extraction,
    retoned_headline: retonedHeadline || undefined,
    retoned_subheadline: retonedSubheadline || undefined,
    render_spec: renderSpec,
    palette: palette.colors.map((c) => ({ hex: c.hex, share: c.share })),
    notes,
  };
}

function normalizeExtraction(
  raw: any,
  palette: { colors: { hex: string; share: number }[] }
): CloneReferenceResult["extraction"] {
  const fallbackStops =
    palette.colors.length >= 2
      ? [
          { color: palette.colors[0].hex, position: 0 },
          { color: palette.colors[1].hex, position: 100 },
        ]
      : [
          { color: "#7c3aed", position: 0 },
          { color: "#a855f7", position: 100 },
        ];

  const e = raw && typeof raw === "object" ? raw : {};
  return {
    background_type: ["gradient", "solid", "image"].includes(e.background_type) ? e.background_type : "gradient",
    gradient_stops: Array.isArray(e.gradient_stops) && e.gradient_stops.length >= 2
      ? e.gradient_stops.map((s: any) => ({
          color: typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#7c3aed",
          position: clamp(Number(s.position ?? 50), 0, 100),
        }))
      : fallbackStops,
    gradient_angle: clamp(Number(e.gradient_angle ?? 145), 0, 360),
    phone: {
      scale: clamp(Number(e?.phone?.scale ?? 73), 30, 100),
      x: clamp(Number(e?.phone?.x ?? 50), 0, 100),
      y: clamp(Number(e?.phone?.y ?? 80), 0, 100),
      rotation3d: {
        x: clamp(Number(e?.phone?.rotation3d?.x ?? 0), -180, 180),
        y: clamp(Number(e?.phone?.rotation3d?.y ?? 0), -180, 180),
        z: clamp(Number(e?.phone?.rotation3d?.z ?? 0), -180, 180),
      },
    },
    device_mode: e.device_mode === "3d" ? "3d" : "2d",
    glow: {
      present: !!e?.glow?.present,
      color: typeof e?.glow?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(e.glow.color) ? e.glow.color : undefined,
    },
    decoration: {
      type: ["none", "big-number", "big-word", "dotted-grid", "blobs", "accent-stripe"].includes(e?.decoration?.type)
        ? e.decoration.type
        : "none",
      description: e?.decoration?.description ? String(e.decoration.description) : undefined,
    },
    typography: {
      font: typeof e?.typography?.font === "string" ? e.typography.font : "Plus Jakarta Sans",
      weight: String(e?.typography?.weight ?? "900"),
      size: clamp(Number(e?.typography?.size ?? 100), 60, 160),
      letter_spacing: clamp(Number(e?.typography?.letter_spacing ?? -2), -3, 3),
      max_width_pct: clamp(Number(e?.typography?.max_width_pct ?? 82), 40, 100),
      alignment: ["left", "center", "right"].includes(e?.typography?.alignment) ? e.typography.alignment : "center",
      highlight_word: e?.typography?.highlight_word ? String(e.typography.highlight_word) : undefined,
      gradient_text: !!e?.typography?.gradient_text,
    },
  };
}

function buildRenderSpec(
  ex: CloneReferenceResult["extraction"],
  headline: string,
  subheadline: string
): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    headline,
    subheadline,
    mode: ex.device_mode,
    background: {
      type: ex.background_type,
      gradient: ex.background_type === "gradient"
        ? { angle: ex.gradient_angle, stops: ex.gradient_stops }
        : undefined,
      solid: ex.background_type === "solid" ? ex.gradient_stops[0]?.color : undefined,
    },
    screenshot: {
      scale: ex.phone.scale,
      x: ex.phone.x,
      y: ex.phone.y,
      rotation3D: ex.phone.rotation3d,
      glow: ex.glow.present
        ? { enabled: true, color: ex.glow.color ?? ex.gradient_stops[0]?.color, intensity: 60, size: 120 }
        : undefined,
      decoration: ex.decoration.type !== "none" ? { type: ex.decoration.type } : undefined,
    },
    text: {
      font: ex.typography.font,
      headlineSize: ex.typography.size,
      headlineWeight: ex.typography.weight,
      headlineLetterSpacing: ex.typography.letter_spacing,
      headlineMaxWidthPct: ex.typography.max_width_pct,
      headlineTextAlign: ex.typography.alignment,
      headlineHighlightWord: ex.typography.highlight_word,
      headlineGradient: ex.typography.gradient_text
        ? { colors: ex.gradient_stops.slice(0, 2).map((s) => s.color), angle: 90 }
        : null,
    },
  };
  return spec;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function parseJson(text?: string): any | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function loadImageForVision(image: string): Promise<{ buffer: Buffer; mime: string }> {
  if (image.startsWith("data:")) {
    const m = image.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!m) throw new Error("invalid data URL");
    return { buffer: Buffer.from(m[2], "base64"), mime: m[1] };
  }
  if (!image.includes("/") && !image.includes("\\") && /^[A-Za-z0-9+/=\r\n]+$/.test(image) && image.length > 200) {
    return { buffer: Buffer.from(image, "base64"), mime: "image/png" };
  }
  const abs = path.isAbsolute(image) ? image : path.resolve(process.cwd(), image);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  return { buffer, mime };
}
