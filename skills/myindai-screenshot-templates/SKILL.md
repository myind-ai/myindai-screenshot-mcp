---
name: myindai-screenshot-templates
description: |
  Battle-tested design recipes for App Store / Play Store screenshots rendered through the `myindai-screenshot-mcp` server. Documents 10 named template archetypes (5 2D, 5 3D), the canvas math that prevents text-device overlap and wasted negative space, panoramic split for paired adjacent screenshots, source-frame selection rules, and the renderer-feature support matrix (which template lands in which rc).
  Triggers on: "App Store screenshots", "Play Store screenshots", "screenshot templates", "ASO design", "render_screenshot template", "3D screenshot", "vibrant gradient", "dark premium", "tilt template", "big-number template", "clean minimal", "glass aurora", "neon perspective", "ocean hero", "gold premium", "light cinematic", "panoramic screenshot", "paired screenshots", "screenshot layout math", "headline + subheadline sizing", "App Store 6.9 inch", "iPhone 6.9", "marketing screenshot design".
---

# myindai-screenshot-templates — design recipes (battle-tested)

10 design recipes (5 2D + 5 3D) that produce App Store / Play Store-ready screenshots at iPhone 6.9" (1320×2868). Battle-tested 2026-04-30 on Kaabil. Solves the two failure modes that burn 60+ wasted renders:

1. **Text-device overlap** — naive use of `position_preset` (`centered`, `bleed-bottom`, etc.) puts the device under the text.
2. **Wasted negative space** — pushing the device too far down leaves a huge empty band between the subheadline and the device top.

This skill is the **design** companion to [`myindai-screenshot`](../myindai-screenshot/SKILL.md), which covers install + setup + basic workflow. Read that first if the MCP server isn't connected yet.

## Renderer-support matrix (what works in which release)

Some recipes in this skill depend on renderer features that land across the v1.0.0 → v1.1.0 cycle. Use this matrix to know what you can render today.

| Archetype | Status | Needs renderer | Substitute today |
|---|---|---|---|
| 01 Pink Vibrant (2D)        | 🟡 rc.4 | named gradient `Sunset Vibrant`, `headlineHighlightColor`, `glow`, `shadow` | use `background_preset: "sunset"`, `text_color: "light"` |
| 02 Dark Premium (2D)        | 🟡 rc.4 | named gradient `Midnight Pulse`, glow + shadow | `background.gradient.stops` with manual hex stops |
| 03 Bold Big-Number (2D)     | 🟡 rc.4 | `screenshot.decoration.type: "big-number"` | render hero shots, add number overlay in v1.0.0-rc.4 |
| 04 Tilt Synthwave (2D)      | 🟡 rc.4 | named gradient `Synthwave Dusk`, `headlineHighlightStyle: "pill"`, `screenshot.rotation` | `screenshot.rotation: ±4` works in rc.3; pill highlight in rc.4 |
| 05 Clean Minimal (2D)       | ✅ rc.3 | only fields already shipped | full recipe works |
| 06 3D Glass Aurora (3D)     | 🟡 rc.3.x | `mode: "3d"`, `screenshot.use3D: true`, `device3D: "iphone"`, `rotation3D`, real `.glb` | 2D fallback with rounded device shell — animated 3D lands in rc.3.x |
| 07 3D Neon Perspective (3D) | 🟡 rc.3.x | same as 06 | same |
| 08 3D Ocean Hero (3D)       | 🟡 rc.3.x | same + `perspective: 12` | same |
| 09 3D Gold Premium (3D)     | 🟡 rc.3.x | same | same |
| 10 3D Light Cinematic (3D)  | 🟡 rc.3.x | same | same |
| Panoramic split (paired)    | 🟡 rc.4 | `screenshot.x` range −50 → 150 | `screenshot.x: 0` or `100` available now; full ±50 range in rc.4 |

**TL;DR for rc.3:** Recipe 05 (Clean Minimal) renders end-to-end today. The other 9 recipes have a degraded path that you can apply now (use the listed substitute) and a full path that activates as the renderer catches up — no skill rewrite needed, just re-render the same recipe and it gets richer.

## The locked-in canvas math

The renderer's iPhone 6.9" canvas is **1320 × 2868** (App Store required, rc.4 ships this device key; rc.3 ships iphone-6.7 at 1290×2796 — math is identical, just scale by 1.023). The parameter semantics surprise you:

| Param | What it actually does |
|---|---|
| `screenshot.scale` | % of canvas width. Scale 73 → device is 963px wide, 2090px tall. |
| `screenshot.x` | Horizontal center (50 = middle of canvas). |
| `screenshot.y` | Vertical **center** as % of canvas height. **Lower y = device higher up**, not lower. y=80 puts device top at ~35% of canvas. y=58 puts device top at ~13% (overlaps text). y=120 (the `bleed-bottom` preset) puts device top near canvas top (counter-intuitive — the name implies bottom-bleed). |
| `text.offsetY` | **Percent, not pixels.** Range −100 to +100. offsetY=80 pushes text 80% down (text appears at canvas BOTTOM). Use 5–10 to keep text just below canvas top. |
| `text.position` | `"top"` anchors the headline at canvas top + offsetY. |

**The recipe that works:** `scale: 73, x: 50, y: 80` + `text.offsetY: 8`. Text occupies top ~25%, device top edge sits ~150–200 px below subheadline, device extends to bottom (bleeds slightly off-canvas).

Do **not** use `position_preset` for App Store layouts — it's too coarse. Always set `screenshot.scale`, `x`, `y` explicitly.

## Headline + subheadline sizing

For a 1320 px-wide canvas with `headlineMaxWidthPct: 82`:

| Param | Value | Why |
|---|---|---|
| `headlineSize` | `84–90` | Wraps cleanly to 2 lines for a 4–6 word headline. |
| `headlineWeight` | `700–800` | Modern, bold but not chunky. `900` for the big-number template only. |
| `headlineLetterSpacing` | `-1.5 to -2.5` | Tightens the typesetting; required for Sora / Outfit / Manrope. |
| `headlineMaxWidthPct` | `82` | Leaves comfortable side gutters. Raise to 88 for 7+ word headlines. |
| `subheadlineSize` | `38–40` | Reads as supporting, never competes with headline. |

## 2D archetypes (5)

```typescript
// 01 — Pink Vibrant (high-conversion B2C)
{
  background_preset: "Sunset Vibrant",
  text: { font: "Inter", headlineWeight: "800",
          headlineHighlightColor: "#fde68a", subheadlineColor: "#ffffff" },
  screenshot: { scale: 73, x: 50, y: 80,
                glow: { color: "#ec4899", intensity: 55, size: 120 },
                shadow: { color: "#000000", blur: 80, opacity: 45, y: 30 }}
}

// 02 — Dark Premium (paid-feeling)
{
  background_preset: "Midnight Pulse",
  text: { font: "Manrope", headlineWeight: "700",
          headlineHighlightColor: "#f472b6", subheadlineColor: "#cbd5e1" },
  screenshot: { scale: 73, x: 50, y: 80,
                glow: { color: "#ec4899", intensity: 60, size: 130 },
                shadow: { color: "#000000", blur: 100, opacity: 60, y: 40 }}
}

// 03 — Bold Big-Number (feature-tour signature)
{
  background: { type: "gradient", gradient: { angle: 180,
    stops: [{color:"#1a0b2e",position:0}, {color:"#3b0764",position:60}, {color:"#831843",position:100}]}},
  text: { font: "Sora", headlineWeight: "900", headlineLetterSpacing: -2.5,
          subheadlineColor: "#fbcfe8" },
  screenshot: { scale: 73, x: 50, y: 80,
                decoration: { type: "big-number", value: "01" /* through "06" */,
                              position: "top-right" /* alternate top-left */,
                              color: "#ec4899", opacity: 11 }}
}

// 04 — Tilt Synthwave (alternating ±4° rotation, pill highlight)
{
  background_preset: "Synthwave Dusk",
  text: { font: "Manrope", headlineWeight: "800",
          headlineHighlightColor: "#fde68a", headlineHighlightStyle: "pill",
          headlineHighlightPillTextColor: "#1a0533" },
  screenshot: { scale: 73, x: 50, y: 80, rotation: -4 /* alternate +4 */,
                glow: { color: "#ff2d78", intensity: 60, size: 130 }}
}

// 05 — Clean Minimal (light pink-mist, dark text) — ✅ works in rc.3
{
  background: { type: "gradient", gradient: { angle: 180,
    stops: [{color:"#fdf2f8",position:0}, {color:"#ffe4e6",position:100}]}},
  text_color: "dark",
  text: { font: "DM Sans", headlineWeight: "700",
          headlineColor: "#1a1a1a", headlineHighlightColor: "#e94691",
          subheadlineColor: "#525252" },
  screenshot: { scale: 73, x: 50, y: 80,
                shadow: { color: "#e94691", blur: 80, opacity: 25, y: 30 },
                decoration: { type: "accent-stripe", color: "#e94691", opacity: 10 }}
}
```

## 3D archetypes (5) — `mode: "3d"`, `screenshot.use3D: true`, `device3D: "iphone"`

```typescript
// 06 — 3D Glass Aurora (Northern Lights, gentle Y-axis swing)
{
  mode: "3d", background_preset: "Northern Lights",
  text: { font: "Space Grotesk", headlineHighlightColor: "#0ef3c5",
          subheadlineColor: "#a7f3d0" },
  screenshot: { scale: 73, x: 50, y: 80, use3D: true, device3D: "iphone",
                rotation3D: { x: 0, y: -8, z: 0 },  // alternate y: +8
                glow: { color: "#0ef3c5", intensity: 60, size: 130 }}
}

// 07 — 3D Neon Perspective (dramatic 3-axis tilt)
{
  mode: "3d", background_preset: "Electric Surge",
  text: { font: "Outfit", headlineHighlightColor: "#22d3ee" },
  screenshot: { scale: 73, x: 50, y: 80, use3D: true, device3D: "iphone",
                rotation3D: { x: 8, y: -12, z: -2 },  // alternate y/z signs
                glow: { color: "#22d3ee", intensity: 75, size: 150 }}
}

// 08 — 3D Ocean Hero (Deep Ocean, X-tilt + perspective)
{
  mode: "3d", background_preset: "Deep Ocean",
  text: { font: "Lexend", headlineHighlightColor: "#67e8f9" },
  screenshot: { scale: 73, x: 50, y: 80, use3D: true, device3D: "iphone",
                rotation3D: { x: 4, y: 0, z: 0 }, perspective: 12,
                glow: { color: "#06b6d4", intensity: 80, size: 170 }}
}

// 09 — 3D Gold Premium (Gold Noir, serif headline)
{
  mode: "3d", background_preset: "Gold Noir",
  text: { font: "Playfair Display", headlineHighlightColor: "#fbbf24",
          subheadlineColor: "#fde68a" },
  screenshot: { scale: 73, x: 50, y: 80, use3D: true, device3D: "iphone",
                rotation3D: { x: 6, y: -6, z: 0 },  // alternate y sign
                glow: { color: "#c9a227", intensity: 65, size: 140 }}
}

// 10 — 3D Light Cinematic (light pink-rose, dark text)
{
  mode: "3d", text_color: "dark",
  background: { type: "gradient", gradient: { angle: 165,
    stops: [{color:"#fef3f8",position:0}, {color:"#fce7e9",position:50}, {color:"#fbcfe8",position:100}]}},
  text: { font: "Manrope", headlineColor: "#1a1a1a",
          headlineHighlightColor: "#e94691" },
  screenshot: { scale: 73, x: 50, y: 80, use3D: true, device3D: "iphone",
                rotation3D: { x: 5, y: -7, z: 0 }}
}
```

## Panoramic split (paired adjacent screenshots)

App Store gallery shows screenshots in order — pair slots 7+8 (or any adjacent pair) so the **same** phone visually bridges across both screens. When users see them next to each other (web / iPad gallery, or in App Store editorial layouts), the device reads as one continuous element linking two messages.

**The trick:** `screenshot.x` accepts values up to 150 / down to −50, allowing you to push the device far off the right or left edge.

```typescript
// Slot 7 — LEFT half of phone visible (phone center pushed past right edge)
{
  text: { headlineTextAlign: "left", headlineMaxWidthPct: 70 },  // tight text on left
  screenshot: { scale: 75, x: 130, y: 80 }                       // x:130 shoves phone right
}

// Slot 8 — RIGHT half of phone visible (phone center pushed past left edge)
{
  text: { headlineTextAlign: "right", headlineMaxWidthPct: 70 }, // text on right
  screenshot: { scale: 75, x: -30, y: 80 }                       // x:-30 shoves phone left
}
```

Both renders use the **same source image**. When viewed adjacently in the gallery, the device appears continuous (with a slim gutter between the two PNGs that App Store renders as a thin grey line — acceptable).

**Headline pairing rule:** write text that reads across both. Examples:

- 7: "Beautiful resume PDFs in seconds" / 8: "Built to beat any ATS bot"
- 7: "Powerful enough for pros" / 8: "Simple enough for anyone"

**For 3D templates:** pair `rotation3D.y: -8` on slot 7 with `rotation3D.y: +8` on slot 8 so the phone "tilts toward" the viewer slightly differently on each — adds dynamism without breaking continuity.

## Workflow

1. **Pick 6 source frames** that tell the user-journey story: hero/home → input → AI generation → key feature → secondary feature → utility.
2. **Mkdir** `website/<app>_screenshots/templates/{01..10}_<style>/`.
3. **Render each frame across all chosen templates** in parallel batches of 6 (one full template per batch). Each template = same 6 frames + same layout params + template-specific colors/font/decoration.
4. **Verify visually** by opening one or two frames per template before committing to the full batch — catches text-overlap or gap issues with one render instead of 60.
5. **Required PNG canvas: 1320 × 2868** (iphone-6.9). For 6.5" backups, re-render with `output_device: "iphone-6.5"` (1242×2688).
6. **Output via** `asc screenshots upload --app-id <ID> --version <V> --locale en-US --display-type APP_IPHONE_69 --path templates/<chosen>/`.

## Source-frame selection rule

Pick frames that show the **app working**, not empty states:

- Home/dashboard with **populated** data (scores, recent activity)
- Input screen with **all options visible**
- Generated output with **real text** visible (not empty form)
- Feature screen with **realistic content**
- Action screens **mid-interaction**
- Settings / library with **multiple entries**

Empty-state screens never sell — they look like the app doesn't have content yet.

## Output naming convention

Inside each template folder:

```
1_<feature>.png
2_<feature>.png
3_<feature>.png
4_<feature>.png
5_<feature>.png
6_<feature>.png
```

The leading number is required by App Store Connect upload order. Keep the same feature name across all 10 templates so you can A/B-test which template style converts best.

## When to use which template

| Use case | Pick |
|---|---|
| Bold, conversion-focused, brand-pink B2C | 01 Pink Vibrant |
| Premium / paid app feel | 02 Dark Premium or 09 Gold Premium |
| Feature-tour with 1-2-3-4-5-6 narrative | 03 Big-Number |
| Playful / Gen-Z creative app | 04 Synthwave or 07 Neon Perspective |
| Clean / minimalist / wellness | 05 Clean Minimal or 10 Light Cinematic |
| iPhone product shot (marketing-page look) | 06 Glass Aurora or 08 Ocean Hero |

**Default for first-time submission:** 01 Pink Vibrant — highest conversion in informal A/B testing on App Store browse.

## Gotchas (the ones that bit me)

| Symptom | Cause | Fix |
|---|---|---|
| Text overlapping the device mid-canvas | Used `position_preset: "centered"` or naive `bleed-bottom` | Set `screenshot.scale: 73, y: 80` explicitly, drop the preset. |
| Massive empty band between subheadline and device | `screenshot.y` too high (90+) and small `scale` | Tighten to `y: 80, scale: 73`. |
| Text appears at bottom of canvas | `text.offsetY: 80` (percent, not pixels) | Use `offsetY: 5–10`. |
| Headline doesn't wrap to 2 lines | `headlineSize: 110+` and `headlineMaxWidthPct: 90+` | Use `headlineSize: 84–90, headlineMaxWidthPct: 82`. |
| 3D iPhone frame not visible | Forgot `screenshot.use3D: true` and `device3D: "iphone"` | `mode: "3d"` alone isn't enough — must also set both screenshot fields. |
| Highlight word renders solid pill where you wanted plain color | Set `headlineHighlightStyle: "pill"` by mistake | Omit it for plain colored text; only use for synthwave-style designs. |
| Subheadline too big, competes with headline | Used `subheadlineSize: 46–50` | Drop to 38–40. |
| `unknown template` error in rc.3 | rc.3 ships only the `clean-minimal` template | Use the rc.3 "substitute" path from the support matrix; full recipes activate as the renderer catches up. |

## Companion docs

- [TOOLS.md](../../TOOLS.md) — every tool's input schema (so the field names above are authoritative).
- [docs/architecture.md](../../docs/architecture.md) — server-renderer contract.
- [skills/myindai-screenshot/SKILL.md](../myindai-screenshot/SKILL.md) — install + setup + basic workflow.
