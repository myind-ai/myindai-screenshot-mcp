import path from "node:path";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, MAX_IMAGE_BYTES } from "../config.js";

// Headline auto-writer. Vision-driven helper that, given a simulator
// screenshot (and optional context), returns 3 ranked ACTION VERB + DESCRIPTOR
// suggestions for the ASO action-verb format. Removes the "I have no idea what
// verb to use" friction documented in the design-guide.

export const SuggestHeadlinesInputSchema = z.object({
  image: z.string().min(1, "image (path | data-URL | base64) required"),
  app_name: z.string().optional().describe("Optional. Helps the model anchor the verb to the actual product."),
  app_description: z.string().optional().describe("Optional. One-liner of what the app does."),
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
  count: z.number().int().min(1).max(8).default(3).optional(),
});

export type SuggestHeadlinesInput = z.infer<typeof SuggestHeadlinesInputSchema>;

export interface HeadlineSuggestion {
  verb: string;
  descriptor: string;
  combined: string;
  rationale: string;
  // 0-100. Higher = more grounded in what's visible on screen.
  confidence: number;
  detected_screen_type: string;
}

export interface SuggestHeadlinesResult {
  count: number;
  app_name?: string;
  domain: string;
  suggestions: HeadlineSuggestion[];
  // What the model thinks is on the screen — surfaced so callers can sanity-check.
  screen_summary: string;
}

const SYSTEM_PROMPT = `You are a senior App Store ASO copywriter. You see a single simulator screenshot and produce ACTION-VERB headlines that follow this exact format:

  VERB + DESCRIPTOR

Examples (one per line, the format is INTENT, not the actual lines you'll output):
  "TRACK CARD PRICES"
  "SCAN MY FRIDGE"
  "BUILD WORKOUT PLAN"
  "RECORD VOICE NOTES"

Rules — non-negotiable:
- ALL CAPS — the renderer auto-uppercases but produce them in caps anyway.
- VERB is one word, imperative, present tense ("TRACK", not "TRACKING" or "TRACKED").
- DESCRIPTOR is 1–4 words, names what the user does in concrete terms ("CARD PRICES", "WORKOUT PLAN", not "EVERYTHING IN ONE PLACE").
- The verb must describe an ACTION VISIBLE in the screenshot. Don't pick "MASTER" if the screen shows a list of trades; pick "TRACK". Reject abstract self-help verbs ("UNLOCK", "DISCOVER", "TRANSFORM") unless the screen actually shows that motion.
- Each suggestion must be DISTINCT — different verbs, different angles. Don't return three variations of "TRACK".

Return ONLY valid JSON (no markdown):
{
  "screen_summary": "<1-2 sentences describing what's actually on screen>",
  "detected_screen_type": "<dashboard | list | detail | settings | feed | media-player | timer | chart | composer | other>",
  "suggestions": [
    { "verb": "TRACK", "descriptor": "CARD PRICES", "rationale": "<why this fits>", "confidence": 88 },
    ...
  ]
}`;

export async function suggestHeadlines(
  input: SuggestHeadlinesInput
): Promise<SuggestHeadlinesResult> {
  const count = input.count ?? 3;
  const domain = input.domain ?? "auto";

  const { buffer, mime } = await loadImageForVision(input.image);
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${buffer.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
  }

  if (!ANTHROPIC_API_KEY) {
    return {
      count: 0,
      app_name: input.app_name,
      domain,
      screen_summary: "ANTHROPIC_API_KEY not set — vision suggestions skipped.",
      suggestions: [],
    };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const ctx = [
    input.app_name ? `App name: ${input.app_name}` : "",
    input.app_description ? `What it does: ${input.app_description}` : "",
    domain !== "auto" ? `Domain: ${domain}` : "",
    `Return at most ${count} distinct suggestions, ranked highest-confidence first.`,
  ]
    .filter(Boolean)
    .join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ] as any,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                  data: buffer.toString("base64"),
                },
              },
              {
                type: "text",
                text:
                  ctx +
                  (attempt === 1
                    ? "\n\nYour previous response wasn't valid JSON. Return ONLY the JSON object."
                    : ""),
              },
            ],
          },
        ],
      });
      const text = (resp.content.find((c: any) => c.type === "text") as any)?.text;
      const parsed = parseJson(text);
      if (parsed && Array.isArray(parsed.suggestions)) {
        const suggestions: HeadlineSuggestion[] = parsed.suggestions
          .slice(0, count)
          .map((s: any) => ({
            verb: String(s.verb ?? "").toUpperCase().trim(),
            descriptor: String(s.descriptor ?? "").toUpperCase().trim(),
            combined: `${String(s.verb ?? "").toUpperCase().trim()} ${String(s.descriptor ?? "").toUpperCase().trim()}`.trim(),
            rationale: String(s.rationale ?? ""),
            confidence: clamp(Number(s.confidence ?? 50), 0, 100),
            detected_screen_type: String(parsed.detected_screen_type ?? "other"),
          }))
          .filter((s: HeadlineSuggestion) => s.verb && s.descriptor);
        return {
          count: suggestions.length,
          app_name: input.app_name,
          domain,
          screen_summary: String(parsed.screen_summary ?? ""),
          suggestions,
        };
      }
    } catch (err: any) {
      process.stderr.write(`[suggest_headlines] attempt ${attempt} error: ${err?.message || err}\n`);
    }
  }

  return {
    count: 0,
    app_name: input.app_name,
    domain,
    screen_summary: "vision call failed — see stderr",
    suggestions: [],
  };
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
