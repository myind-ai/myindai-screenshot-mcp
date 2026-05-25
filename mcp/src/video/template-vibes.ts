/**
 * Hand-curated vibe metadata for each spec template.
 *
 * Used by the auto-picker (`mcp/src/ai/auto-template-pick.ts`) to:
 *   1. Match a user's one-line prompt ("dramatic and premium") to the right slug
 *      via deterministic keyword matching when no LLM is available.
 *   2. Give the LLM a compact catalog so it can pick well from a single Claude
 *      call (without us having to re-send the full JSON specs).
 *
 * Adding a new template = drop a JSON in `mcp/video_script/` AND add an entry
 * here. If you skip the entry, the auto-picker will fall back to the spec's
 * `_style` text — workable but less precise.
 */

export type Intensity = "low" | "medium" | "high";

export interface TemplateVibe {
  vibe: string;        // mood label — comma-separated keywords for fallback matching
  intensity: Intensity;// motion intensity for pacing decisions
  one_line: string;    // elevator pitch — what this template feels like in plain English
  best_for_screens: number; // ideal screen count (mirrors spec's distinct-screen count)
}

export const TEMPLATE_VIBES: Record<string, TemplateVibe> = {
  "gravity-drop": {
    vibe: "dramatic, bouncy, energetic, physical",
    intensity: "high",
    one_line: "Phone freefalls into frame and bounces — playful but punchy.",
    best_for_screens: 4,
  },
  "parallax-layers": {
    vibe: "premium, layered, depth, sophisticated",
    intensity: "medium",
    one_line: "Multiple depth layers slide at different speeds — premium and architectural.",
    best_for_screens: 4,
  },
  "split-screen-morph": {
    vibe: "dynamic, comparative, modern, energetic",
    intensity: "high",
    one_line: "Two screens split and morph into each other — dynamic and bold.",
    best_for_screens: 5,
  },
  "spotlight-sweep": {
    vibe: "cinematic, dramatic, theatrical, premium",
    intensity: "medium",
    one_line: "A spotlight sweeps across the device — cinematic and theatrical.",
    best_for_screens: 3,
  },
  "isometric-showcase": {
    vibe: "clean, minimal, architectural, premium",
    intensity: "low",
    one_line: "Devices arranged on an isometric plane — clean, geometric, premium.",
    best_for_screens: 6,
  },
  "neon-pulse": {
    vibe: "energetic, playful, synthwave, vibrant",
    intensity: "high",
    one_line: "Synthwave glow pulses sync with screen swaps — energetic and vivid.",
    best_for_screens: 4,
  },
  "origami-unfold": {
    vibe: "playful, clever, organic, smooth",
    intensity: "medium",
    one_line: "Screens unfold like origami — playful, clever, smooth.",
    best_for_screens: 4,
  },
  "dolly-zoom": {
    vibe: "cinematic, dramatic, hero, focused",
    intensity: "high",
    one_line: "Hitchcock-style perspective shift on a single hero shot — cinematic and unsettling-on-purpose.",
    best_for_screens: 1,
  },
  "liquid-morph": {
    vibe: "smooth, organic, fluid, modern",
    intensity: "medium",
    one_line: "Screens morph between each other like liquid — smooth and organic.",
    best_for_screens: 4,
  },
  "kinetic-typography": {
    vibe: "bold, confident, type-driven, modern",
    intensity: "medium",
    one_line: "Big text drives the rhythm; phone follows — bold and confident.",
    best_for_screens: 3,
  },
  "macro-lens": {
    vibe: "premium, quiet, intimate, focused",
    intensity: "low",
    one_line: "Extreme close-up on the device — premium, quiet, intimate.",
    best_for_screens: 2,
  },
  "timelapse-journey": {
    vibe: "progressive, narrative, journey, hopeful",
    intensity: "medium",
    one_line: "Screens reveal an over-time progression — narrative and hopeful.",
    best_for_screens: 5,
  },
  "holographic-flip": {
    vibe: "futuristic, sci-fi, technical, modern",
    intensity: "high",
    one_line: "Sci-fi holographic flips between screens — futuristic and technical.",
    best_for_screens: 3,
  },
  "stacked-cascade": {
    vibe: "elegant, layered, premium, lifestyle",
    intensity: "medium",
    one_line: "Screens stack in a cascading depth arrangement — elegant and lifestyle.",
    best_for_screens: 5,
  },
  "particle-materialize": {
    vibe: "magical, premium, ethereal, dramatic",
    intensity: "high",
    one_line: "Particles assemble into the device — magical, premium, ethereal.",
    best_for_screens: 3,
  },
  "mirror-reflection": {
    vibe: "premium, stylish, reflective, calm",
    intensity: "low",
    one_line: "Reflective surface beneath the device — premium, stylish, calm.",
    best_for_screens: 2,
  },
  "whirlwind-spin": {
    vibe: "energetic, dynamic, fast, fun",
    intensity: "high",
    one_line: "Phone whirls and spins through screens — fast, dynamic, fun.",
    best_for_screens: 3,
  },
  "glass-morphism": {
    vibe: "modern, clean, frosted, ios-style",
    intensity: "low",
    one_line: "Frosted glass aesthetic — modern, clean, iOS-flavored.",
    best_for_screens: 4,
  },
  "conveyor-belt": {
    vibe: "clean, mechanical, sequential, demo",
    intensity: "medium",
    one_line: "Screens roll by on a conveyor — clean, mechanical, demo-friendly.",
    best_for_screens: 6,
  },
  "cinematic-story-arc": {
    vibe: "cinematic, emotional, premium, narrative",
    intensity: "high",
    one_line: "Three-act emotional arc with slow reveals — cinematic and narrative.",
    best_for_screens: 4,
  },
};

// ── Deterministic vibe match (no LLM) ────────────────────────────────────────
// Score each template's vibe keywords against the user's prompt; tie-break by
// closest screen-count match. Used as fallback when ANTHROPIC_API_KEY isn't set.
export function pickTemplateByKeywords(
  userPrompt: string,
  screenshotCount: number
): { slug: string; reasoning: string } {
  const promptLower = (userPrompt || "").toLowerCase();
  const tokens = promptLower
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  if (tokens.length === 0) {
    // No prompt at all → pick by screen count.
    return {
      slug: pickByScreenCount(screenshotCount),
      reasoning: "no vibe prompt provided — picked best fit for the screenshot count",
    };
  }

  // Aliases — common synonyms users say that don't appear literally in vibe tags.
  const aliases: Record<string, string[]> = {
    fast: ["energetic", "dynamic", "punchy"],
    slow: ["calm", "premium", "quiet"],
    luxury: ["premium", "elegant", "sophisticated"],
    fun: ["playful", "energetic"],
    serious: ["premium", "cinematic"],
    minimal: ["clean", "minimal"],
    bold: ["bold", "confident", "dramatic"],
    soft: ["smooth", "organic", "calm"],
    tech: ["technical", "futuristic", "sci-fi", "modern"],
    fintech: ["premium", "clean", "sophisticated"],
    saas: ["clean", "modern", "demo"],
    consumer: ["energetic", "playful", "vibrant"],
    wellness: ["calm", "smooth", "organic"],
    gaming: ["energetic", "dynamic", "vibrant"],
  };

  const expanded = new Set(tokens);
  for (const t of tokens) {
    if (aliases[t]) for (const a of aliases[t]) expanded.add(a);
  }

  let best: { slug: string; score: number } | null = null;
  for (const [slug, meta] of Object.entries(TEMPLATE_VIBES)) {
    const tags = meta.vibe.toLowerCase().split(/,\s*/);
    let score = 0;
    for (const tag of tags) {
      for (const word of expanded) {
        if (tag.includes(word) || word.includes(tag)) score += 1;
      }
    }
    // Screen count proximity bonus: 0–3 pts (closer = better).
    const countDelta = Math.abs(meta.best_for_screens - screenshotCount);
    score += Math.max(0, 3 - countDelta);
    if (!best || score > best.score) best = { slug, score };
  }

  return {
    slug: best?.slug ?? pickByScreenCount(screenshotCount),
    reasoning: `keyword match: tokens=[${[...expanded].join(", ")}] → ${best?.slug} (score ${best?.score ?? 0})`,
  };
}

function pickByScreenCount(n: number): string {
  if (n <= 1) return "dolly-zoom";
  if (n === 2) return "macro-lens";
  if (n === 3) return "kinetic-typography";
  if (n === 4) return "gravity-drop";
  if (n === 5) return "stacked-cascade";
  return "isometric-showcase";
}
