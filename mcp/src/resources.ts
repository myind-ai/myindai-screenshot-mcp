import { listPresets, type PresetCatalog } from "./renderer/render.js";
import { describeAssetLibrary } from "./tools/assets.js";
import { listMemoryNamespaces } from "./tools/memory.js";

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceDescriptor[] = [
  {
    uri: "myindai://presets",
    name: "Available presets (gradients, positions, fonts)",
    description:
      "The full catalog of gradients, position presets, font families, weights, and output device sizes the renderer supports. Read this BEFORE calling render_screenshot so you use valid names.",
    mimeType: "application/json",
  },
  {
    uri: "myindai://schema",
    name: "render_screenshot input schema (full)",
    description:
      "Detailed JSON schema for the render_screenshot tool, including all nested fields (background, screenshot, text, shadow, frame, 3D rotation). Read this when you need fine control beyond the high-level fields.",
    mimeType: "application/json",
  },
  {
    uri: "myindai://design-guide",
    name: "App Store screenshot design guide",
    description:
      "Battle-tested guidance for App Store screenshots: copy length, position-preset cookbook, when to use 3D, color theory, contrast rules, font pairing, depth/shadow do's-and-don'ts.",
    mimeType: "text/markdown",
  },
  {
    uri: "myindai://assets",
    name: "Bundled asset library",
    description:
      "List of bundled accent shapes, decorations, device tints, and patterns. Each is an inline SVG that can be tinted via `get_asset` and dropped into a render. Read first, then call `get_asset` to fetch a specific asset by id.",
    mimeType: "text/markdown",
  },
  {
    uri: "myindai://memory",
    name: "Skill memory namespaces",
    description:
      "List of persisted skill-memory namespaces and their on-disk size + last-modified time. Use `memory_read` / `memory_write` tools to interact with the contents.",
    mimeType: "application/json",
  },
];

export async function readResource(uri: string): Promise<{
  uri: string;
  mimeType: string;
  text: string;
}> {
  if (uri === "myindai://presets") {
    const presets = await listPresets();
    const summary = summarizePresets(presets);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(summary, null, 2),
    };
  }

  if (uri === "myindai://schema") {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(FULL_SCHEMA, null, 2),
    };
  }

  if (uri === "myindai://design-guide") {
    return { uri, mimeType: "text/markdown", text: DESIGN_GUIDE };
  }

  if (uri === "myindai://assets") {
    return { uri, mimeType: "text/markdown", text: describeAssetLibrary() };
  }

  if (uri === "myindai://memory") {
    const namespaces = await listMemoryNamespaces();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          namespaces,
          tools: ["memory_read", "memory_write"],
          note: "Default namespace is the cwd basename slug. Override MCP_MEMORY_DIR to change the on-disk location.",
        },
        null,
        2
      ),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function summarizePresets(p: PresetCatalog) {
  return {
    contractVersion: p.contractVersion,
    canvasDimensions: p.canvasDimensions,
    positionPresets: p.positionPresetDetails,
    gradients: p.gradientPresets.map((g) => ({
      name: g.name,
      preview: g.gradient,
    })),
    modes: p.modes,
    textPositions: p.textPositions,
    fontFamilies: p.fontFamilies,
    fontWeights: p.fontWeights,
    backgroundTypes: p.backgroundTypes,
    imageFits: p.imageFits,
    outputDevices: p.outputDevices,
  };
}

const FULL_SCHEMA = {
  $description:
    "Full structure accepted by render_screenshot. All fields except `image` are optional; unset fields keep app defaults.",
  image: "string — file path | data: URL | base64 (required)",
  language: "string — e.g. 'en', 'de', 'ja'. Default 'en'.",
  output_device:
    "'iphone-6.9' | 'iphone-6.7' | 'iphone-6.5' | 'iphone-5.5' — affects canvas resolution.",
  output_path: "string — if set, writes PNG to disk and returns path.",
  // High-level shortcuts
  headline: "string",
  subheadline: "string",
  mode: "'2d' | '3d'",
  position_preset:
    "'centered' | 'bleed-bottom' | 'bleed-top' | 'float-center' | 'tilt-left' | 'tilt-right' | 'perspective' | 'float-bottom'",
  background_preset: "string — gradient name from myindai://presets",
  text_color: "'light' | 'dark'",
  // Detailed overrides
  background: {
    type: "'gradient' | 'solid' | 'image'",
    gradient: {
      angle: "0..360",
      stops: "[{color: '#rrggbb', position: 0..100}, ...] (min 2)",
    },
    solid: "'#rrggbb'",
    overlayColor: "'#rrggbb'",
    overlayOpacity: "0..100",
    blur: "0..40",
    noise: "boolean",
    noiseIntensity: "0..100",
  },
  screenshot: {
    scale: "0..200 — % size of the device on canvas",
    x: "-50..150 — horizontal % position",
    y: "-50..150 — vertical % position",
    rotation: "-180..180 — 2D rotation degrees",
    perspective: "0..45 — 3D-ish tilt for 2D mode",
    cornerRadius: "0..120 — only used when 3D is off",
    use3D: "boolean — overrides `mode`",
    device3D: "'iphone' | 'samsung'",
    rotation3D: { x: "-180..180", y: "-180..180", z: "-180..180" },
    shadow: {
      enabled: "boolean",
      color: "'#rrggbb'",
      blur: "0..200",
      opacity: "0..100",
      x: "-200..200",
      y: "-200..200",
    },
    frame: {
      enabled: "boolean — 2D-only border",
      color: "'#rrggbb'",
      width: "0..80",
      opacity: "0..100",
    },
  },
  text: {
    headline: "string",
    subheadline: "string",
    position: "'top' | 'bottom'",
    offsetY: "-100..100 — extra vertical offset (px units in app)",
    lineHeight: "50..250 — % line height",
    font: "string — family name (e.g. 'Inter') applies to both",
    headlineFont: "string",
    subheadlineFont: "string",
    headlineSize: "20..300 — % of base size (100 ≈ default)",
    subheadlineSize: "20..300",
    headlineWeight: "'300'..'900'",
    subheadlineWeight: "'300'..'900'",
    headlineItalic: "boolean",
    headlineUnderline: "boolean",
    headlineStrikethrough: "boolean",
    subheadlineItalic: "boolean",
    subheadlineUnderline: "boolean",
    subheadlineStrikethrough: "boolean",
    headlineColor: "'#rrggbb'",
    subheadlineColor: "'#rrggbb'",
    subheadlineOpacity: "0..100",
  },
};

const DESIGN_GUIDE = `# App Store Screenshot Design Guide — Pro Edition

You're composing a 1290×2796 (iPhone 6.7) or 1320×2868 (iPhone 6.9) marketing image. The viewer
will look at it for ~1 second in a sea of competitors. **A 1/10 screenshot is "phone on a gradient,
small caption headline." A 10/10 screenshot uses 8-12 deliberate design decisions.** Use this guide
as a checklist — don't skip steps.

## The pro pipeline (do all of this, every time)

1. **Look at the screenshot.** What is THIS app, on THIS specific screen? What's the one thing the
   user should learn in 1 second?
2. **Extract the screenshot's dominant color.** That color drives everything: glow, custom gradient
   stops, accent for highlight word.
3. **Pick a Named Look** from the library below — don't compose from scratch.
4. **Write the headline as a benefit, not a feature.** Then make it BIG.
5. **Apply the headline upgrade** (weight ≥ 800, size 130-180, max-width 60-75%, line-height 95-105).
6. **Pick exactly ONE depth flourish** — glow OR decoration. Not both.
7. **Verify contrast.** If the headline isn't crystal clear at thumb size, fix it.

---

## Hard rules (non-negotiable)

- \`text.headlineWeight: "800"\` or \`"900"\` for hero headlines. **Never** "400" or "500" on a hero.
- \`text.headlineSize: 130-180\`. Default 100 is too small.
- \`text.headlineMaxWidthPct: 60-75\` so the headline stacks into 2-3 lines (a single long line looks like a caption).
- \`text.lineHeight: 95-105\`. Default 110 makes stacked headlines feel loose.
- \`text.subheadlineSize: 60-80\`. **Never below 56** — anything smaller reads as a footnote, not a subheadline. The body of the user's screenshot is already ~30-40px; a 46px subheadline on a 1290-px-wide canvas disappears.
- \`text.subheadlineOpacity: 80-90\`. Default 75 looks washed out.
- \`text.subheadlineWeight: "500"\` or \`"600"\`. **Never** "400" on a hero.
- Always pass **custom gradient stops** derived from the screenshot's colors. Use a preset name only as a last resort.
- Every hero shot gets either a **glow** OR a **decoration**. Plain gradient = amateur.

## Layout density rules (CRITICAL — most "amateur" outputs fail here)

When you compose a hero shot, decide which **layout density** matches the reference. **If you're unsure, use "Tight" — it is the right answer for ~80% of top-100 App Store screenshots.**

### "Tight" — text-on-top, phone hugs the canvas bottom (MyFitnessPal, Duolingo, Headspace, Kaabil) — DEFAULT
The phone sits CLOSE to the text. Almost no dead space between them. **This is the layout you should reach for first; only switch to Floating if the reference visibly has empty canvas around the device.**
- \`text.position: "top"\`, \`text.offsetY: 5-7\` (text starts very close to top edge)
- \`screenshot.scale: 70-78\` (phone fills most of the lower canvas)
- \`screenshot.y: 95-100\` (phone is pulled all the way down so it hugs the canvas bottom)
- \`text.headlineSize: 130-160\`, \`headlineMaxWidthPct: 75-85\` (forces 2-line stack)
- \`text.headlineToSubheadlineGap: 20-40\` (tight inside the text block)
- Result: top 25-30% is text, remaining 70-75% is phone with the phone's bottom edge sitting right at the canvas bottom. ZERO empty space below the device.

**Why \`scale: 88-100\` with \`y: 75-85\` is WRONG**: at scale ≥ 88 the phone is taller than the canvas's "movable" region, so the renderer clamps it close to canvas-center regardless of the \`y\` you pass. The phone ends up overlapping the headline. Stay at \`scale ≤ 78\` for Tight layouts and use \`y\` near 100 to hug the bottom.

**The single most common amateur failure mode**: text-on-top with \`screenshot.y\` left at 50-58 and \`screenshot.scale\` at 70-76. That produces a small phone floating in the middle of the canvas with a strip of empty gradient between the text and the device. If your spec has \`text.position: "top"\` and your \`screenshot.y < 90\`, double-check it's deliberate.

### "Floating" — phone in middle, text at top, lots of breathing room (Apple Marketing, Things 3)
The phone is smaller and centered, with deliberate empty space all around. Used for premium/minimalist apps.
- \`text.position: "top"\`, \`text.offsetY: 7-11\`
- \`screenshot.scale: 65-78\`
- \`screenshot.y: 50-58\` (phone is centered or slightly above)
- Result: text at top, phone centered, breathing room top-and-bottom.

### "Bleed" — phone hangs off the bottom edge (Linear, modern fintech)
- \`screenshot.scale: 95-110\`
- \`screenshot.y: 100-130\` (intentionally past the canvas bottom)
- Top 30-35% is text, bottom is phone bleeding off.

### Picking the right density (from the reference)
- If the reference has **little empty space between text and phone** → use Tight.
- If there's **clearly empty canvas around the device** → use Floating.
- If the phone visibly extends past a canvas edge → use Bleed.

**The most common amateur mistake** is rendering Floating density when the reference is clearly Tight — the result feels disconnected, with a strip of empty gradient between the text and the phone. If in doubt, default to **Tight**.

## Canvas math (battle-tested 2026-04-30 on Kaabil — read before composing)

Before any App Store screenshot render, internalise these. Skipping this section is the #1 cause of text-device overlap and wasted negative space (60+ wasted Kaabil renders proved it).

| Param | What it actually means |
|---|---|
| \`screenshot.scale\` | % of canvas width. \`73\` → device is ~963px wide on the 1320 canvas. |
| \`screenshot.x\` | Horizontal CENTER as % (50 = middle). Values past 100 / below 0 push the device off-canvas — see "Panoramic split" below. |
| \`screenshot.y\` | Vertical CENTER as % of canvas height. **Counter-intuitive: lower y is NOT lower on screen.** \`y: 80\` puts device top at ~35% of canvas (just below the headline). \`y: 58\` puts it at ~13% (will overlap top-anchored text). \`y: 120\` (the \`bleed-bottom\` preset) ends up with device top near the canvas top — name implies bottom-bleed but behaves the opposite way. |
| \`text.offsetY\` | **Percent, not pixels.** Range -100..+100. \`offsetY: 8\` keeps top-anchored text ~8% below canvas top. \`offsetY: 80\` would push text to canvas BOTTOM. |
| \`text.position\` | \`"top"\` anchors the headline at canvas top + offsetY; \`"bottom"\` anchors at canvas bottom - offsetY. |

**Avoid \`position_preset\` for App Store layouts.** Position presets are too coarse — they routinely place the device under the text or leave a giant empty band between text and device. **Always set \`screenshot.scale\`, \`screenshot.x\`, \`screenshot.y\` explicitly for App Store work.**

**The locked-in App Store recipe:** \`screenshot: { scale: 73, x: 50, y: 80 }\` + \`text: { position: "top", offsetY: 8 }\`. Text occupies the top ~25%, device top edge sits 150-200px below the subheadline, device extends to the bottom (bleeds slightly off-canvas).

### Headline + subheadline sizing (battle-tested)

For the 1320×2868 canvas (iphone-6.9) with \`headlineMaxWidthPct: 82\`:

| Headline word count | \`headlineSize\` | \`lineHeight\` |
|---|---|---|
| 4 short words ("Ace every tough interview") | 88 | 100 |
| 5 short words | 88 | 100 |
| 5+ words with longer terms | 84 | 96 |

\`headlineWeight: "700"–"900"\`, \`headlineLetterSpacing: -2 to -2.5\` (tighter display tracking).

**\`subheadlineSize: 38–40\` ALWAYS.** Bigger competes with the headline.

### Mode-specific gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Text overlapping the device mid-canvas | Used \`position_preset: "centered"\` or naive \`bleed-bottom\` | Set \`screenshot.scale: 73, y: 80\` explicitly, ditch the preset |
| Massive empty band between subheadline and device | \`screenshot.y\` too high (90+) and small \`scale\` | Tighten to \`y: 80, scale: 73\` |
| Text appears at bottom of canvas | \`text.offsetY: 80\` (it's percent, not pixels) | Use \`offsetY: 5–10\` |
| Headline doesn't wrap to 2 lines | \`headlineSize: 110+\` and \`headlineMaxWidthPct: 90+\` | \`headlineSize: 84–90, headlineMaxWidthPct: 82\` |
| 3D iPhone frame not visible | \`mode: "3d"\` alone isn't enough | Also set \`screenshot.use3D: true\` AND \`screenshot.device3D: "iphone"\` |
| Highlight word renders as solid pill where you wanted plain colour | \`headlineHighlightStyle: "pill"\` set by mistake | Omit it for plain coloured text |
| Subheadline competes with headline | \`subheadlineSize: 46+\` | Drop to 38–40 |

---

## Source-frame selection rule (critical for ASO conversion)

Pick simulator screenshots that show the **app working with populated content**, never empty states. For a career/job app:
- ✅ Home/dashboard with **populated** ATS scores + applications
- ✅ Cover letter screen with **AI-generated body text** visible (not the empty form)
- ✅ Practice quiz **mid-question** (with options visible)
- ❌ Empty list with "no items yet"
- ❌ Login / onboarding / settings screens
- ❌ Loading spinners, "no results", placeholder data

Empty-state screens never sell — they make the app look like it has no content yet.

---

## ASO Action-Verb Format (the canonical "high-converting SET" look)

This is the format used by the \`aso_appstore_screenshots\` MCP prompt and proven on top-100 App Store sets (MyFitnessPal, Duolingo, Headspace). It works because at thumb-size the eye reads ONE big verb instantly — "TRACK", "BOOST", "BUILD" — and only later parses the descriptor. **Numbers below are battle-tested for the 1320×2868 canvas.**

**Use this format whenever the user wants a screenshot SET (not a one-off hero):**

| Field | Value | Why |
|---|---|---|
| \`headline\` | The single action verb, UPPERCASE (e.g. "TRACK") | Top of the visual hierarchy. Eye lands here first. |
| \`subheadline\` | The descriptor, UPPERCASE (e.g. "TRADING CARD PRICES") | Smaller, tells the user what they're tracking. |
| \`text.position\` | \`"top"\` | Text occupies the top ~25% of the canvas. |
| \`text.offsetY\` | 8 | Text starts ~8% from the top edge. |
| \`text.font\` | \`"Plus Jakarta Sans"\` / \`"Manrope"\` / \`"Inter"\` / \`"Sora"\` | Heavy sans for max impact. |
| \`text.headlineWeight\` | \`"800"\`–\`"900"\` | Black weight. Never lower. |
| \`text.subheadlineWeight\` | \`"600"\`–\`"700"\` | Bold but not as heavy as the verb. |
| \`text.headlineSize\` | 88–96 (1-2 short words can go to 110) | See sizing table above. |
| \`text.subheadlineSize\` | 38–40 | Never higher — competes with the verb otherwise. |
| \`text.headlineColor\` | \`"#ffffff"\` (or \`#1a1a1a\` if background is light) | High contrast on the brand colour. |
| \`text.subheadlineColor\` | brand-tinted off-white (e.g. \`#fde2ef\` on pink) or white | Slightly desaturated reads as supporting copy. |
| \`text.headlineLetterSpacing\` | -2 to -2.5 | Tight display tracking. |
| \`text.headlineMaxWidthPct\` | 82 | Forces wrap on 4+ word headlines. |
| \`text.lineHeight\` | 96–100 | Tight vertical rhythm. |
| \`text.headlineTextAlign\` | \`"center"\` | Centered for this format. |
| \`background\` | Solid bold brand colour OR a 2-stop gradient with \`noiseIntensity: 6–8\` | Single saturated colour or simple two-tone. **No glow on background.** |
| \`screenshot.scale\` | **73** | Locked-in. Don't deviate. |
| \`screenshot.x\` / \`y\` | **50, 80** | Locked-in. Don't deviate. |
| \`screenshot.shadow\` | \`{ enabled: true, blur: 80–100, opacity: 25–60, y: 30–40 }\` | Soft cast shadow under the device. Tint shadow with brand-colour-darker for vibrant looks. |
| \`screenshot.glow\` | Optional — only for premium / 3D archetypes | Skip on flat-colour SET formats. |
| \`mode\` | \`"2d"\` (or \`"3d"\` with both \`use3D: true\` AND \`device3D: "iphone"\`) | 3D for hero / premium feels only. |

### Set-wide consistency rules (non-negotiable)

When rendering the next screenshot in the SAME set, copy ALL fields above EXCEPT \`headline\`, \`subheadline\`, \`image\`, and (optionally) the big-number value if you're doing a feature-tour. The whole point is that side-by-side in the App Store the set reads as one cohesive series — same colour, same font, same device position, same text treatment.

### Panoramic split (paired adjacent screenshots) — advanced

App Store gallery shows screenshots in order. Pair slots 7+8 (or any adjacent pair) so the SAME phone visually bridges across both. \`screenshot.x\` accepts up to 150 / down to -50, allowing the device to be pushed off either edge:

\`\`\`typescript
// Slot 7 — LEFT half of phone visible
{ text: { headlineTextAlign: "left", headlineMaxWidthPct: 70 },
  screenshot: { scale: 75, x: 130, y: 80 } }

// Slot 8 — RIGHT half of phone visible
{ text: { headlineTextAlign: "right", headlineMaxWidthPct: 70 },
  screenshot: { scale: 75, x: -30, y: 80 } }
\`\`\`

Both renders use the **same source image**. Headlines must read across both:
- 7: "Beautiful resume PDFs in seconds" / 8: "Built to beat any ATS bot"

For 3D templates pair \`rotation3D.y: -8\` on slot 7 with \`rotation3D.y: +8\` on slot 8 — the device "tilts toward" the viewer slightly differently, adding dynamism without breaking continuity.

### Brand colour selection (use the \`pick_brand_color\` MCP tool, NOT raw \`extract_palette\`)

\`extract_palette\` returns the dominant pixels in the screenshot — which on a white-dominated UI is **white**. White on the App Store is invisible. The hardened \`pick_brand_color\` tool wraps extract_palette with rejection rules and a per-domain fallback so this can't bite you:

| Filter | Default | Reason |
|---|---|---|
| \`min_saturation\` | 0.35 | Below this is grey/washed-out — won't stop the scroll. |
| \`min_luminance\` | 40 | Near-black. Headline + device disappear. |
| \`max_luminance\` | 210 | Near-white. Headline + device disappear. |
| \`ui_color_min_distance\` | 80 | Too close to the UI's dominant colour → device blends into background. |

If no palette colour survives, the tool falls back to a per-domain default. Pass \`domain\` if you know it for the smartest fallback. Common winners (also encoded in the tool):

- **Finance / business**: deep blue (#0a3d91), navy (#1e2a4a), Stripe navy (#003459)
- **Fitness / health**: vibrant blue (#2563eb), bold green (#16a34a), rose (#e11d48)
- **Games / kids**: hot pink (#e91e63), violet (#7c3aed), amber (#f59e0b)
- **Productivity**: deep purple (#5b21b6), warm orange (#ea580c), Things 3 indigo (#1e3a8a)
- **Wellness**: deep teal (#0f766e), aubergine (#7c2d6f)
- **Travel**: pacific cyan (#0891b2), sunset orange (#ea580c)
- **News**: charcoal (#0a0a0a), editorial red (#dc2626)
- **Developer / B2B SaaS**: violet (#7c3aed), Linear black (#0a0a0f)

### When to use the ACTION-VERB format vs. the Named Looks

- ✅ Use ACTION-VERB when the user wants a SET (3+ screenshots) optimised for App Store conversion.
- ✅ Use ACTION-VERB when the user explicitly says "ASO", "high-converting", "MyFitnessPal-style", "Duolingo-style", or shows a reference like that.
- ❌ Use a Named Look (Linear / Stripe / Notion / Apple Marketing / Things 3) when the user wants ONE polished hero shot or a premium/minimal feel.
- ❌ Don't combine: an ACTION-VERB screenshot inside a Named Look set looks broken.

---

## Highlight word styles (NEW)

\`text.headlineHighlightStyle\` controls how the highlighted word is rendered:
- **"color"** (default) — only the word's text fill changes. Subtle, dev-tool-style (Linear, Stripe).
- **"pill"** — a rounded rectangle in \`headlineHighlightColor\` is drawn BEHIND the word, with the word text in \`headlineHighlightPillTextColor\` (default #1a1a1a). This matches MyFitnessPal, Duolingo, BeReal — yellow pill behind one word.

When the reference clearly shows a colored pill/rounded-rect behind a word (NOT just colored text), use \`"pill"\`. Tell-tale signs of pill style:
- Only ONE word has a colored background.
- The background is a saturated solid color (yellow, green, blue, pink).
- The text inside the pill is dark (near-black) regardless of the surrounding text color.

---

## Named Looks library — start here

Pick the closest one to your app, then customize.

### Look A — "Linear" (technical, dark, premium)
Use for: dev tools, productivity, technical SaaS, B2B.
\`\`\`
{
  text_color: "light",
  background: { type: "gradient", gradient: { angle: 145, stops: [
    { color: "#0a0a0f", position: 0 },
    { color: "#1a1033", position: 50 },
    { color: "#0d1b2a", position: 100 }
  ]}},
  screenshot: {
    scale: 74, x: 50, y: 100,                          // Tight: scale ≤ 78, y near 100 hugs canvas bottom
    glow: { enabled: true, color: "#7c3aed", intensity: 70, size: 95 },
    shadow: { enabled: true, color: "#000000", blur: 110, opacity: 60, y: 40 }
  },
  text: {
    position: "top", offsetY: 7,
    font: "Inter", headlineWeight: "800", headlineSize: 145,
    headlineLetterSpacing: -2, headlineMaxWidthPct: 65, lineHeight: 98,
    headlineToSubheadlineGap: 30,
    subheadlineSize: 64, subheadlineWeight: "500", subheadlineOpacity: 85
  }
}
\`\`\`

### Look B — "Stripe" (clean, dark blue, trustworthy)
Use for: fintech, payments, finance, banking, enterprise.
\`\`\`
{
  text_color: "light",
  background: { type: "gradient", gradient: { angle: 160, stops: [
    { color: "#011627", position: 0 },
    { color: "#003459", position: 50 },
    { color: "#007ea7", position: 100 }
  ]}},
  screenshot: {
    scale: 74, x: 50, y: 100,                          // Tight: scale ≤ 78, y near 100 hugs canvas bottom
    glow: { enabled: true, color: "#4facfe", intensity: 60, size: 80 },
    shadow: { enabled: true, blur: 100, opacity: 55, y: 35 }
  },
  text: {
    position: "top", offsetY: 7,
    font: "Inter", headlineWeight: "800", headlineSize: 140,
    headlineLetterSpacing: -1.5, headlineMaxWidthPct: 70, lineHeight: 100,
    headlineToSubheadlineGap: 30,
    subheadlineSize: 64, subheadlineWeight: "500", subheadlineOpacity: 88
  }
}
\`\`\`

### Look C — "Notion" (warm, light, approachable)
Use for: notes, productivity, lifestyle, journaling, education.
\`\`\`
{
  text_color: "dark",
  background: { type: "gradient", gradient: { angle: 145, stops: [
    { color: "#fef3e2", position: 0 },
    { color: "#fdd9b5", position: 60 },
    { color: "#f9b687", position: 100 }
  ]}},
  screenshot: {
    scale: 74, x: 50, y: 100,                          // Tight: scale ≤ 78, y near 100 hugs canvas bottom
    glow: { enabled: true, color: "#ffffff", intensity: 55, size: 70 },
    shadow: { enabled: true, color: "#7a3500", blur: 90, opacity: 25, y: 30 }
  },
  text: {
    position: "top", offsetY: 7,
    font: "Plus Jakarta Sans", headlineWeight: "800", headlineSize: 140,
    headlineLetterSpacing: -2, headlineMaxWidthPct: 70, lineHeight: 98,
    headlineToSubheadlineGap: 30,
    headlineColor: "#1a0e00",
    subheadlineSize: 64, subheadlineWeight: "500",
    subheadlineColor: "#3d2400", subheadlineOpacity: 85
  }
}
\`\`\`

### Look D — "Duolingo / MyFitnessPal" (vibrant, playful, pill-highlighted)
Use for: games, kids apps, learning, social, fitness, food/nutrition, anything for Gen Z. **Tight density** — phone sits right under the text, nearly bleeding off the bottom.
\`\`\`
{
  text_color: "light",
  background: { type: "solid", solid: "#2563eb" },     // or vibrant gradient — solid is more MFP-like
  screenshot: {
    scale: 76, x: 50, y: 100,                           // Tight: scale ≤ 78, y near 100 hugs canvas bottom
    shadow: { enabled: true, blur: 100, opacity: 35, y: 40 }
  },
  text: {
    position: "top", offsetY: 6,                        // text starts ~6% from top
    font: "Manrope", headlineWeight: "900", headlineSize: 150,
    headlineLetterSpacing: -3, headlineMaxWidthPct: 80, lineHeight: 96,
    headlineToSubheadlineGap: 30,
    headlineHighlightWord: "<<one-word>>",
    headlineHighlightStyle: "pill",                     // ← yellow rounded pill behind the word
    headlineHighlightColor: "#ffd84d",
    headlineHighlightPillTextColor: "#1a1a1a",
    subheadlineSize: 68, subheadlineWeight: "600", subheadlineOpacity: 90
  }
}
\`\`\`

### Look E — "Apple Marketing" (minimal, premium, breathing room) — FLOATING density
Use for: hardware-adjacent, premium consumer, photography, music, lifestyle. **One of the few cases where Floating beats Tight.**
\`\`\`
{
  text_color: "light",
  background: { type: "gradient", gradient: { angle: 180, stops: [
    { color: "#0a0a0a", position: 0 },
    { color: "#1c1c1e", position: 100 }
  ]}},
  screenshot: {
    scale: 70, x: 50, y: 55,                           // Floating: smaller phone, centered
    glow: { enabled: true, color: "#ffffff", intensity: 35, size: 110 },
    shadow: { enabled: true, color: "#000000", blur: 140, opacity: 70, y: 50 }
  },
  text: {
    position: "top", offsetY: 9,
    font: "Inter", headlineWeight: "700", headlineSize: 150,
    headlineLetterSpacing: -3, headlineMaxWidthPct: 65, lineHeight: 100,
    headlineToSubheadlineGap: 30,
    headlineGradient: {
      colors: ["#ffffff", "#a8a8b3"], angle: 180
    },
    subheadlineSize: 60, subheadlineWeight: "500", subheadlineOpacity: 78
  }
}
\`\`\`

### Look F — "Things 3 / Cron" (editorial, soft, considered)
Use for: calendar, planning, journaling, premium productivity.
\`\`\`
{
  text_color: "light",
  background: { type: "gradient", gradient: { angle: 165, stops: [
    { color: "#1e1b4b", position: 0 },
    { color: "#312e81", position: 50 },
    { color: "#1e3a8a", position: 100 }
  ]}},
  screenshot: {
    scale: 74, x: 50, y: 100,                          // Tight: scale ≤ 78, y near 100 hugs canvas bottom
    glow: { enabled: true, color: "#818cf8", intensity: 50, size: 85 },
    shadow: { enabled: true, blur: 100, opacity: 45, y: 35 },
    decoration: { type: "dotted-grid", color: "#ffffff", opacity: 5 }
  },
  text: {
    position: "top", offsetY: 7,
    font: "Manrope", headlineWeight: "700", headlineSize: 135,
    headlineLetterSpacing: -1.5, headlineMaxWidthPct: 70, lineHeight: 100,
    headlineToSubheadlineGap: 30,
    subheadlineSize: 64, subheadlineWeight: "500", subheadlineOpacity: 85
  }
}
\`\`\`

### Look G — "Bento / Tour" (multi-screenshot set with feature numbers)
Use for: feature-tour App Store sets where each screenshot shows ONE feature.
Keep the same font/gradient family across all screenshots; vary only the
\`big-number\` value (01, 02, 03...) and the position.
\`\`\`
{
  text_color: "light",
  background: <pick one of the dark Looks above>,
  screenshot: {
    glow: { enabled: true, color: "<accent>", intensity: 60, size: 85 },
    decoration: { type: "big-number", value: "01", color: "#ffffff", opacity: 10, position: "top-right" }
  },
  text: <use the chosen Look's text>
}
\`\`\`

---

## When to use what (decision rules)

| Situation | Pick |
|---|---|
| Hero / first screenshot | Always use **glow** matched to the screenshot's accent color |
| Feature-tour set (3+ screenshots) | **decoration: big-number** with sequential 01/02/03 |
| Single hero with one big benefit | **decoration: big-word** with the benefit (FAST, NEW, FREE) |
| Tech/productivity app | **decoration: dotted-grid** at low opacity (3-6) |
| Warm/lifestyle/wellness app | **decoration: blobs** with the app's accent |
| Need to draw the eye to one word | **headlineHighlightWord** |
| Premium / minimal feel | **headlineGradient** white→grey (no decoration) |

---

## Color extraction rule (most important rule)

**Don't pick a preset name unless the screenshot has no clear dominant color.** Instead:

1. Look at the screenshot. What 2-3 colors dominate? (Brand color, accent, surface.)
2. Build a custom gradient using those:
   \`\`\`
   background.gradient.stops = [
     { color: "<screenshot's primary>", position: 0 },
     { color: "<screenshot's primary -- darker>", position: 50 },
     { color: "<screenshot's primary -- darker still>", position: 100 }
   ]
   \`\`\`
3. Set \`screenshot.glow.color\` to the screenshot's brightest accent.
4. Set \`text.headlineHighlightColor\` to that same accent.

This single rule is the difference between "phone on random gradient" and "the design extends from the app." Most "noob" outputs fail because they reach for a preset.

---

## The headline upgrade (apply to every hero)

Old (1/10): \`{ headline: "App Store screenshots" }\`
New (10/10): full upgrade
\`\`\`
text: {
  headline: "Beautiful by default",
  subheadline: "Pixel-perfect screenshots, every time",
  font: "Manrope",
  headlineWeight: "900",
  headlineSize: 160,
  headlineLetterSpacing: -3,
  headlineMaxWidthPct: 70,    // forces 2-line stack
  lineHeight: 95,             // tight stack
  headlineHighlightWord: "Beautiful",
  headlineHighlightColor: "#ffd84d",
  subheadlineSize: 68,        // never below 56 — see hard rules
  subheadlineWeight: "500",
  subheadlineOpacity: 88
}
\`\`\`

## Common mistakes to avoid (still!)
- Generic headlines that could apply to any app.
- Headline weight 400/500 on a hero — looks like a body paragraph.
- Headline size ≤ 100 — looks like a caption.
- **Subheadline size below 56** — disappears on the canvas, reads as a footnote, not a hierarchy partner to the headline.
- **\`screenshot.y\` left at 50 with \`text.position: "top"\`** — produces a strip of empty gradient between the text and the phone. Default to Tight density (\`y: 75-85\`).
- Subheadline that just rewords the headline.
- Both glow AND a decoration on one screenshot (busy).
- Using a preset gradient when the screenshot has a clear brand color.
- Light-on-light or dark-on-dark text.
- 3D mode on text-heavy screens.

---

## End-to-end ASO flow (the canonical "best" pipeline)

\`\`\`
┌──────────────────────────────────────────────────────────────────────────┐
│  USER:  "make me App Store screenshots for my app"                       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PROMPT: aso_appstore_screenshots                                        │
│  (5-phase resumable workflow, persisted to memory)                       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
              PHASE 0: RECALL                   PHASE 1: BENEFIT DISCOVERY
              (read memory)                     (codebase + Q&A → ACTION VERB
                    │                            + DESCRIPTOR list, save to mem)
                    │                                 │
                    └────────────────┬────────────────┘
                                     ▼
                          PHASE 2: SCREENSHOT PAIRING
                          (rate Great/Usable/Retake,
                           pair benefits→files, save to mem)
                                     │
                                     ▼
                          PHASE 3: BRAND COLOUR (auto)
                          → tool: pick_brand_color
                          (rejects washed-out, near-white,
                           UI-blending; per-domain fallback)
                                     │
                                     ▼
                          PHASE 4: GENERATION
                          → tool: render_aso_set
                          (one call → N screenshots with locked-in
                           recipe, set-wide consistency guaranteed)
                                     │
                                     ▼
                          PHASE 5: SHOWCASE
                          → tool: make_showcase
                          (side-by-side preview, optional caption)
                                     │
                                     ▼
                          OUTPUT: screenshots/final/*.png
                                  + showcase.png
                                  + memory state for next run
\`\`\`

**Underlying primitives** (use directly only when the high-level path doesn't fit):
- \`render_screenshot\` — full creative control, every parameter exposed
- \`extract_palette\` — raw dominant-colour extraction (use \`pick_brand_color\` instead for ASO work)
- \`generate_screenshot\` — server-side AI variant (only when the MCP client can't see the image)
- \`list_presets\` — gradients, fonts, position presets, output devices

**Set-level orchestration** (v0.5 additions — call these instead of looping primitives):
- \`render_multi_size\` — one set → all four iPhone sizes in one call (for ASC's per-size slots)
- \`render_ab_variants\` — same set, N brand-colour variants + master contact sheet (for paid acquisition picking)
- \`render_play_store_set\` — Android Play Store mode (1080×1920 default, Samsung frame)
- \`render_localized_set\` — same set, N languages with auto-translated headlines + RTL support

**Vision helpers** (v0.5 — call BEFORE \`render_aso_set\` to avoid wasted renders):
- \`detect_empty_state\` — reject login/onboarding/paywall/empty-list screens before pairing
- \`suggest_headlines\` — 3 ranked ACTION VERB + DESCRIPTOR options grounded in what's on screen
- \`clone_reference\` — vision → render decision JSON in one call (programmatic \`clone_template\`)

**Memory + telemetry** (v0.5 — first-class persistence):
- \`memory_read\` / \`memory_write\` — typed JSON store (default namespace = cwd basename slug)
- \`record_telemetry\` / \`list_telemetry\` — JSONL hook to correlate template/colour/headline → installs

**Asset library** (v0.5):
- \`list_assets\` / \`get_asset\` — bundled accent shapes, decorations, device tints, patterns. Tint via \`tint_color\`.

**Video pipeline** (parallel pipeline for product videos):
- \`auto_video\` — one-shot, recommended path
- \`list_video_templates\` / \`render_video_template\` — pick a named template
- \`render_video_concept\` — fully custom storyboard (advanced)
- \`render_video\` — single-scene legacy path

---

## Future scope (where this MCP is heading)

**Shipped (v0.4):**
- ✅ ACTION-VERB ASO format with battle-tested locked-in numbers
- ✅ One-shot \`render_aso_set\` (set-wide consistency guaranteed)
- ✅ Hardened brand-colour picker with per-domain fallback
- ✅ Side-by-side showcase
- ✅ Multi-phase resumable workflow prompt
- ✅ Canvas-math + gotchas documentation in design-guide

**Shipped (v0.5):**
- ✅ \`detect_empty_state\` — vision-classify simulator screenshots before they reach pairing. Rejects login/onboarding/paywall/empty-list/loading/error/permission/splash. \`strictness\` knob for tuning.
- ✅ \`suggest_headlines\` — vision-driven ACTION VERB + DESCRIPTOR suggestions ranked by what's actually visible on screen, with per-suggestion confidence + screen-summary sanity check.
- ✅ \`render_multi_size\` — one set → 6.9"/6.7"/6.5"/5.5" all rendered with correct dimensions; brand colour shared across sizes.
- ✅ \`render_ab_variants\` — render the same set in 2-8 brand-colour variants and a master contact-sheet for paid-acquisition picking. Curated default palette covers warm/cool/vivid/premium/editorial.
- ✅ \`memory_read\` / \`memory_write\` + \`myindai://memory\` resource — typed JSON store under ~/.myindai-screenshot-mcp/memory/<namespace>.json. Eliminates the "Claude has to remember to write the right markdown file" failure mode.
- ✅ \`render_localized_set\` — render a set in N languages with auto-translated headlines (Anthropic), per-script font fallbacks (CJK, Devanagari, Arabic, Hebrew), and RTL alignment flips.
- ✅ \`list_assets\` / \`get_asset\` + \`myindai://assets\` resource — bundled accent shapes, decorations, device tints, and patterns. SVGs that tint via \`tint_color\` and drop into renders.
- ✅ \`record_telemetry\` / \`list_telemetry\` — optional JSONL hook under ~/.myindai-screenshot-mcp/telemetry/ to correlate template/colour/headline → impressions/installs over time.
- ✅ \`render_play_store_set\` — Android Play Store mode (1080×1920 default, 9:16) with an Android-tuned recipe and Samsung device frame.
- ✅ \`clone_reference\` — programmatic version of the \`clone_template\` prompt: vision → render decision JSON in one call, drops straight into \`render_screenshot\`.

**Future research:**
- Set-level coherence scorer (does the set TOGETHER look like one product, or like 4 disjointed posts?).
- Auto-layout for unusual phone aspect ratios (foldables, small Androids).
- Direct ASC upload bridge once the asset pipeline is fully nailed.

---

## Cloning a reference template

When the user shares a REFERENCE template (someone else's polished App Store screenshot) and asks you to "make mine look like this":

1. **Use the \`clone_template\` MCP prompt** — it has the full step-by-step.
2. **Always call \`extract_palette\` on the reference first.** Eyeballing hex values is 60-70% accurate; the tool is 95%+.
3. **The reference's framed phone is NOT the user's input.** The user's input is the RAW inner phone-screen UI. If the user uploads an already-finished marketing screenshot AS their "screenshot," tell them you need the raw inner-UI export — there's nothing to put inside the device frame otherwise.
4. **Eight elements to extract from the reference (in order):**
   1. Background type — gradient/solid/image
   2. Gradient stops — from extract_palette (NOT eyeballed)
   3. Gradient angle — eyeball this (~90, ~145, ~180)
   4. Phone position — scale (% of canvas), x, y, rotation3D
   5. Device mode — 2D flat or 3D angled
   6. Glow / aura — present? what color?
   7. Decoration — big-number, big-word, dotted-grid, blobs, accent-stripe?
   8. Typography — font category, weight, size, letter spacing, max-width, alignment, highlight word, gradient text
5. **Retone, don't copy the headline.** Match the reference's tone/length/structure but write a new line that fits the user's actual app.
6. **If you can't reproduce something** (illustrations, mascots, photo backgrounds outside the palette), say so to the user instead of approximating badly.

## Workflow
1. Read \`myindai://presets\` to see exact gradient names and presets.
2. Look at the screenshot. What's the app? What's the screen showing?
3. Pick a position preset that fits the screen content.
4. Pick a gradient that matches the mood.
5. Write the headline. Test: does it tell a designer-on-the-team what the app does in 1.5 seconds?
6. Decide if a subheadline genuinely helps or is filler. If filler, drop it.
7. Call \`render_screenshot\` with your choices.

---

## Motion (render_video)

Use \`render_video\` when the user wants a product video (App Store preview, social, hero on a landing page).
You decide a static "look" (same choices as a still) PLUS a scene that animates around it.

### Scenes — when to use which
- **tilt-in** — DEFAULT for hero shots. Phone enters slightly off-axis at smaller scale, rotates to a three-quarter view, headline fades in. ~3s feels right. Use this 80% of the time.
- **float** — Gentle 3-axis sway. Loops cleanly (t=0 == t=1). Use for website hero loops or social loops. 4–6s. Subtle, premium.
- **rotate-360** — Full Y-axis spin. Only when the device's full surroundings matter (e.g. showing a product like a watch face, or when there's no important screen UI to read). 5–6s typical. Don't use if the screenshot has a lot of text.
- **fade-in** — 2D-friendly. Phone scales 70→78%, headline cross-fades in. 2s. Use when 3D would distract from a text-heavy screen.
- **zoom-in** — 2D-friendly. Phone grows from small to hero size. 2s. Pairs well with bold short headlines.
- **custom** — only when none of the above fit. Provide \`custom_keyframes\` with at least 2 entries.

### Duration / FPS guidance
- Hero on a landing page: **3s, 30fps, mp4** (default).
- Social loop: **4–6s, 30fps, mp4** (looping is the player's job; build a "float" so it loops cleanly).
- Lightweight product loop on a marketing page: **2–3s, 24fps, gif** (smaller file, no audio, autoplays everywhere).
- App Store preview: **15s** is the cap; we render only the device animation, you'd composite multiple of these.

### Format trade-offs
- **mp4** — best quality, smallest size with audio; use for everything except where GIF is required.
- **gif** — universal autoplay, no audio, much larger file at same quality. Use only when the consumer is e.g. a Slack message or a README.
- **webm** — VP9 quality is great, smaller than mp4 at same quality, but Safari support is iffy. Use only for web with explicit fallback.

### Render time expectations
- 3s @ 30fps with **3D scene** (tilt-in / rotate-360 / float): ~30–60s render time on a warm browser.
- 3s @ 30fps with **2D scene** (fade-in / zoom-in): ~5–10s render time.
- The browser stays warm between calls. First video after server start adds ~5s cold-start.

### Design rules for motion
- The headline should be readable for at least the last 50% of the video. Don't fade text in too late.
- Don't combine \`rotate-360\` with screen-content-heavy screenshots — viewers can't read.
- For \`float\`, keep \`intensity\` low (0.4–0.7) so it feels alive, not jittery.
- For \`tilt-in\`, default \`intensity\` 0.7 is right. Bump to 1.0+ only for very high-energy apps.
- The \`base\` you pass is the static design. Pick that the way you'd pick a still — gradient, fonts, weight — then layer the scene on top.

### Workflow
1. Read \`myindai://presets\`.
2. Look at the screenshot. Pick the static design exactly as you would for a still.
3. Pick the scene (default tilt-in unless you have a reason).
4. Set duration (default 3s) and format (default mp4).
5. Call \`render_video\` with \`base: { headline, position_preset, background_preset, text_color, screenshot: {...} }\`.
6. Tell the user what scene you chose and why (1 sentence).
`;
