/**
 * Auto-picker: takes a one-line user prompt + screenshots and decides
 *   1. which named template (slug) to use
 *   2. per-scene headlines (≤4 words each)
 *   3. an optional accent color override
 *
 * Two execution paths:
 *   - With ANTHROPIC_API_KEY: ONE Claude call sees the user prompt, the
 *     compact template catalog, and the first 3 screenshots; returns
 *     {template_slug, headlines[], accent?, reasoning}.
 *   - Without key: deterministic vibe-keyword match + filename-derived
 *     headlines. Workable but blunt.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "../config.js";
import { listVideoTemplates, type TemplateMetadata } from "../video/templates.js";
import { TEMPLATE_VIBES, pickTemplateByKeywords } from "../video/template-vibes.js";

export interface AutoPickInput {
  prompt?: string;            // one-line vibe / brand brief from the user
  appName?: string;           // used as last-scene CTA headline
  imagePaths: string[];       // absolute paths
  preferredTemplate?: string; // if user already named one, skip LLM
}

export interface AutoPickResult {
  template_slug: string;
  headlines: string[];        // one per scene; ≤4 words each
  subheadlines?: string[];    // optional
  accent?: string;            // optional hex override
  reasoning: string;          // shown back to the user — keep short
  source: "user" | "llm" | "keyword" | "fallback";
}

export async function autoPick(input: AutoPickInput): Promise<AutoPickResult> {
  // Short-circuit: user already named a template — just write headlines.
  if (input.preferredTemplate) {
    return {
      template_slug: input.preferredTemplate,
      headlines: deterministicHeadlines(input.imagePaths, input.appName),
      reasoning: "user pre-selected template",
      source: "user",
    };
  }

  const templates = listVideoTemplates();
  const screenshotCount = input.imagePaths.length;

  if (!ANTHROPIC_API_KEY) {
    const pick = pickTemplateByKeywords(input.prompt || "", screenshotCount);
    return {
      template_slug: pick.slug,
      headlines: deterministicHeadlines(input.imagePaths, input.appName),
      reasoning: pick.reasoning,
      source: "keyword",
    };
  }

  try {
    const llmPick = await llmPickAndWrite(input, templates);
    if (llmPick) return { ...llmPick, source: "llm" };
  } catch (err: any) {
    process.stderr.write(`[auto-pick] LLM error: ${err?.message || err}\n`);
  }

  // LLM failed → fall back to keyword picker.
  const pick = pickTemplateByKeywords(input.prompt || "", screenshotCount);
  return {
    template_slug: pick.slug,
    headlines: deterministicHeadlines(input.imagePaths, input.appName),
    reasoning: `${pick.reasoning} (LLM unavailable)`,
    source: "fallback",
  };
}

// ─── LLM path ────────────────────────────────────────────────────────────────
async function llmPickAndWrite(
  input: AutoPickInput,
  templates: TemplateMetadata[]
): Promise<Omit<AutoPickResult, "source"> | null> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Compact catalog the model can reason over without seeing each spec JSON.
  const catalog = templates
    .map((t) => {
      const v = TEMPLATE_VIBES[t.slug];
      return `- ${t.slug}: ${v?.one_line || t.style} (vibe: ${v?.vibe || "—"}, intensity: ${v?.intensity || "med"}, scenes: ${t.scenes}, ${t.total_seconds}s, ideal screens: ${v?.best_for_screens ?? t.ideal_screens})`;
    })
    .join("\n");

  // Send up to 3 screenshots — enough for the model to grasp the app's vibe + write
  // benefit-driven headlines, without blowing up the prompt cost.
  const previewImages = await Promise.all(
    input.imagePaths.slice(0, 3).map(async (p) => {
      const buf = await fs.readFile(p);
      const ext = path.extname(p).toLowerCase();
      const mediaType =
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
      return { buf, mediaType, name: path.basename(p) };
    })
  );

  const userText = `User prompt: ${input.prompt || "(none — pick the template you'd recommend for this app)"}
${input.appName ? `App name: ${input.appName}` : ""}
Total screenshots: ${input.imagePaths.length} (preview shown: ${previewImages.length})

Available templates:
${catalog}

Return ONLY this JSON (no prose, no markdown):
{
  "template_slug": "<one slug from the list above>",
  "headlines": ["<≤4 words for scene 1>", "<scene 2>", "..."],
  "subheadlines": ["<≤8 words, optional>", "..."],
  "accent": "#RRGGBB",   // optional — only set if you want to override the template's accent
  "reasoning": "<one sentence: why this template, what arc the headlines tell>"
}

Rules:
- Pick exactly ONE template_slug from the list — no inventing names.
- Provide headlines.length === ${input.imagePaths.length} OR headlines.length === <scene count of chosen template>. Reading the actual screenshots, write benefit-driven headlines specific to what each screen shows; do NOT use generic filler like "Welcome" or "Powered by AI".
- Last headline can be the app name as a CTA when ${input.appName ? `the app name "${input.appName}"` : "an app name"} is provided.
- Each headline ≤4 words; each subheadline ≤8 words. Anything longer wraps and breaks layout.
- Subheadlines are optional — if you set them, length must match headlines length.`;

  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          ...previewImages.map(
            (img) =>
              ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: img.mediaType as "image/png" | "image/jpeg" | "image/webp",
                  data: img.buf.toString("base64"),
                },
              }) as const
          ),
          { type: "text" as const, text: userText },
        ],
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) return null;

  const parsed = parseJson(textBlock.text);
  if (!parsed) return null;

  // Validate.
  const slug = String(parsed.template_slug || "");
  if (!templates.find((t) => t.slug === slug)) {
    process.stderr.write(`[auto-pick] LLM returned unknown slug "${slug}" — falling back\n`);
    return null;
  }

  const headlines: string[] = Array.isArray(parsed.headlines)
    ? parsed.headlines.map((h: any) => clipWords(String(h || ""), 4))
    : [];
  const subheadlines: string[] | undefined = Array.isArray(parsed.subheadlines)
    ? parsed.subheadlines.map((s: any) => clipWords(String(s || ""), 8))
    : undefined;
  const accent: string | undefined =
    typeof parsed.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed.accent) ? parsed.accent : undefined;
  const reasoning: string = String(parsed.reasoning || "LLM picked template").slice(0, 240);

  return {
    template_slug: slug,
    headlines,
    subheadlines,
    accent,
    reasoning,
  };
}

// ─── Deterministic helpers ───────────────────────────────────────────────────
function deterministicHeadlines(imagePaths: string[], appName?: string): string[] {
  return imagePaths.map((p, i) => {
    if (i === imagePaths.length - 1 && appName) return clipWords(appName, 4);
    return filenameToHeadline(p, appName);
  });
}

function filenameToHeadline(filePath: string, appName?: string): string {
  const stem = path
    .basename(filePath, path.extname(filePath))
    .replace(/^[\d._-]+/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return clipWords(stem || appName || "Built for you", 4);
}

function clipWords(s: string, maxWords: number): string {
  return s.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

function parseJson(text: string): any | null {
  let s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {}
    }
    return null;
  }
}
