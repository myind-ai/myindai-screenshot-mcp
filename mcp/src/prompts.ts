import { listPresets } from "./renderer/render.js";

export interface PromptDescriptor {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

export const PROMPTS: PromptDescriptor[] = [
  {
    name: "aso_appstore_screenshots",
    description:
      "Flagship multi-phase ASO workflow: codebase analysis → benefit discovery → simulator screenshot rating + pairing → auto brand color → render the full set in the action-verb format → side-by-side showcase. Resumable across conversations via Claude Code memory. Use this when the user wants a complete, high-converting App Store screenshot SET (not a one-off) — it's the closest thing this MCP has to the standalone `aso-appstore-screenshots` skill, but driven by the MCP's own renderer instead of an external image model.",
    arguments: [
      { name: "app_name", description: "Optional app name for tone.", required: false },
      { name: "language", description: "Target language (default en).", required: false },
      { name: "count", description: "Target number of screenshots in the set (3–5 recommended). Default 3.", required: false },
    ],
  },
  {
    name: "design_app_store_screenshot",
    description:
      "Brief Claude on how to compose a polished App Store screenshot from a raw input. Returns a system message that primes the model to use list_presets, look at the image, and call render_screenshot with thoughtful choices.",
    arguments: [
      { name: "app_name", description: "Optional app name for tone.", required: false },
      { name: "hints", description: "Optional free-text style hints.", required: false },
      { name: "language", description: "Target language (default en).", required: false },
    ],
  },
  {
    name: "design_screenshot_set",
    description:
      "Brief for designing a cohesive set of multiple App Store screenshots that share a visual language (same background family, same font, sequential headlines telling a story).",
    arguments: [
      { name: "app_name", description: "App name.", required: false },
      { name: "count", description: "How many screenshots in the set (3–10).", required: false },
      { name: "language", description: "Target language.", required: false },
    ],
  },
  {
    name: "design_product_video_concept",
    description:
      "RECOMMENDED workflow for product videos. Brief Claude on writing a multi-act storyboard FIRST (enter → hold → exit, with text fade timing decoupled from motion), then call render_video_concept to render it. Solves the 'text appears with motion' / 'no proper enter-exit' problems.",
    arguments: [
      { name: "app_name", description: "App name.", required: false },
      { name: "duration", description: "Total seconds (default 6).", required: false },
      { name: "tone", description: "premium | playful | technical | calm (default premium).", required: false },
    ],
  },
  {
    name: "make_video",
    description:
      "PRIMARY workflow when the user just says 'make me a video' / 'create a product video' / 'turn these screenshots into a video'. Lists the named video templates, asks the user to pick one (or recommends one based on their stated mood), then calls render_video_template. Use this BEFORE design_product_video_concept — only fall back to the concept-authoring flow if the user explicitly wants a custom storyboard.",
    arguments: [
      { name: "app_name", description: "App name.", required: false },
      { name: "screenshot_count", description: "How many screenshots the user has (helps recommend a template).", required: false },
      { name: "mood", description: "Optional mood hint: premium | energetic | playful | cinematic | dramatic | clean.", required: false },
    ],
  },
  {
    name: "clone_template",
    description:
      "Use when the user shares a REFERENCE template (someone else's polished App Store screenshot they want to copy the look of) AND their own raw app-screen UI. Briefs Claude through extracting the template's design language — gradient, font, layout, glow, decoration, headline tone — and reproducing it with the user's screenshot inside the device frame.",
    arguments: [
      { name: "app_name", description: "User's app name (used to retone the headline copy).", required: false },
      { name: "language", description: "Target language (default en).", required: false },
    ],
  },
];

export async function getPrompt(name: string, args: Record<string, string> | undefined) {
  if (name === "aso_appstore_screenshots") {
    return asoAppstoreScreenshotsPrompt(args || {});
  }
  if (name === "design_app_store_screenshot") {
    return designOnePrompt(args || {});
  }
  if (name === "design_screenshot_set") {
    return designSetPrompt(args || {});
  }
  if (name === "design_product_video_concept") {
    return designVideoConceptPrompt(args || {});
  }
  if (name === "clone_template") {
    return cloneTemplatePrompt(args || {});
  }
  if (name === "make_video") {
    return makeVideoPrompt(args || {});
  }
  throw new Error(`Unknown prompt: ${name}`);
}

async function asoAppstoreScreenshotsPrompt(args: Record<string, string>) {
  const count = args.count ? parseInt(args.count, 10) : 3;
  const app = args.app_name ? `**App:** ${args.app_name}` : "**App:** infer from the codebase + screenshots.";
  const lang = args.language || "en";

  const text = `You are an App Store Optimization (ASO) consultant guiding the user through producing a polished, high-converting screenshot SET (${count} screenshots) using the appscreen MCP renderer.

${app}
**Language:** ${lang}
**Target screenshots:** ${count}

This is a multi-phase workflow. Run phases IN ORDER. **ALWAYS check Claude Code memory first** — this skill writes incremental state so the user can resume from any phase in a future conversation.

---

## PHASE 0 — RECALL (always do this first)

Before any analysis, check the Claude Code memory system for state from a prior run:

1. **Benefits** — confirmed action-verb headline list + target audience + app context
2. **Screenshot ratings + pairings** — which simulator file is paired with which benefit
3. **Brand colour** — confirmed background hex + name
4. **Generated screenshots** — paths to approved output files

If state exists, present a status summary like:

\`\`\`
Here's where we left off:

✅ Benefits (3 confirmed): TRACK CARD PRICES, SEARCH ANY CARD, BUILD COLLECTION
✅ Screenshots rated + paired
✅ Brand colour: Electric Blue (#2563EB)
⏳ Generation: 2 of 3 rendered
\`\`\`

…then ask whether to resume, jump to a specific phase, or update one thing. **If no state exists**, proceed to Phase 1.

---

## PHASE 1 — BENEFIT DISCOVERY (the critical phase)

Goal: identify ${count} CORE benefits that drive downloads.

### 1a. Analyse the codebase
Look at: UI screens, view controllers, components, models, IAPs/subscriptions, onboarding, README, app metadata. Build a mental model of:
- What the app does
- Who it's for
- What makes it different
- What problems it solves

### 1b. Ask targeted clarifying questions
Only ask what the code can't answer. Examples:
- "Based on the code, this looks like X. Right?"
- "Who's the target audience?"
- "What's the #1 reason someone downloads this app?"
- "What do your best reviews say?"

### 1c. Draft benefits in ACTION VERB + DESCRIPTOR format
Each benefit MUST:
1. **Lead with an action verb** — TRACK, SEARCH, BUILD, BOOST, FIND, LEARN, SAVE, SHARE, CREATE…
2. **Focus on what the USER gets**, not what the app does
3. **Be specific** — "TRACK CARD PRICES" not "MANAGE STUFF"

Present them as:
\`\`\`
1. [VERB] + [DESCRIPTOR] — why this drives downloads
2. [VERB] + [DESCRIPTOR] — why this drives downloads
3. [VERB] + [DESCRIPTOR] — why this drives downloads
\`\`\`

### 1d. Iterate with the user
Don't proceed until the user confirms. Push back politely if they pick generic over specific.

### 1e. Save to memory
Persist confirmed benefits, target audience, app context, and reasoning. Mark as the source of truth so future sessions can skip discovery.

---

## PHASE 2 — SCREENSHOT PAIRING

### 2a. Collect simulator screenshots
Ask the user for paths (directory, glob, or list). Read each one with the Read tool.

### 2b. Rate each as Great / Usable / Retake
For every screenshot, tell the user:
- What it shows
- What works
- What doesn't (empty states, debug UI, status-bar clutter, settings/login pages → almost always Retake)
- Verdict

### 2c. Coach on retakes
For Retake screenshots OR benefits with no usable candidate, give specific guidance: which screen to navigate to, the data state (≥5-6 list items, realistic content, upward chart trend), light/dark consistency, clean status bar (9:41, full battery, full signal).

### 2d. Pair benefits with screenshots
Only pair Great or Usable. Maximize visual impact and uniqueness. Present:
\`\`\`
1. [BENEFIT] → [filename] (rated: Great)
   Why: …
2. [BENEFIT] → [filename] (rated: Usable)
   Why: …
   💡 Could be even better if: …
\`\`\`

### 2e. Save to memory
Persist every screenshot's path + rating + assessment + the confirmed pairings. Record retake notes so future runs don't lose context.

---

## PHASE 3 — BRAND COLOUR (automatic)

Don't ask the user to pick one. **Use \`pick_brand_color\`, NOT raw \`extract_palette\`** — the picker has stricter filters that reject washed-out, near-white, near-black, and UI-blending hits, and falls back to a per-domain default when no palette colour survives. \`extract_palette\` returning the dominant UI colour (e.g. white on a white-dominated app) was the #1 brand-picker failure mode before this tool existed.

\`\`\`
pick_brand_color({
  image: <one or several representative simulator screenshot paths>,
  domain: "<finance | fitness | games | productivity | wellness | …>" // pass if known
})
\`\`\`

The result includes:
- \`picked\` — the chosen hex with reasoning
- \`rejected\` — every candidate that failed (saturation, luminance, distance from UI dominant) with the reason
- \`source\` — \`"palette"\` (real candidate found) or \`"domain-fallback"\` (UI was too white/grey, used the domain default)

Present the choice in one sentence with the reasoning. The user can override; don't ask as a question. **Save the colour to memory** before generating.

---

## PHASE 4 — GENERATION

**Preferred path: ONE \`render_aso_set\` call.** This bundles the locked-in recipe and renders every benefit in the set with identical scale/y/offsetY/sizes — set-wide consistency is impossible to drift. Use this unless the user wants per-screenshot creative variance.

\`\`\`
render_aso_set({
  benefits: [
    { image: "<sim path>", verb: "TRACK", descriptor: "ATS SCORES INSTANTLY" },
    { image: "<sim path>", verb: "GENERATE", descriptor: "AI COVER LETTERS" },
    …
  ],
  output_dir: "./screenshots/final",
  brand_color: "<hex from Phase 3 — or omit to auto-derive>",
  domain: "<same domain you passed to pick_brand_color>",
  output_device: "iphone-6.9",
  showcase: true,
  showcase_caption: "<github URL or app name — optional>"
})
\`\`\`

The tool returns paths to every screenshot + the showcase. **Save the result to memory after the call** so future runs can resume.

### Fall-back: per-screenshot \`render_screenshot\`

Only loop \`render_screenshot\` manually when the user explicitly wants per-screenshot creative variance (different position, different decoration per slot, etc.). When you do, read these resources first:
- \`appscreen://design-guide\` — read the **"Canvas math"**, **"ASO Action-Verb Format"**, and **"Source-frame selection rule"** sections.
- \`appscreen://presets\` — for valid font names and output device sizes.

### 4a. The ACTION-VERB ASO format (apply to every screenshot)
**Battle-tested numbers — do NOT improvise.** These were proven on Kaabil after 60+ wasted renders calibrated against text-overlap and empty-space gotchas. The full canvas math + gotchas table lives in \`appscreen://design-guide\` — re-read the "Canvas math" and "ASO Action-Verb Format" sections before each render.

Compose every \`render_screenshot\` call with:

- \`headline\`: the single ACTION VERB (e.g. "TRACK"). UPPERCASE.
- \`subheadline\`: the descriptor (e.g. "TRADING CARD PRICES"). UPPERCASE.
- \`text.position: "top"\`, \`text.offsetY: 8\` (it's percent — \`80\` would push text to the BOTTOM)
- \`text.font: "Plus Jakarta Sans"\` / \`"Manrope"\` / \`"Inter"\` / \`"Sora"\`
- \`text.headlineWeight: "800"\` or \`"900"\`, \`text.subheadlineWeight: "600"\`–\`"700"\`
- \`text.headlineSize: 88\` (4–5 short words) or \`84\` (5+ longer words). 1–2 word verbs can go to 110.
- \`text.subheadlineSize: 38–40\` — **never higher**, it competes with the verb.
- \`text.headlineColor: "#ffffff"\` (or \`"#1a1a1a"\` if the brand colour is light); \`text.subheadlineColor\`: a brand-tinted off-white or solid white.
- \`text.headlineLetterSpacing: -2\` to \`-2.5\`
- \`text.headlineMaxWidthPct: 82\` (forces 2-line wrap)
- \`text.lineHeight: 96\`–\`100\`
- \`text.headlineTextAlign: "center"\`
- \`background\`: solid brand colour OR a 2-stop gradient with \`noiseIntensity: 6–8\`. **No glow on background.**
- \`screenshot.scale: 73\` (locked — don't deviate)
- \`screenshot.x: 50\`, \`screenshot.y: 80\` (locked — \`y: 80\` puts device top at ~35%, just below the headline. \`y: 100\` is WRONG, it pushes the device higher and overlaps text.)
- \`screenshot.shadow: { enabled: true, blur: 80–100, opacity: 25–60, y: 30–40 }\` — tint with a brand-darker hex for vibrant looks.
- \`screenshot.glow\`: SKIP for flat-colour SETs. Only enable for 3D / premium archetypes.
- \`mode: "2d"\` (or \`"3d"\` ONLY if you also set \`screenshot.use3D: true\` AND \`screenshot.device3D: "iphone"\` — \`mode\` alone isn't enough).
- \`output_device\`: \`"iphone-6.9"\` (1320×2868) is the App Store-required size. Pick ONE and use it for the entire set.

**Do NOT use \`position_preset\` for App Store work** — it's too coarse and routinely places the device under the text. Always set \`screenshot.scale\`, \`x\`, \`y\` explicitly.

### 4b. Render each pair
For each (benefit, simulator screenshot) pair:
1. Call \`render_screenshot\` with the ASO format settings above + the user's simulator screenshot as \`image\`.
2. Write the output to \`screenshots/final/0N-<benefit-slug>.png\`.
3. After each render, save to memory: benefit, output path, simulator screenshot used, status (rendered / approved). Don't wait until the end — incremental persistence is the whole point of this workflow.
4. Show the user the output. Iterate if they want changes (tweak letter-spacing, scale, shadow, etc.).

### 4c. Set-wide consistency (CRITICAL)
The set MUST look like one cohesive series:
- **Same** brand colour on every screenshot
- **Same** font, weight, sizes
- **Same** device frame, scale, position
- **Same** text position (top) and offsetY
The first approved screenshot is the visual template — match its choices on every subsequent render.

---

## PHASE 5 — SHOWCASE

Once every screenshot in \`screenshots/final/\` is approved:

\`\`\`
make_showcase({
  screenshots: ["screenshots/final/01-*.png", ...],
  output_path: "screenshots/showcase.png",
  caption: "<github URL or app name — optional>"
})
\`\`\`

Show the showcase to the user with the Read tool. Tell them which App Store Connect display-size slot the set fits into (e.g. "iPhone 6.7\\" — 1290×2796 — fits the 6.7\\" slot").

---

## KEY PRINCIPLES (apply throughout)
- **Benefits over features** — "BOOST ENGAGEMENT" not "ADD SUBTITLES"
- **Specific over generic** — "TRACK CARD PRICES" not "MANAGE STUFF"
- **Action-oriented** — every headline starts with a strong verb
- The first screenshot is the most important — it must communicate the single biggest reason to download
- The set should tell a story when swiped through
- Pair the most visually impactful simulator screenshot with the most important benefit
- Never use empty states, loading screens, or settings pages
- Save to memory after every confirmed step — this skill is designed to resume

Now start with PHASE 0 (recall). Then proceed.`;

  return {
    description: "Full ASO workflow — benefits, screenshots, brand colour, render, showcase",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function makeVideoPrompt(args: Record<string, string>) {
  const text = `You are helping the user produce a polished product video from their app screenshots.

${args.app_name ? `**App:** ${args.app_name}` : "**App:** infer from the screenshots."}
${args.screenshot_count ? `**Screenshots available:** ${args.screenshot_count}` : ""}
${args.mood ? `**Mood hint:** ${args.mood}` : ""}

**HARD RULES — read before doing anything:**
- Do NOT write a TypeScript / JavaScript / Python / shell script to "build the video". The MCP server already exposes the full pipeline. Your only job is to call the right tool with the right arguments.
- Do NOT use the Write/Edit/Bash tools to create rendering code. The MCP tools ARE the implementation.
- Do NOT propose installing extra dependencies or writing a wrapper. The MCP handles browser, renderer, ffmpeg, and concat itself.
- The ONLY scripting fallback is if the MCP is genuinely missing the capability — at that point, tell the user the MCP isn't set up correctly and stop. Don't roll your own.

**Decision tree — pick the right tool:**

A. **User gave a one-line brief or a vibe** (e.g. "make me a premium fintech video", "fun gaming reel, energetic", "turn these screenshots into a product video") → **call \`auto_video\` directly with the user's screenshots, the brief in \`prompt\`, and \`app_name\` if known. ONE call, no back-and-forth.** This is the most common path.

B. **User explicitly wants to pick the template themselves** ("show me the options", "let me choose") → call \`list_video_templates\`, present the options grouped by mood, ask which one, then call \`render_video_template\` (or \`auto_video\` with \`template\` set if you want auto-headlines on a chosen template).

C. **User wants a fully custom storyboard** ("I want to design my own scenes", "let me write the storyboard") → use \`render_video_concept\` (advanced — you author every act yourself).

**Workflow for path A (default):**

1. Resolve absolute paths for the user's screenshots.
2. Decide an \`output_path\` — somewhere the user can find (e.g. \`./<app>-hero.mp4\`). Ask if not obvious.
3. Call \`auto_video\` with \`{ images, output_path, prompt: "<one-line vibe>", app_name? }\`.
4. The tool returns \`{ path, template_chosen, reasoning, headlines_used, source }\`. \`source\` is "llm" / "keyword" / "fallback" / "user".
5. Brief the user in 3 short lines:
   - Which template was picked + the one-line reasoning.
   - The headline arc (just the headlines, comma-separated).
   - The output path. Offer one tweak ("want it more dramatic?" / "different ending?").

**Workflow for path B (user wants to pick):**

1. **Call \`list_video_templates\`.** Returns an array of templates, each with \`{ slug, name, style, scenes, total_seconds, ideal_screens, fps }\`.

2. **Present the options to the user as a compact, scannable list.** Group by mood when helpful. Format example:

   > Here are the video templates I can render. Which one do you want?
   >
   > **Cinematic / dramatic**
   > - \`cinematic-story-arc\` — Three-act emotional arc with slow reveals (16s, 5 scenes, 4 screens)
   > - \`gravity-drop\` — Phone freefalls into frame with realistic bounce (14s, 4 scenes, 4 screens)
   > - \`dolly-zoom\` — Hitchcock-style perspective shift on a single hero shot (12s, 3 scenes, 1 screen)
   >
   > **Clean / minimal**
   > - \`isometric-showcase\` — Devices arranged on isometric plane, architectural precision (16s, 6 scenes, 6 screens)
   > - \`carousel-flow\` — Screens slide horizontally like a carousel (15s, 5 scenes, 5 screens)
   >
   > **Playful / energetic**
   > - \`neon-pulse\` — Synthwave glow pulses sync with screen swaps
   > - \`liquid-morph\` — Screens morph between each other like liquid
   >
   > _Tell me which template (e.g. "let's go with gravity-drop") or describe the vibe and I'll pick._

3. **If the user picks one** → use it. **If the user describes a vibe** ("something dramatic", "premium and slow", "energetic") → recommend ONE template that matches and explain in one sentence why. Wait for confirmation OR proceed if they said "you pick".

4. **Match shots to template.** A template's \`ideal_screens\` is the screen count it was designed for. If the user has fewer, the renderer cycles them automatically — that's fine. If they have more, the extras are dropped.

5. **Compose headlines.** One per scene, in scene order, ≤4 words each. Read each user screenshot and write a benefit-driven headline that fits THAT screen — don't write generic "Welcome" / "Powered by AI" filler. If the user gave you an app name, the LAST scene's headline can be the app name itself (CTA).

6. **Call \`render_video_template\`** with:
   - \`template\`: the chosen slug
   - \`images\`: absolute paths to the user's screenshots
   - \`output_path\`: e.g. \`./hero.mp4\` (ask the user if not implied)
   - \`app_name\`: if provided
   - \`headlines\`: your per-scene headlines (the renderer auto-clips to ≤4 words)
   - Optional: \`subheadlines\`, \`gradient\` / \`accent\` / \`font\` overrides if the user requested a tweak

7. **After it renders, brief the user in 3 short lines:**
   - Which template you used and the headline arc you wrote
   - Total duration and output path
   - Offer one tweak ("want it darker?" / "want a different ending?")

**Hard rules:**
- Don't hand-author a custom storyboard via \`render_video_concept\` unless the user explicitly says "I want to design my own". The named templates are battle-tested for product videos; custom concepts are advanced.
- Don't pad headlines past 4 words — the renderer clips them anyway and you'll get awkward truncation.
- Don't pick a template that needs 6 screens when the user gave you 2 (the cycle works but the editorial intent is lost). For 1–2 screens prefer \`dolly-zoom\`, \`macro-lens\`, \`neon-pulse\`. For 3–4 prefer \`gravity-drop\`, \`carousel-flow\`, \`holographic-flip\`. For 5+ prefer \`isometric-showcase\`, \`conveyor-belt\`, \`cinematic-story-arc\`.
- Confirm the \`output_path\` is somewhere the user can find it (don't write to /tmp without saying so).

Now do step 1.`;

  return {
    description: "Pick a named video template and render it",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function cloneTemplatePrompt(args: Record<string, string>) {
  const text = `You are CLONING a reference App Store screenshot template using the user's own screenshot.

You have TWO images in this conversation:
- **Reference template** — the polished marketing image whose design you must reproduce.
- **User's screenshot** — the RAW phone-screen UI to put inside the device frame.

${args.app_name ? `**User's app:** ${args.app_name}` : "**User's app:** infer from the user's raw screenshot."}
${args.language ? `**Language:** ${args.language}` : "**Language:** en"}

**Goal:** the rendered output must visually MATCH the reference template — same gradient mood, same typography feel, same device position, same depth flourish — but with the user's UI inside the phone and the headline retoned for the user's app.

---

## Workflow (do every step)

### 1. Extract the palette ACCURATELY
Call \`extract_palette\` on the reference image with \`count: 5\`. **Don't eyeball hex codes** — they're rarely close enough.

The tool returns:
- top dominant colors with shares
- a \`suggested_gradient\` (3 stops, dark→light by luminance)

Use \`suggested_gradient\` directly as your \`background.gradient\` unless the reference has a clearly different gradient direction (e.g. radial, or angle is obviously not 145°).

### 2. Read \`appscreen://design-guide\` and \`appscreen://presets\`.

### 3. Visually parse the reference (LOOK at it). Extract these 8 things:

| Element | What to read off the reference |
|---|---|
| Background type | Gradient (linear), solid, or image with overlay? |
| Gradient stops | From \`extract_palette\` (don't eyeball). |
| Gradient angle | Eyeball: 90 (top→bottom), 180 (top→bottom inverted), 145 (diagonal), etc. |
| Phone position | scale (% of canvas), x (% horizontal, ~50 default), y (% vertical, 50=center). Tilt/rotation if visible. |
| Device mode | 2D flat, or 3D angled (rotation3D)? |
| Glow / aura | Does the device have a soft halo? What color? |
| Decoration | Big number behind? Big word? Dotted grid? Blobs? Stripe? |
| Typography | Headline font category (geometric sans, humanist sans, serif, display) — pick from \`fontFamilies\`. Weight (700/800/900). Size (90 = small, 130 = mid, 160+ = big hero). Letter spacing (-3 = very tight, 0 = normal). Alignment. Highlight word? Gradient text fill? |

### 4. Retone the headline for the user's app.
Don't copy the reference's literal headline. Read the user's screenshot, write a NEW headline that fits the user's app — but keep the **same tone, length, and structure** as the reference.

Examples of "same tone, different content":
- Reference says "Beautiful by default" → user makes a fitness app → "Stronger every week"
- Reference says "Built for engineers" → user makes a finance app → "Built for your goals"
- Reference says "AI Resume Builder for ATS" with highlightWord "ATS" → user makes a meditation app → "Quiet your mind in 5 minutes" with highlightWord "5"

### 5. Compose the render_screenshot call.
Pass:
- \`image\`: USER's raw screenshot (the inner UI).
- \`reference_image\`: the reference path (for traceability).
- \`background.gradient\`: from \`extract_palette\` (or palette-derived if you adjusted angle).
- \`screenshot.scale\`, \`screenshot.x\`, \`screenshot.y\`, \`screenshot.rotation3D\`: matched to the reference.
- \`screenshot.glow\` if the reference has one — color = the reference's accent (a saturated color from the palette).
- \`screenshot.decoration\` if the reference has one.
- \`text.font\`, \`text.headlineWeight\`, \`text.headlineSize\`, \`text.headlineLetterSpacing\`, \`text.headlineMaxWidthPct\`, \`text.lineHeight\`, \`text.headlineToSubheadlineGap\`: matched to the reference's typography feel.
- \`text.headline\`, \`text.subheadline\`: retoned for the user's app.
- If the reference highlights a word in a different color → set \`text.headlineHighlightWord\` + \`text.headlineHighlightColor\`.
- If the reference uses a gradient text fill → \`text.headlineGradient\`.

### 6. After rendering, briefly tell the user (3-5 lines):
- What design elements you cloned (e.g. "matched the dark synthwave gradient, kept the 3D tilt + purple glow").
- What you retoned (e.g. "rewrote the headline to fit a meditation app while keeping the highlight-word pattern").
- The output path.

---

## Hard rules (do not skip)

1. **Always call \`extract_palette\` on the reference first.** Eyeballing hex values produces 60-70% accuracy; the tool gives you 95%+.
2. **Never copy the reference's literal headline copy** — retone it for the user's actual app.
3. **The reference's framed phone is NOT the input image.** The input is the user's RAW phone-screen UI (no wrapper, no bg). If the user shares an already-finished marketing screenshot as their "screenshot," tell them you need the raw inner-UI export.
4. **Match the reference's vibe, not its pixel data.** Don't try to perfectly reproduce subtle gradients you can't read precisely — use the dominant palette.
5. **If the reference has a feature you can't reproduce** (e.g. illustrated mascot, hand-drawn elements, photo background not in the palette), call it out in the explanation rather than approximating poorly.

Now do it.`;

  return {
    description: "Clone a reference App Store screenshot template",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function designVideoConceptPrompt(args: Record<string, string>) {
  const duration = args.duration ? parseFloat(args.duration) : 6;
  const tone = (args.tone || "premium").toLowerCase();
  const app = args.app_name ? `**App:** ${args.app_name}` : "**App:** infer from the screenshot.";

  const text = `You are designing a PRODUCT VIDEO storyboard.

${app}
**Total duration:** ${duration}s
**Tone:** ${tone}

**Workflow you MUST follow:**

1. Read \`appscreen://design-guide\` (especially the Motion section) and \`appscreen://presets\`.
2. Look at the input screenshot. Decide the static design (gradient, font, weight, glow color) — this becomes \`concept.base\`.
3. Write a 3–5 act STORYBOARD. Don't render until you have the storyboard.
4. Each act has its OWN duration, motion keyframes, and text with fade timing.
5. Text fade is INDEPENDENT of motion — copy can fade in while the device holds still, then hold, then fade out before the next act.
6. Call \`render_video_concept\` with the full concept.
7. Briefly explain the storyboard to the user (one sentence per act).

**Storyboard rules (do not violate):**
- Acts join via \`transition: { kind: "crossfade", duration: 0.4 }\` for premium feel, or \`"cut"\` for hard transitions.
- Headlines should never appear AT the same instant a big motion starts — let motion settle first, then fade text in.
- Each headline should hold for at least 1.0s with motion calm before transitioning.
- For ${duration}s total: aim for 3–4 acts. <4s: 2–3 acts. >8s: 4–5 acts.
- The first act is the REVEAL: phone enters from off-axis, scales up, headline starts at fade_in 0.5+ (text waits for motion to settle).
- The last act is the EXIT or CTA: either fade everything out, OR scale phone larger and replace headline with a call to action.
- Use \`screenshot.glow\` as a near-constant in \`base\`. Subtle pulse is fine via per-act intensity changes, but don't toggle it on/off.

**Example concept for a 6s premium reveal video:**

\`\`\`json
{
  "image": "/abs/path/to/screenshot.png",
  "output_path": "./hero.mp4",
  "fps": 30,
  "format": "mp4",
  "concept": {
    "base": {
      "mode": "3d",
      "background": { "type": "gradient", "gradient": { "angle": 145, "stops": [
        { "color": "#0a0a0f", "position": 0 },
        { "color": "#1a1033", "position": 50 },
        { "color": "#0d1b2a", "position": 100 }
      ]}},
      "screenshot": {
        "scale": 75, "x": 50, "y": 55,
        "glow": { "enabled": true, "color": "#7c3aed", "intensity": 65, "size": 90 },
        "shadow": { "enabled": true, "blur": 110, "opacity": 55, "y": 40 }
      },
      "text": {
        "font": "Inter", "headlineWeight": "800", "headlineSize": 145,
        "headlineLetterSpacing": -2, "headlineMaxWidthPct": 70, "lineHeight": 100,
        "subheadlineMaxWidthPct": 75, "subheadlineWeight": "500", "subheadlineOpacity": 88,
        "headlineToSubheadlineGap": 40
      },
      "headline": "Beautiful by default",
      "subheadline": "Pixel-perfect screenshots, every time"
    },
    "acts": [
      {
        "name": "Reveal",
        "duration": 1.6,
        "motion": [
          { "t": 0,   "decision": { "screenshot": { "scale": 60, "y": 65, "rotation3D": { "x": 0, "y": 35, "z": 0 } } } },
          { "t": 1.0, "decision": { "screenshot": { "scale": 75, "y": 55, "rotation3D": { "x": -8, "y": 18, "z": 0 } } } }
        ],
        "text": { "fade_in": 0.6, "fade_out": 0 },
        "transition": { "kind": "crossfade", "duration": 0.3 }
      },
      {
        "name": "Hold + glow pulse",
        "duration": 2.0,
        "motion": [
          { "t": 0,   "decision": { "screenshot": { "scale": 75, "y": 55, "rotation3D": { "x": -8, "y": 18, "z": 0 }, "glow": { "intensity": 65 } } } },
          { "t": 0.5, "decision": { "screenshot": { "glow": { "intensity": 85 } } } },
          { "t": 1.0, "decision": { "screenshot": { "glow": { "intensity": 65 } } } }
        ],
        "text": { "fade_in": 0, "fade_out": 0 },
        "transition": { "kind": "crossfade", "duration": 0.4 }
      },
      {
        "name": "Pivot to CTA",
        "duration": 1.4,
        "motion": [
          { "t": 0,   "decision": { "screenshot": { "scale": 75, "y": 55, "rotation3D": { "x": -8, "y": 18, "z": 0 } } } },
          { "t": 1.0, "decision": { "screenshot": { "scale": 80, "y": 52, "rotation3D": { "x": -5, "y": 0, "z": 0 } } } }
        ],
        "text": {
          "headline": "Ready to ship",
          "subheadline": "Tap to install",
          "fade_in": 0.3, "fade_out": 0
        },
        "transition": { "kind": "cut" }
      },
      {
        "name": "Exit",
        "duration": 1.0,
        "motion": [
          { "t": 0, "decision": { "screenshot": { "scale": 80, "y": 52, "rotation3D": { "x": -5, "y": 0, "z": 0 } } } },
          { "t": 1, "decision": { "screenshot": { "scale": 90, "y": 50, "rotation3D": { "x": 0, "y": 0, "z": 0 } } } }
        ],
        "text": { "fade_in": 0, "fade_out": 0.6 }
      }
    ]
  }
}
\`\`\`

**What this example does:**
- Act 1 (Reveal, 1.6s): phone enters from y=65, rotated 35° away. Text fade_in 0.6 means text waits 60% of the act before appearing — so motion finishes, THEN text fades in. Crossfade into act 2.
- Act 2 (Hold + pulse, 2s): phone is still. Glow pulses 65 → 85 → 65. Text holds. This is the "let the user read" beat.
- Act 3 (Pivot to CTA, 1.4s): phone tilts to face camera (rotation3D y → 0). Headline morphs to "Ready to ship". fade_in 0.3 keeps text smooth.
- Act 4 (Exit, 1s): phone scales up + flattens. Text fades out (fade_out 0.6 means last 60% of act fades).

Now: write the storyboard, render it, briefly explain.`;

  return {
    description: "Design a product video storyboard",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function designOnePrompt(args: Record<string, string>) {
  const presets = await listPresets();
  const moods = renderMoodTable(presets.gradientPresets.map((g) => g.name));
  const positions = Object.entries(presets.positionPresetDetails)
    .map(([name, p]) => `  - **${name}** — scale ${p.scale}, x ${p.x}, y ${p.y}, rotation ${p.rotation}, perspective ${p.perspective}`)
    .join("\n");

  const text = `You are designing ONE App Store screenshot.

${args.app_name ? `**App:** ${args.app_name}` : "**App:** infer from the screenshot."}
${args.hints ? `**Hints:** ${args.hints}` : ""}
${args.language ? `**Language:** ${args.language}` : "**Language:** en"}

**Workflow you must follow:**

1. Read the resource \`appscreen://design-guide\` for the design rules — pay special attention to the "Canvas math (battle-tested)" section. The y/offsetY semantics are counter-intuitive and the #1 cause of botched layouts.
2. Read \`appscreen://presets\` to see the exact gradient names available.
3. Look at the input screenshot. Decide:
   - What does the app do? What is this specific screen showing?
   - What ONE benefit should the headline communicate?
   - Does this screen call for 2D (default) or 3D (rare, hero only)?
4. **Prefer explicit \`screenshot.scale\` / \`x\` / \`y\` over \`position_preset\`** for App Store output — presets are too coarse and overlap text routinely. The locked-in App Store recipe is \`scale: 73, x: 50, y: 80\` + \`text.offsetY: 8\`. Only fall back to a position preset if the user explicitly wants a non-App-Store layout (web hero, social).
   Available position presets if you do need one:
${positions}
5. Pick a background gradient whose mood matches the app:
${moods}
6. Decide \`text_color\` ("light" on dark gradients, "dark" on light pastels).
7. **Headline + subheadline sizing for the 1320 canvas (don't deviate without a reason):**
   - \`text.headlineSize: 88\` (4–5 short words) / \`84\` (longer words) / \`110\` (1–2 word hero)
   - \`text.subheadlineSize: 38–40\` — never higher
   - \`text.headlineWeight: "700"\`–\`"900"\`, \`text.headlineLetterSpacing: -2\` to \`-2.5\`
   - \`text.headlineMaxWidthPct: 82\` to force 2-line wrap
8. Optional fine controls:
   - \`text.font\`: e.g. \`"Plus Jakarta Sans"\` or \`"Manrope"\` for friendly, \`"Sora"\` / \`"Inter"\` for premium
   - \`screenshot.shadow\`: \`blur 80-100, opacity 25-60, y 30-40\`. Tint with a brand-darker hex for vibrant looks.
   - \`screenshot.glow\`: only for hero / 3D archetypes
   - \`screenshot.rotation3D\`: e.g. \`{x: 0, y: -8, z: 0}\` if mode is "3d" — and remember \`mode: "3d"\` ALONE isn't enough; you must ALSO set \`screenshot.use3D: true\` AND \`screenshot.device3D: "iphone"\`.
9. Call \`render_screenshot\` with your choices and an \`output_path\`.
10. Briefly explain why you made each choice (1 sentence per major decision).

**Headline rules:**
- 2–7 words, benefit-driven, no period at end.
- Must reflect what THIS specific screenshot shows.
- Avoid generic filler like "Welcome to X" or "Powered by AI".

**Subheadline:** include only if it materially adds to the headline. Empty string is fine.
`;

  return {
    description: "Design one App Store screenshot",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function designSetPrompt(args: Record<string, string>) {
  const count = parseInt(args.count || "5", 10);

  const text = `You are designing a SET of ${count} App Store screenshots that share a visual language.

${args.app_name ? `**App:** ${args.app_name}` : "**App:** infer from the screenshots."}
${args.language ? `**Language:** ${args.language}` : "**Language:** en"}

**Cohesion rules — pick once, apply to all:**
1. Same background family (e.g. all dark Synthwave-leaning, or all calm Reef Lagoon-family).
2. Same font and weight for headlines across all screenshots.
3. Same text \`position\` (top vs bottom) unless one screenshot benefits dramatically from the flip.
4. Headlines should TELL A STORY in sequence, not stand alone:
   - Screenshot 1: the hook ("Sleep better tonight")
   - Screenshot 2: the mechanism ("Smart wind-down rituals")
   - Screenshot 3: the proof ("See your sleep score climb")
   - Screenshot 4: a feature highlight
   - Final screenshot: the call to action ("Start sleeping smarter")
5. Vary position presets across the set so it doesn't look monotonous, but stay in the same family
   (e.g. \`bleed-bottom\` for hooks, \`tilt-left\` / \`tilt-right\` for features).

**Workflow:**
1. Read \`appscreen://design-guide\` and \`appscreen://presets\`.
2. Look at all input screenshots together. Plan the storyboard.
3. Decide the shared visual language (background family, font, weight, text color).
4. Render each screenshot in turn via \`render_screenshot\`, varying only the headline,
   subheadline, and position preset.
5. After all renders, summarize the storyline and choices in 3 short bullets.
`;

  return {
    description: "Design a cohesive App Store screenshot set",
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

function renderMoodTable(gradientNames: string[]): string {
  const buckets: Record<string, string[]> = {
    "Dark / serious / finance": [
      "Midnight Abyss", "Obsidian Plum", "Carbon Slate", "Steel Blue", "Gold Noir", "Velvet Noir", "Deep Ocean",
    ],
    "Energetic / social": [
      "Synthwave Dusk", "Electric Surge", "Pacific Sunset", "Volcanic Dawn", "Neon Horizon", "Ember Glow",
    ],
    "Calm / wellness": [
      "Morning Mist", "Sage Whisper", "Reef Lagoon", "Northern Lights",
    ],
    "Premium / lifestyle": [
      "Indigo Rush", "Royal Navy", "Deep Forest", "Mocha Silk", "Emerald Canopy",
    ],
    "Warm / lifestyle": [
      "Desert Dusk", "Golden Hour", "Ocean Pulse",
    ],
  };
  const lines: string[] = [];
  for (const [bucket, names] of Object.entries(buckets)) {
    const present = names.filter((n) => gradientNames.includes(n));
    if (present.length) lines.push(`  - **${bucket}**: ${present.join(", ")}`);
  }
  return lines.join("\n");
}
