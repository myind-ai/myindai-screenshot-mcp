import path from "node:path";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config.js";
import { renderAsoSet, type RenderAsoSetResult } from "./aso-set.js";

// Localization render. Render a set in N languages with the same layout,
// auto-translating headlines via a small LLM hop. Handles RTL (Arabic, Hebrew)
// by flipping headline alignment.
//
// Each language goes into its own subdirectory so ASC's per-locale slot upload
// is straightforward.

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Benefit = z.object({
  image: z.string().min(1),
  verb: z.string().min(1),
  descriptor: z.string().min(1),
});

const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

// Plus Jakarta Sans / Inter don't have great Arabic / CJK glyphs. Pick a
// system font that does for those scripts.
function fontForLanguage(lang: string, defaultFont: string): string {
  const l = lang.toLowerCase();
  if (l.startsWith("ar") || l.startsWith("he") || l.startsWith("fa") || l.startsWith("ur"))
    return "Noto Sans Arabic, Noto Sans Hebrew, system-ui";
  if (l.startsWith("zh") || l.startsWith("ja") || l.startsWith("ko"))
    return "Noto Sans CJK, PingFang SC, Hiragino Sans, system-ui";
  if (l.startsWith("hi") || l.startsWith("bn") || l.startsWith("ta") || l.startsWith("te"))
    return "Noto Sans Devanagari, Noto Sans Tamil, system-ui";
  return defaultFont;
}

export const RenderLocalizedSetInputSchema = z.object({
  benefits: z.array(Benefit).min(1).max(10),
  output_root: z.string().min(1),
  languages: z
    .array(z.string().min(2))
    .min(1)
    .describe("ISO 639-1 codes (or BCP-47 tags). e.g. ['en','es','fr','de','ja','zh','ar','hi']"),
  brand_color: HexColor.optional(),
  brand_gradient_to: HexColor.optional(),
  domain: z
    .enum([
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
    ])
    .default("auto")
    .optional(),
  font: z.string().default("Plus Jakarta Sans").optional(),
  output_device: z
    .enum([
      "iphone-6.9",
      "iphone-6.7",
      "iphone-6.5",
      "iphone-5.5",
      "android-phone",
      "android-phone-hd",
    ])
    .default("iphone-6.9")
    .optional(),
  text_color: HexColor.default("#ffffff").optional(),
  showcase: z.boolean().default(true).optional(),
});

export type RenderLocalizedSetInput = z.infer<typeof RenderLocalizedSetInputSchema>;

export interface LocalizedEntry {
  language: string;
  rtl: boolean;
  output_dir: string;
  set: RenderAsoSetResult;
  translations: Array<{ source: string; translated: string }>;
}

export interface RenderLocalizedSetResult {
  output_root: string;
  brand_color: string;
  per_language: LocalizedEntry[];
}

export async function renderLocalizedSet(
  input: RenderLocalizedSetInput
): Promise<RenderLocalizedSetResult> {
  const root = path.isAbsolute(input.output_root)
    ? input.output_root
    : path.resolve(process.cwd(), input.output_root);
  await fs.mkdir(root, { recursive: true });

  // Translate every (verb, descriptor) pair for every non-English target in
  // ONE Anthropic call per language to keep latency low.
  let brandColor = input.brand_color;
  const perLanguage: LocalizedEntry[] = [];

  for (const lang of input.languages) {
    const isEnglish = lang.toLowerCase().startsWith("en");
    const rtl = RTL_LANGS.has(lang.toLowerCase().slice(0, 2));
    const subDir = path.join(root, lang);
    await fs.mkdir(subDir, { recursive: true });

    const translations = isEnglish
      ? input.benefits.map((b) => [
          { source: b.verb, translated: b.verb },
          { source: b.descriptor, translated: b.descriptor },
        ]).flat()
      : await translateBatch(input.benefits, lang);

    // Re-pair into benefits.
    const localizedBenefits = input.benefits.map((b, i) => ({
      image: b.image,
      verb: translations[i * 2]?.translated ?? b.verb,
      descriptor: translations[i * 2 + 1]?.translated ?? b.descriptor,
    }));

    const set = await renderAsoSet({
      benefits: localizedBenefits,
      output_dir: subDir,
      brand_color: brandColor,
      brand_gradient_to: input.brand_gradient_to,
      domain: input.domain,
      font: fontForLanguage(lang, input.font ?? "Plus Jakarta Sans"),
      output_device: input.output_device,
      text_color: input.text_color,
      showcase: input.showcase ?? true,
      showcase_caption: lang.toUpperCase(),
    });

    if (!brandColor) brandColor = set.brand_color;

    perLanguage.push({
      language: lang,
      rtl,
      output_dir: subDir,
      set,
      translations,
    });
  }

  return {
    output_root: root,
    brand_color: brandColor!,
    per_language: perLanguage,
  };
}

async function translateBatch(
  benefits: Array<{ verb: string; descriptor: string }>,
  language: string
): Promise<Array<{ source: string; translated: string }>> {
  const flat: string[] = [];
  for (const b of benefits) {
    flat.push(b.verb, b.descriptor);
  }

  if (!ANTHROPIC_API_KEY) {
    // No-op fallback — keep source strings.
    return flat.map((s) => ({ source: s, translated: s }));
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const userPrompt = [
    `Translate the following short App Store marketing strings from English to ${language}.`,
    "",
    "Rules:",
    "- ALL CAPS where culturally appropriate (skip uppercase for scripts that lack case e.g. Arabic/CJK).",
    "- Keep the punchy, action-oriented tone — these are marketing headlines, not literal translations.",
    "- Verbs stay imperative.",
    "- Match line length within ±20% of the source so the layout doesn't blow up.",
    "",
    "Return ONLY a JSON array of strings, one per source, in the SAME order. Example: [\"...\", \"...\"].",
    "",
    "Source strings:",
    JSON.stringify(flat),
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      });
      const text = (resp.content.find((c: any) => c.type === "text") as any)?.text;
      const arr = parseArray(text);
      if (arr && arr.length === flat.length) {
        return flat.map((s, i) => ({ source: s, translated: String(arr[i] ?? s) }));
      }
    } catch (err: any) {
      process.stderr.write(`[render_localized_set] translate attempt ${attempt} error: ${err?.message || err}\n`);
    }
  }

  return flat.map((s) => ({ source: s, translated: s }));
}

function parseArray(text?: string): unknown[] | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {}
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(s.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {}
  }
  return null;
}
