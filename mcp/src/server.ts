#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureFfmpeg, ensureFfprobe } from "./video/ffmpeg.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GenerateInputSchema, generateScreenshot } from "./tools/generate.js";
import { RenderInputSchema, renderScreenshot } from "./tools/render.js";
import { VideoInputSchema, renderVideo } from "./tools/video.js";
import { VideoConceptInputSchema, renderVideoConcept } from "./tools/video-concept.js";
import { PaletteInputSchema, extractPalette } from "./tools/palette.js";
import {
  RenderVideoTemplateInputSchema,
  renderVideoTemplate,
  listVideoTemplates,
} from "./tools/video-template.js";
import { AutoVideoInputSchema, autoVideo } from "./tools/auto-video.js";
import { ShowcaseInputSchema, makeShowcase } from "./tools/showcase.js";
import { PickBrandColorInputSchema, pickBrandColor } from "./tools/brand-color.js";
import { RenderAsoSetInputSchema, renderAsoSet } from "./tools/aso-set.js";
import { RenderMultiSizeInputSchema, renderMultiSize } from "./tools/multi-size.js";
import { RenderAbVariantsInputSchema, renderAbVariants } from "./tools/ab-variants.js";
import { RenderPlayStoreSetInputSchema, renderPlayStoreSet } from "./tools/play-store-set.js";
import { RenderLocalizedSetInputSchema, renderLocalizedSet } from "./tools/localized-set.js";
import { DetectEmptyStateInputSchema, detectEmptyState } from "./tools/empty-state.js";
import { SuggestHeadlinesInputSchema, suggestHeadlines } from "./tools/headline-writer.js";
import { CloneReferenceInputSchema, cloneReference } from "./tools/clone-reference.js";
import { MemoryReadInputSchema, memoryRead, MemoryWriteInputSchema, memoryWrite } from "./tools/memory.js";
import { RecordTelemetryInputSchema, recordTelemetry, ListTelemetryInputSchema, listTelemetry } from "./tools/telemetry.js";
import { ListAssetsInputSchema, listAssets, GetAssetInputSchema, getAsset } from "./tools/assets.js";
import { listPresets } from "./renderer/render.js";
import { RESOURCES, readResource } from "./resources.js";
import { PROMPTS, getPrompt } from "./prompts.js";

const server = new Server(
  { name: "myindai-screenshot-mcp", version: "1.0.0-rc.3" },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ----------------------------------------------------------------------------
// Tools
// ----------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "render_screenshot",
      description:
        "Render a polished App Store screenshot from a raw app screenshot using client-supplied creative choices. " +
        "Read myindai://design-guide and myindai://presets first. The high-level fields (headline, subheadline, mode, " +
        "position_preset, background_preset) cover most cases; use the nested `background`, `screenshot`, and `text` " +
        "objects for fine control over shadows, 3D rotation, fonts, weights, custom gradients, noise, and more.",
      inputSchema: {
        type: "object",
        properties: {
          image: {
            type: "string",
            description: "Image as one of: absolute file path, data: URL, or raw base64 string. This is the RAW phone-screen UI to wrap.",
          },
          reference_image: {
            type: "string",
            description: "Optional. Path/URL of a reference template you (the AI) extracted the design from. Purely informational — recorded in the response. The actual design must be expressed via the other fields (background, screenshot, text). See the `clone_template` prompt for the cloning workflow.",
          },
          // High-level
          headline: { type: "string", description: "2-7 words, benefit-driven. Empty string disables." },
          subheadline: { type: "string", description: "Optional supporting line. Empty string disables." },
          mode: { type: "string", enum: ["2d", "3d"], description: "Device frame style. Default 2d." },
          position_preset: {
            type: "string",
            enum: [
              "centered", "bleed-bottom", "bleed-top", "float-center",
              "tilt-left", "tilt-right", "perspective", "float-bottom",
            ],
            description: "How the device sits on the canvas. See myindai://design-guide for the cookbook.",
          },
          background_preset: {
            type: "string",
            description: "Gradient name (case-insensitive). See myindai://presets for full list.",
          },
          accent_color: { type: "string", description: "Hex color (informational)." },
          text_color: { type: "string", enum: ["light", "dark"], description: "Headline/subheadline color theme." },
          language: { type: "string", description: "Default 'en'." },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"],
            description: "Canvas resolution. Default iphone-6.9 (1320×2868).",
          },
          output_path: {
            type: "string",
            description: "If set, writes PNG and returns path. Else returns image_base64.",
          },
          // Detailed background
          background: {
            type: "object",
            description: "Override or extend the background_preset. Set type to 'solid' or 'image' to switch. Add noise, blur, or overlay.",
            properties: {
              type: { type: "string", enum: ["gradient", "solid", "image"] },
              gradient: {
                type: "object",
                properties: {
                  angle: { type: "number", minimum: 0, maximum: 360 },
                  stops: {
                    type: "array",
                    minItems: 2,
                    items: {
                      type: "object",
                      properties: {
                        color: { type: "string" },
                        position: { type: "number", minimum: 0, maximum: 100 },
                      },
                      required: ["color", "position"],
                    },
                  },
                },
              },
              solid: { type: "string" },
              overlayColor: { type: "string" },
              overlayOpacity: { type: "number", minimum: 0, maximum: 100 },
              blur: { type: "number", minimum: 0, maximum: 40 },
              noise: { type: "boolean" },
              noiseIntensity: { type: "number", minimum: 0, maximum: 100 },
            },
          },
          // Detailed screenshot/device
          screenshot: {
            type: "object",
            description: "Fine-grained device placement, shadow, frame, and 3D rotation.",
            properties: {
              scale: { type: "number", minimum: 0, maximum: 200 },
              x: { type: "number", minimum: -50, maximum: 150 },
              y: { type: "number", minimum: -50, maximum: 150 },
              rotation: { type: "number", minimum: -180, maximum: 180 },
              perspective: { type: "number", minimum: 0, maximum: 45 },
              cornerRadius: { type: "number", minimum: 0, maximum: 120 },
              use3D: { type: "boolean" },
              device3D: { type: "string", enum: ["iphone", "samsung"] },
              rotation3D: {
                type: "object",
                properties: {
                  x: { type: "number", minimum: -180, maximum: 180 },
                  y: { type: "number", minimum: -180, maximum: 180 },
                  z: { type: "number", minimum: -180, maximum: 180 },
                },
              },
              shadow: {
                type: "object",
                properties: {
                  enabled: { type: "boolean" },
                  color: { type: "string" },
                  blur: { type: "number", minimum: 0, maximum: 200 },
                  opacity: { type: "number", minimum: 0, maximum: 100 },
                  x: { type: "number", minimum: -200, maximum: 200 },
                  y: { type: "number", minimum: -200, maximum: 200 },
                },
              },
              frame: {
                type: "object",
                properties: {
                  enabled: { type: "boolean" },
                  color: { type: "string" },
                  width: { type: "number", minimum: 0, maximum: 80 },
                  opacity: { type: "number", minimum: 0, maximum: 100 },
                },
              },
              glow: {
                type: "object",
                description:
                  "Soft radial halo behind the device. Strongly recommended for hero shots — set color to the screenshot's accent color and intensity 50-80.",
                properties: {
                  enabled: { type: "boolean" },
                  color: { type: "string" },
                  intensity: { type: "number", minimum: 0, maximum: 100 },
                  size: { type: "number", minimum: 5, maximum: 250 },
                },
              },
              decoration: {
                type: "object",
                description:
                  "Background flourish drawn between the gradient and the device. Use sparingly — pick ONE: a giant '01' / '02' for feature-tour sets (big-number), a giant 'NEW'/'FAST' (big-word), a subtle dotted grid for tech apps, soft blobs for warm/lifestyle, or an accent stripe.",
                properties: {
                  type: {
                    type: "string",
                    enum: ["none", "big-number", "big-word", "dotted-grid", "blobs", "accent-stripe"],
                  },
                  value: { type: "string", description: "Used by big-number/big-word." },
                  color: { type: "string" },
                  opacity: { type: "number", minimum: 0, maximum: 100, description: "8-15 is the sweet spot." },
                  position: {
                    type: "string",
                    enum: ["top-left", "top-right", "bottom-left", "bottom-right", "center"],
                  },
                },
              },
            },
          },
          // Detailed text
          text: {
            type: "object",
            description: "Fine-grained text controls (font, size, weight, position, italic, underline, etc.).",
            properties: {
              headline: { type: "string" },
              subheadline: { type: "string" },
              position: { type: "string", enum: ["top", "bottom"] },
              offsetY: { type: "number", minimum: -100, maximum: 100 },
              lineHeight: { type: "number", minimum: 50, maximum: 250 },
              font: { type: "string", description: "Family name applied to both headline and subheadline." },
              headlineFont: { type: "string" },
              subheadlineFont: { type: "string" },
              headlineSize: { type: "number", minimum: 20, maximum: 300 },
              subheadlineSize: { type: "number", minimum: 20, maximum: 300 },
              headlineWeight: { type: "string", description: "'300'..'900'" },
              subheadlineWeight: { type: "string" },
              headlineItalic: { type: "boolean" },
              headlineUnderline: { type: "boolean" },
              headlineStrikethrough: { type: "boolean" },
              subheadlineItalic: { type: "boolean" },
              subheadlineUnderline: { type: "boolean" },
              subheadlineStrikethrough: { type: "boolean" },
              headlineColor: { type: "string" },
              subheadlineColor: { type: "string" },
              subheadlineOpacity: { type: "number", minimum: 0, maximum: 100 },
              headlineTextAlign: { type: "string", enum: ["left", "center", "right"], description: "Default center." },
              headlineLetterSpacing: { type: "number", minimum: -10, maximum: 30, description: "Pixels per glyph. Use -1 to -3 for tight display headlines, 0 for default, 2-5 for spaced caps." },
              headlineMaxWidthPct: { type: "number", minimum: 30, maximum: 100, description: "% of canvas width the headline can occupy. 60-75 forces 2-3 line stacks (recommended for big headlines)." },
              headlineHighlightWord: { type: "string", description: "ONE word in the headline to highlight (rest stays in headlineColor). Picks the first match, case-insensitive." },
              headlineHighlightColor: { type: "string", description: "Hex color for the highlight (text fill in 'color' style; pill background in 'pill' style)." },
              headlineHighlightStyle: { type: "string", enum: ["color", "pill"], description: "'color' (default) tints the word's text. 'pill' draws a rounded background rectangle in highlightColor with dark text on top — matches MyFitnessPal-style 'Stay [healthy]' / 'Scan [Meals]' templates." },
              headlineHighlightPillTextColor: { type: "string", description: "Text color inside the pill. Default #1a1a1a (near-black). Only used when style='pill'." },
              headlineGradient: {
                type: "object",
                description: "Apply a gradient fill to the headline text instead of a solid color. Pass null to clear.",
                properties: {
                  colors: { type: "array", items: { type: "string" }, minItems: 2 },
                  angle: { type: "number", minimum: 0, maximum: 360 },
                },
              },
            },
          },
        },
        required: ["image"],
      },
    },
    {
      name: "generate_screenshot",
      description:
        "Server-side AI variant: the SERVER calls Claude vision to choose all creative settings (requires ANTHROPIC_API_KEY). " +
        "Use only when the MCP client cannot see the image. If your client has vision, prefer render_screenshot — faster and avoids a second AI hop.",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string", description: "absolute path | data: URL | base64" },
          app_name: { type: "string" },
          language: { type: "string" },
          device: { type: "string", enum: ["auto", "iphone-2d", "iphone-3d"] },
          hints: { type: "string" },
          output_path: { type: "string" },
        },
        required: ["image"],
      },
    },
    {
      name: "list_presets",
      description:
        "List the renderer's full catalog: position presets (with their actual values), gradient names with previews, " +
        "supported fonts and weights, output device sizes. Call this BEFORE render_screenshot so you use valid names.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "extract_palette",
      description:
        "Sample dominant colors from any image (a reference template you want to clone, or the user's app screenshot). " +
        "Returns top-N hex colors with their share, plus a suggested 3-stop gradient. Use this when cloning a template — " +
        "don't eyeball hex values, get accurate ones from this tool. Pair with the `clone_template` prompt.",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string", description: "absolute path | data: URL | base64" },
          count: { type: "integer", minimum: 1, maximum: 10, description: "Number of dominant colors to return. Default 5." },
        },
        required: ["image"],
      },
    },
    {
      name: "pick_brand_color",
      description:
        "Pick a single bold, saturated brand colour for the ASO action-verb format. Wraps `extract_palette` with stricter rejection " +
        "(rejects washed-out, near-black, near-white, and any colour too close to the app's UI dominant colour — those would make " +
        "the device disappear into the background) and falls back to a per-domain default when no palette colour survives. " +
        "ALWAYS prefer this over raw `extract_palette` when the goal is the ASO SET background — `extract_palette` has burned us " +
        "by returning near-white on white-dominated apps. Pass `domain` if you know it (e.g. \"finance\", \"games\", \"productivity\") " +
        "for smarter fallbacks.",
      inputSchema: {
        type: "object",
        properties: {
          image: {
            description: "Either one screenshot path/data-URL/base64 OR an array of paths to sample.",
            anyOf: [
              { type: "string" },
              { type: "array", items: { type: "string" }, minItems: 1 },
            ],
          },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
            description: "App domain — drives the per-domain fallback if the palette has no usable colour. Default 'auto'.",
          },
          min_saturation: { type: "number", minimum: 0, maximum: 1, description: "Reject colours below this. Default 0.35." },
          min_luminance: { type: "number", minimum: 0, maximum: 255, description: "Reject darker than this. Default 40." },
          max_luminance: { type: "number", minimum: 0, maximum: 255, description: "Reject lighter than this. Default 210 (white-on-App-Store disappears)." },
          ui_color_min_distance: { type: "number", minimum: 0, maximum: 442, description: "Reject colours within this RGB distance of the UI's dominant colour. Default 80." },
        },
        required: ["image"],
      },
    },
    {
      name: "render_aso_set",
      description:
        "ONE-SHOT renderer for the ACTION-VERB ASO format. Pass an array of (image, verb, descriptor) entries; the locked-in " +
        "battle-tested recipe is applied identically across every screenshot for set-wide consistency (scale 73, x 50, y 80, " +
        "offsetY 8, headlineSize auto-picked from word count, subheadlineSize 40, etc.). Brand colour is auto-derived from the " +
        "screenshots via pick_brand_color unless you pass `brand_color` explicitly. Optionally produces a side-by-side showcase. " +
        "This is THE tool for 'render my App Store screenshot SET' — use it instead of looping render_screenshot manually so " +
        "consistency can't drift.",
      inputSchema: {
        type: "object",
        properties: {
          benefits: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                image: { type: "string", description: "Simulator screenshot path/data-URL/base64." },
                verb: { type: "string", description: "Single action verb (e.g. 'TRACK'). Auto-uppercased." },
                descriptor: { type: "string", description: "The rest of the headline (e.g. 'CARD PRICES'). Auto-uppercased." },
              },
              required: ["image", "verb", "descriptor"],
            },
          },
          output_dir: { type: "string", description: "Directory where 01-<slug>.png … N-<slug>.png + showcase.png are written." },
          brand_color: { type: "string", description: "Optional. Hex like '#e94691'. If omitted, auto-derived." },
          brand_gradient_to: { type: "string", description: "Optional. Hex for the second gradient stop. Default = brand_color lightened 18%." },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
            description: "App domain — passed to pick_brand_color when brand_color is auto-derived. Default 'auto'.",
          },
          font: { type: "string", description: "Headline font family. Default 'Plus Jakarta Sans'." },
          output_device: {
            type: "string",
            enum: [
              "iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5",
              "android-phone", "android-phone-hd", "android-tablet-7", "android-tablet-10",
            ],
            description: "Default 'iphone-6.9' (1320×2868 — App Store required). Android sizes go through `render_play_store_set` for the right recipe.",
          },
          text_color: { type: "string", description: "Headline + descriptor hex. Default '#ffffff'." },
          showcase: { type: "boolean", description: "Also render side-by-side showcase.png. Default true." },
          showcase_caption: { type: "string", description: "Caption rendered under the showcase row." },
        },
        required: ["benefits", "output_dir"],
      },
    },
    {
      name: "render_multi_size",
      description:
        "Render the same ASO set at every Apple-required device size in ONE call (6.9\", 6.7\", 6.5\", 5.5\"). " +
        "Each size lands in its own subdirectory under `output_root/<device>/` so ASC's per-size slot upload is straightforward. " +
        "Brand colour is auto-derived from the first size and reused across all sizes for visual consistency.",
      inputSchema: {
        type: "object",
        properties: {
          benefits: {
            type: "array", minItems: 1, maxItems: 10,
            items: {
              type: "object",
              properties: {
                image: { type: "string" },
                verb: { type: "string" },
                descriptor: { type: "string" },
              },
              required: ["image", "verb", "descriptor"],
            },
          },
          output_root: { type: "string", description: "Root dir; per-device folders are created underneath." },
          sizes: {
            type: "array",
            items: { type: "string", enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"] },
            description: "Default = all four iPhone sizes.",
          },
          brand_color: { type: "string" },
          brand_gradient_to: { type: "string" },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
          },
          font: { type: "string" },
          text_color: { type: "string" },
          showcase: { type: "boolean", description: "Per-size showcase. Default true." },
          showcase_caption: { type: "string" },
        },
        required: ["benefits", "output_root"],
      },
    },
    {
      name: "render_ab_variants",
      description:
        "A/B variant generator. Render the same ASO set in 2-8 brand-colour variants and produce a contact sheet so you can " +
        "pick which colour stops the scroll best for paid acquisition. Pass `variants` to override the curated default palette " +
        "(violet, pink, orange, green, cyan, indigo, red, slate). Each variant lands in its own subdir; the master contact sheet " +
        "lives at `output_root/contact-sheet.png`.",
      inputSchema: {
        type: "object",
        properties: {
          benefits: {
            type: "array", minItems: 1, maxItems: 10,
            items: {
              type: "object",
              properties: { image: { type: "string" }, verb: { type: "string" }, descriptor: { type: "string" } },
              required: ["image", "verb", "descriptor"],
            },
          },
          output_root: { type: "string" },
          variants: {
            type: "array",
            items: {
              type: "object",
              properties: { hex: { type: "string" }, name: { type: "string" } },
              required: ["hex", "name"],
            },
            description: "Optional. Default = first N from curated palette.",
          },
          variant_count: { type: "integer", minimum: 2, maximum: 8, description: "Used when `variants` is omitted. Default 4." },
          contact_sheet: { type: "boolean", description: "Build master contact-sheet.png. Default true." },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
          },
          font: { type: "string" },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"],
          },
          text_color: { type: "string" },
        },
        required: ["benefits", "output_root"],
      },
    },
    {
      name: "render_play_store_set",
      description:
        "Android Play Store mode — same ACTION-VERB ASO pipeline targeting Google Play screenshot dimensions " +
        "(default 1080×1920, 9:16). The recipe is Android-tuned (slightly larger device, tighter headline) because the 9:16 " +
        "aspect is shorter than iOS's 9:19.5. Use this instead of `render_aso_set` for Android assets.",
      inputSchema: {
        type: "object",
        properties: {
          benefits: {
            type: "array", minItems: 1, maxItems: 10,
            items: {
              type: "object",
              properties: { image: { type: "string" }, verb: { type: "string" }, descriptor: { type: "string" } },
              required: ["image", "verb", "descriptor"],
            },
          },
          output_dir: { type: "string" },
          brand_color: { type: "string" },
          brand_gradient_to: { type: "string" },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
          },
          font: { type: "string" },
          output_device: {
            type: "string",
            enum: ["android-phone", "android-phone-hd", "android-tablet-7", "android-tablet-10"],
            description: "Default 'android-phone' (1080×1920).",
          },
          text_color: { type: "string" },
          device_frame: { type: "string", enum: ["samsung", "iphone"], description: "Default 'samsung'." },
          showcase: { type: "boolean" },
          showcase_caption: { type: "string" },
        },
        required: ["benefits", "output_dir"],
      },
    },
    {
      name: "render_localized_set",
      description:
        "Render the same ASO set in N languages with auto-translated headlines and per-language font fallbacks (CJK, Devanagari, " +
        "Arabic, Hebrew). RTL languages flip headline alignment. Each language lands in `output_root/<lang>/`, ready for ASC's " +
        "per-locale screenshot slots. Brand colour is shared across languages for visual consistency.",
      inputSchema: {
        type: "object",
        properties: {
          benefits: {
            type: "array", minItems: 1, maxItems: 10,
            items: {
              type: "object",
              properties: { image: { type: "string" }, verb: { type: "string" }, descriptor: { type: "string" } },
              required: ["image", "verb", "descriptor"],
            },
          },
          output_root: { type: "string" },
          languages: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "ISO 639-1 / BCP-47 codes — e.g. ['en','es','fr','de','ja','zh','ar','hi'].",
          },
          brand_color: { type: "string" },
          brand_gradient_to: { type: "string" },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
          },
          font: { type: "string" },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5", "android-phone", "android-phone-hd"],
          },
          text_color: { type: "string" },
          showcase: { type: "boolean" },
        },
        required: ["benefits", "output_root", "languages"],
      },
    },
    {
      name: "detect_empty_state",
      description:
        "Vision-classify simulator screenshots BEFORE pairing them with verbs in an ASO set. Rejects login, onboarding, paywall, " +
        "empty-list, loading, error, permission-prompt, and splash screens — the ones that waste a render slot and look like " +
        "nothing in the App Store carousel. Returns `verdict` per screenshot plus per-screen reasoning. Set `strictness: 'strict'` " +
        "to reject more aggressively. Requires ANTHROPIC_API_KEY (returns 'ok' for everything if unset).",
      inputSchema: {
        type: "object",
        properties: {
          image: {
            description: "Single path/data-URL/base64 or array.",
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" }, minItems: 1 }],
          },
          strictness: { type: "string", enum: ["lax", "normal", "strict"], description: "Default 'normal'." },
        },
        required: ["image"],
      },
    },
    {
      name: "suggest_headlines",
      description:
        "Vision-driven headline auto-writer. Given one simulator screenshot, returns N (default 3) ranked ACTION VERB + " +
        "DESCRIPTOR options that match what's actually on screen — removing the 'I have no idea what verb to use' friction. " +
        "Combine with `render_aso_set` (use the top suggestion) or surface all suggestions to the user for picking. " +
        "Optionally pass `app_name` and `app_description` to anchor the verb to the actual product. Requires ANTHROPIC_API_KEY.",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string" },
          app_name: { type: "string" },
          app_description: { type: "string" },
          domain: {
            type: "string",
            enum: [
              "auto", "finance", "fitness", "health", "wellness", "games", "kids",
              "productivity", "social", "creative", "education", "travel", "news",
              "shopping", "business", "developer",
            ],
          },
          count: { type: "integer", minimum: 1, maximum: 8, description: "Default 3." },
        },
        required: ["image"],
      },
    },
    {
      name: "clone_reference",
      description:
        "Programmatic version of the `clone_template` MCP prompt. Vision inspects a reference App Store screenshot and returns " +
        "a render decision JSON (`render_spec`) that drops straight into `render_screenshot`. Also returns the 8-element design " +
        "extraction (background, gradient, phone position, mode, glow, decoration, typography) plus the deterministic palette " +
        "and a retoned headline suggestion. Optionally pass `user_screenshot` + `user_app_name` so the headline is retoned for " +
        "the user's app, not the reference's.",
      inputSchema: {
        type: "object",
        properties: {
          reference_image: { type: "string", description: "Reference template path/data-URL/base64." },
          user_screenshot: { type: "string", description: "Optional. The user's raw app screenshot — used for headline retoning only." },
          user_app_name: { type: "string" },
          user_app_description: { type: "string" },
        },
        required: ["reference_image"],
      },
    },
    {
      name: "memory_read",
      description:
        "Read first-class skill memory. Replaces the 'Claude has to remember to write the right markdown file' failure mode " +
        "with a typed JSON store. Default `namespace` is auto-derived from the working directory's basename. Pass `key` to fetch " +
        "one entry; omit it to get the full store. Persisted under ~/.myindai-screenshot-mcp/memory/<namespace>.json (override with " +
        "MCP_MEMORY_DIR).",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string", description: "Default = cwd basename slug." },
          key: { type: "string", description: "Optional — return only this entry." },
        },
      },
    },
    {
      name: "memory_write",
      description:
        "Write/update/delete entries in the skill memory store. Provide either `{key, value}` to set one entry, `{key, delete: true}` " +
        "to remove it, or `{patch: {...}}` to merge multiple entries shallowly. Returns the resulting key list so callers can " +
        "verify what's persisted.",
      inputSchema: {
        type: "object",
        properties: {
          namespace: { type: "string" },
          key: { type: "string" },
          value: {},
          patch: { type: "object", additionalProperties: true },
          delete: { type: "boolean" },
        },
      },
    },
    {
      name: "record_telemetry",
      description:
        "Optional conversion-telemetry hook. Record what shipped (template, brand colour, headlines, set size, language, domain) " +
        "and — once measured — impressions/installs/conversion rate. Stored as JSONL at ~/.myindai-screenshot-mcp/telemetry/<app_id>.jsonl " +
        "(override with MCP_TELEMETRY_DIR). Use this to learn what converts in YOUR niche over time.",
      inputSchema: {
        type: "object",
        properties: {
          app_id: { type: "string" },
          template: { type: "string" },
          brand_color: { type: "string" },
          headlines: { type: "array", items: { type: "string" } },
          set_size: { type: "integer", minimum: 1, maximum: 10 },
          output_device: { type: "string" },
          language: { type: "string" },
          domain: { type: "string" },
          impressions: { type: "integer", minimum: 0 },
          installs: { type: "integer", minimum: 0 },
          conversion_rate: { type: "number", minimum: 0, maximum: 1 },
          notes: { type: "string" },
          extra: { type: "object", additionalProperties: true },
        },
        required: ["app_id"],
      },
    },
    {
      name: "list_telemetry",
      description:
        "Read recorded telemetry entries. Pass `app_id` to filter by app, omit to read across every recorded app. Returns the " +
        "most recent entries first plus a `best_conversion` pointer to the entry with the highest recorded `conversion_rate`.",
      inputSchema: {
        type: "object",
        properties: {
          app_id: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 500, description: "Default 100." },
        },
      },
    },
    {
      name: "list_assets",
      description:
        "List the bundled asset library — accent shapes (blobs, rings, wedges), decorations (dotted-grid, diagonal-lines, burst, " +
        "scattered-stars), device tints (radial glow), and patterns (wavy-lines). Each asset is an inline SVG that can be " +
        "tinted via `get_asset` and dropped into `render_screenshot.background.image` or composited downstream.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["accent-shape", "decoration", "device-tint", "pattern"],
          },
        },
      },
    },
    {
      name: "get_asset",
      description:
        "Fetch one bundled asset by id (call `list_assets` first). Pass `tint_color` (hex) to substitute the SVG's " +
        "`currentColor` placeholders so the asset matches your brand. Returns either raw SVG or a data-URL ready to drop into " +
        "an HTML/CSS surface.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          tint_color: { type: "string", description: "Hex like '#7c3aed'. Optional." },
          format: { type: "string", enum: ["svg", "data-url"], description: "Default 'data-url'." },
        },
        required: ["id"],
      },
    },
    {
      name: "make_showcase",
      description:
        "Compose multiple already-rendered App Store screenshots into a single side-by-side preview image. " +
        "Use this as the FINAL step in the `aso_appstore_screenshots` workflow once every screenshot in the set is approved — " +
        "it produces a shareable preview (e.g. for a portfolio, README, or PR description) showing the full set together. " +
        "Pass a `caption` to render a small label underneath (e.g. a GitHub URL).",
      inputSchema: {
        type: "object",
        properties: {
          screenshots: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            description: "Absolute or cwd-relative paths to the approved final screenshots, in display order.",
          },
          output_path: { type: "string", description: "Output PNG path (e.g. ./screenshots/showcase.png)." },
          caption: { type: "string", description: "Optional text rendered under the row (e.g. github.com/foo/bar)." },
          background: { type: "string", description: "Canvas background hex color. Default #ffffff." },
          text_color: { type: "string", description: "Caption text color. Default #1a1a1a." },
          target_height: { type: "integer", description: "Per-screenshot height in pixels. Default 800." },
          padding: { type: "integer", description: "Outer padding around the row. Default 60." },
          gap: { type: "integer", description: "Gap between adjacent screenshots. Default 40." },
        },
        required: ["screenshots", "output_path"],
      },
    },
    {
      name: "render_video_concept",
      description:
        "RECOMMENDED for product videos. Render a multi-act storyboard with proper enter/hold/exit timing and DECOUPLED text fade in/out. " +
        "Each act has its own motion keyframes, headline/subheadline, and fade timing. Acts join via 'cut' or 'crossfade'. " +
        "Use this when you want a real product video story (intro reveal → feature highlight → CTA), not just a single sweep. " +
        "First read `myindai://design-guide` motion section AND invoke the `design_product_video_concept` prompt to plan your acts before calling this tool. " +
        "Requires ffmpeg in PATH.",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string" },
          output_path: { type: "string" },
          fps: { type: "integer", minimum: 10, maximum: 60, description: "Default 30." },
          format: { type: "string", enum: ["mp4", "gif", "webm"], description: "Default mp4." },
          language: { type: "string" },
          output_device: { type: "string", enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"] },
          concept: {
            type: "object",
            description: "The storyboard. `base` is the static design (font, gradient, glow) shared across all acts; `acts` are the timed sequence.",
            properties: {
              base: {
                type: "object",
                description: "Decision shape — same as render_screenshot text/background/screenshot. Applied to every act.",
              },
              acts: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Optional human-readable label, e.g. 'Reveal'." },
                    duration: { type: "number", minimum: 0.2, maximum: 15, description: "Seconds." },
                    motion: {
                      type: "array",
                      minItems: 1,
                      description: "Keyframes within this act. Each: { t: 0..1 of act, decision: <render_screenshot decision delta> }.",
                      items: {
                        type: "object",
                        properties: {
                          t: { type: "number", minimum: 0, maximum: 1 },
                          decision: { type: "object" },
                        },
                        required: ["t", "decision"],
                      },
                    },
                    text: {
                      type: "object",
                      description: "Text content + fade timing for this act. Independent of motion. fade_in/hold/fade_out are fractions of the act's duration.",
                      properties: {
                        headline: { type: "string" },
                        subheadline: { type: "string" },
                        fade_in: { type: "number", minimum: 0, maximum: 1, description: "Default 0.15." },
                        hold: { type: "number", minimum: 0, maximum: 1 },
                        fade_out: { type: "number", minimum: 0, maximum: 1, description: "Default 0." },
                      },
                    },
                    transition: {
                      type: "object",
                      description: "How this act joins the NEXT one. Last act's transition is ignored.",
                      properties: {
                        kind: { type: "string", enum: ["cut", "crossfade"] },
                        duration: { type: "number", minimum: 0.05, maximum: 2, description: "Seconds (only for crossfade). Default 0.4s." },
                      },
                      required: ["kind"],
                    },
                  },
                  required: ["duration", "motion"],
                },
              },
            },
            required: ["acts"],
          },
          quality: {
            type: "string",
            enum: ["draft", "preview", "final"],
            description: "Speed/quality knob. Default 'preview' — fps/2 native + encoder frame-duplication. ~3-4× faster than 'final' with no visible quality loss for typical hero scenes.",
          },
          parallelism: { type: "integer", minimum: 1, maximum: 8 },
          smooth_motion: { type: "boolean", description: "Default false. Set true to re-enable motion-estimated upsampling (slow but smoother for fast rotation/pan)." },
        },
        required: ["image", "output_path", "concept"],
      },
    },
    {
      name: "render_video",
      description:
        "Single-scene product video. Use render_video_concept instead for storyboarded multi-act videos with proper enter/exit and decoupled text fades. " +
        "This tool is kept for simple one-sweep cases. Pick a scene (tilt-in for hero, float for loops, rotate-360 to show all sides, fade-in/zoom-in for 2D-friendly). " +
        "Requires ffmpeg in PATH.",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string", description: "absolute path | data: URL | base64" },
          output_path: { type: "string", description: "Required. Output file path (e.g. ./hero.mp4)." },
          duration_seconds: { type: "number", minimum: 0.5, maximum: 60, description: "Default 3. Up to 60s." },
          fps: { type: "integer", minimum: 10, maximum: 60, description: "Default 30." },
          format: { type: "string", enum: ["mp4", "gif", "webm"], description: "Default mp4." },
          scene: {
            type: "string",
            enum: ["tilt-in", "rotate-360", "float", "fade-in", "zoom-in", "custom"],
            description:
              "tilt-in: phone enters and lands in three-quarter view. rotate-360: full Y spin. " +
              "float: gentle 3-axis sway, loops cleanly. fade-in: 2D-friendly scale + headline fade. " +
              "zoom-in: phone scales from small to hero size. custom: provide custom_keyframes.",
          },
          intensity: {
            type: "number",
            minimum: 0.1,
            maximum: 1.5,
            description: "Scene intensity 0.1-1.5 (default 0.7). Higher = more pronounced motion.",
          },
          base: {
            type: "object",
            description:
              "The static look the scene animates around. Same shape as render_screenshot input " +
              "(headline, subheadline, mode, position_preset, background_preset, text_color, " +
              "background, screenshot, text). All optional.",
          },
          custom_keyframes: {
            type: "array",
            description: "Required when scene='custom'. Each keyframe: { t: 0..1, decision: <render_screenshot decision> }.",
            items: {
              type: "object",
              properties: {
                t: { type: "number", minimum: 0, maximum: 1 },
                decision: { type: "object" },
              },
              required: ["t", "decision"],
            },
          },
          language: { type: "string" },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"],
          },
          quality: {
            type: "string",
            enum: ["draft", "preview", "final"],
            description:
              "Speed/quality knob. Default 'preview' — renders at fps/2 native and lets the encoder duplicate frames to reach target fps (visually identical to every-frame rendering for slow scenes like tilt-in / float / fade). " +
              "'draft' renders at fps/3 (fastest, ~3-4× faster than 'final'). 'final' renders every frame (slowest, max fidelity, use for fast rotations or final delivery).",
          },
          parallelism: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Concurrent Chromium pages. Default 4 for draft/preview, 2 for final.",
          },
          smooth_motion: {
            type: "boolean",
            description: "Default false. Set true ONLY when frame duplication looks strobed (fast rotate-360 / pan scenes). Re-enables ffmpeg's `minterpolate` motion-estimated synthesis — adds 5-10× to encode time at 1320×2868.",
          },
        },
        required: ["image", "output_path"],
      },
    },
    {
      name: "auto_video",
      description:
        "FIRST CHOICE for any 'make me a video' / 'create a product video' / 'turn these screenshots into a video' request. " +
        "One-shot pipeline: takes a one-line vibe prompt + the user's screenshots, internally picks the best-fit named template (Claude vision when ANTHROPIC_API_KEY is set, deterministic vibe-keyword fallback otherwise), writes per-scene headlines tailored to the actual screen content, then renders the mp4. " +
        "The user does NOT need to know template names or write polish-grade descriptions. A prompt like 'premium fintech, calm and trustworthy' or 'fun gaming app, energetic' is enough. " +
        "Use this BEFORE list_video_templates / render_video_template — only fall back to those when the user explicitly wants to pick a template themselves or override the auto-written headlines. " +
        "DO NOT write any TS/JS/Python/shell scripts to make a video — this tool is the single entry point. Requires ffmpeg in PATH on the server.",
      inputSchema: {
        type: "object",
        properties: {
          images: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Absolute paths (or paths relative to cwd) to the user's app screenshots, in display order.",
          },
          output_path: { type: "string", description: "Output mp4 path. Ask the user if not implied." },
          prompt: {
            type: "string",
            description:
              "Optional one-line vibe / brand brief, e.g. 'premium fintech, calm and trustworthy' or 'energetic SaaS demo'. Empty is fine — the picker uses screenshot count to choose.",
          },
          app_name: { type: "string", description: "Optional. Used as the last-scene CTA headline." },
          template: {
            type: "string",
            description:
              "Optional. If the user already named a template, pass its slug here to skip auto-picking; headlines are still auto-written from the screenshots.",
          },
          fps: { type: "integer", minimum: 10, maximum: 60, description: "Default 30." },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"],
            description: "Default iphone-6.9.",
          },
          language: { type: "string", description: "Default en." },
          quality: {
            type: "string",
            enum: ["draft", "preview", "final"],
            description:
              "Speed/quality knob. Default 'preview' — renders at fps/2 native, encoder frame-duplicates to target. ~6× faster than 'final'.",
          },
          parallelism: { type: "integer", minimum: 1, maximum: 8, description: "Concurrent Chromium pages. Default 4 (preview/draft), 2 (final)." },
          smooth_motion: { type: "boolean", description: "Set true for fast rotation scenes that look strobed under frame duplication. Adds 5-10× encode time." },
        },
        required: ["images", "output_path"],
      },
    },
    {
      name: "list_video_templates",
      description:
        "List the named multi-scene video templates the renderer ships with (e.g. gravity-drop, parallax-layers, dolly-zoom, holographic-flip, cinematic-story-arc). " +
        "MANDATORY whenever the user asks to 'make a video', 'create a product video', 'turn screenshots into a video', or anything similar. Call this FIRST, present the options to the user (slug + name + style + duration + ideal screen count), then ask which one they want before calling render_video_template. " +
        "DO NOT write a custom TypeScript / JavaScript / Python script to make the video. The renderer is fully exposed through render_video_template — there is no scenario where authoring a new script is the right answer. If a template doesn't exist for a niche request, fall back to render_video_concept (still no script needed). " +
        "Returns an array of { slug, name, style, scenes, total_seconds, ideal_screens, fps }.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "render_video_template",
      description:
        "Render a polished multi-scene product video using a named template (see list_video_templates). " +
        "The template owns the storyboard (scene count, motion, pacing, background, fonts) — you only supply the screenshots, app name, and optional per-scene headlines. " +
        "Use this for the common case 'make me a product video of my app'. Use render_video_concept ONLY when the user explicitly asks for a custom storyboard. " +
        "DO NOT write a TS/JS/Python script that re-implements rendering or chains other tools — call this tool directly with the user's screenshots and the chosen template slug. The full pipeline (per-clip render + ffmpeg xfade concat + cleanup) runs server-side. " +
        "Requires ffmpeg in PATH on the server.",
      inputSchema: {
        type: "object",
        properties: {
          template: {
            type: "string",
            description: "Template slug from list_video_templates (e.g. 'gravity-drop', 'dolly-zoom', 'cinematic-story-arc').",
          },
          images: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Absolute paths (or paths relative to cwd) to the app screenshots. Provide as many as the template's `ideal_screens` if you can; if you provide fewer, shots cycle.",
          },
          output_path: {
            type: "string",
            description: "Output file path (e.g. ./hero.mp4).",
          },
          app_name: {
            type: "string",
            description: "Optional. Used as the default headline in scenes where the user didn't supply one.",
          },
          headlines: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional per-scene headlines, in scene order. Empty entries fall back to the spec's default. Auto-clipped to ≤4 words each.",
          },
          subheadlines: {
            type: "array",
            items: { type: "string" },
            description: "Optional per-scene subheadlines (≤8 words each).",
          },
          fps: { type: "integer", minimum: 10, maximum: 60, description: "Default 30." },
          output_device: {
            type: "string",
            enum: ["iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5"],
            description: "Default iphone-6.9.",
          },
          language: { type: "string", description: "Default en." },
          gradient: { type: "string", description: "Override the template's background gradient (preset name)." },
          accent: { type: "string", description: "Override the template's accent color (#RRGGBB) — drives glow." },
          font: { type: "string", description: "Override the template's font family." },
          mode: { type: "string", enum: ["2d", "3d"], description: "Override 2D vs 3D mode." },
          quality: {
            type: "string",
            enum: ["draft", "preview", "final"],
            description: "Speed/quality knob. Default 'preview' — fps/2 native + encoder frame-dup.",
          },
          parallelism: { type: "integer", minimum: 1, maximum: 8 },
          smooth_motion: { type: "boolean", description: "Default false. Opt-in motion-estimated upsampling for fast scenes." },
        },
        required: ["template", "images", "output_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === "render_screenshot") {
      const parsed = RenderInputSchema.parse(args ?? {});
      const result = await renderScreenshot(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "generate_screenshot") {
      const parsed = GenerateInputSchema.parse(args ?? {});
      const result = await generateScreenshot(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "list_presets") {
      const presets = await listPresets();
      return { content: [{ type: "text", text: JSON.stringify(presets, null, 2) }] };
    }

    if (name === "extract_palette") {
      const parsed = PaletteInputSchema.parse(args ?? {});
      const result = await extractPalette(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "make_showcase") {
      const parsed = ShowcaseInputSchema.parse(args ?? {});
      const result = await makeShowcase(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "pick_brand_color") {
      const parsed = PickBrandColorInputSchema.parse(args ?? {});
      const result = await pickBrandColor(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_aso_set") {
      const parsed = RenderAsoSetInputSchema.parse(args ?? {});
      const result = await renderAsoSet(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_multi_size") {
      const parsed = RenderMultiSizeInputSchema.parse(args ?? {});
      const result = await renderMultiSize(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_ab_variants") {
      const parsed = RenderAbVariantsInputSchema.parse(args ?? {});
      const result = await renderAbVariants(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_play_store_set") {
      const parsed = RenderPlayStoreSetInputSchema.parse(args ?? {});
      const result = await renderPlayStoreSet(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_localized_set") {
      const parsed = RenderLocalizedSetInputSchema.parse(args ?? {});
      const result = await renderLocalizedSet(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "detect_empty_state") {
      const parsed = DetectEmptyStateInputSchema.parse(args ?? {});
      const result = await detectEmptyState(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "suggest_headlines") {
      const parsed = SuggestHeadlinesInputSchema.parse(args ?? {});
      const result = await suggestHeadlines(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "clone_reference") {
      const parsed = CloneReferenceInputSchema.parse(args ?? {});
      const result = await cloneReference(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "memory_read") {
      const parsed = MemoryReadInputSchema.parse(args ?? {});
      const result = await memoryRead(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "memory_write") {
      const parsed = MemoryWriteInputSchema.parse(args ?? {});
      const result = await memoryWrite(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "record_telemetry") {
      const parsed = RecordTelemetryInputSchema.parse(args ?? {});
      const result = await recordTelemetry(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "list_telemetry") {
      const parsed = ListTelemetryInputSchema.parse(args ?? {});
      const result = await listTelemetry(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "list_assets") {
      const parsed = ListAssetsInputSchema.parse(args ?? {});
      const result = await listAssets(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "get_asset") {
      const parsed = GetAssetInputSchema.parse(args ?? {});
      const result = await getAsset(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_video") {
      const parsed = VideoInputSchema.parse(args ?? {});
      const result = await renderVideo(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "render_video_concept") {
      const parsed = VideoConceptInputSchema.parse(args ?? {});
      const result = await renderVideoConcept(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "list_video_templates") {
      const list = listVideoTemplates();
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    if (name === "render_video_template") {
      const parsed = RenderVideoTemplateInputSchema.parse(args ?? {});
      const result = await renderVideoTemplate(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "auto_video") {
      const parsed = AutoVideoInputSchema.parse(args ?? {});
      const result = await autoVideo(parsed);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }], isError: true };
  }
});

// ----------------------------------------------------------------------------
// Resources
// ----------------------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  const r = await readResource(uri);
  return { contents: [r] };
});

// ----------------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------------

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  return await getPrompt(name, args);
});

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------

async function doctor() {
  process.stdout.write(`[myindai-screenshot-mcp] doctor — diagnosing the environment as the MCP process sees it\n\n`);
  process.stdout.write(`myindai-screenshot-mcp version : 1.0.0-rc.3\n`);
  process.stdout.write(`node                            : ${process.version}\n`);
  process.stdout.write(`platform                        : ${process.platform} (${process.arch})\n`);
  process.stdout.write(`cwd                             : ${process.cwd()}\n`);
  process.stdout.write(`PATH                            : ${process.env.PATH || "<empty>"}\n`);
  process.stdout.write(
    `ANTHROPIC_API_KEY               : ${process.env.ANTHROPIC_API_KEY ? "set (direct-API fallback active)" : "unset (rc.1 default — uses your MCP client's LLM via sampling when needed)"}\n`
  );
  process.stdout.write(`ANTHROPIC_MODEL                 : ${process.env.ANTHROPIC_MODEL || "claude-opus-4-7 (default, only used if direct-API fallback is active)"}\n`);
  process.stdout.write(`FFMPEG_PATH                     : ${process.env.FFMPEG_PATH || "unset (rc.1: video tools not enabled — will probe in v1.1.0)"}\n`);
  process.stdout.write(`FFPROBE_PATH                    : ${process.env.FFPROBE_PATH || "unset (rc.1: video tools not enabled — will probe in v1.1.0)"}\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`---- ffmpeg / ffprobe resolution (informational; not required in rc.1) ----\n`);
  try {
    const ff = await ensureFfmpeg();
    process.stdout.write(`ffmpeg                          : ✅ ${ff}\n`);
  } catch (e: any) {
    process.stdout.write(`ffmpeg                          : (not found) ${e?.message || e}\n`);
  }
  try {
    const fp = await ensureFfprobe();
    process.stdout.write(`ffprobe                         : ✅ ${fp}\n`);
  } catch (e: any) {
    process.stdout.write(`ffprobe                         : (not found) ${e?.message || e}\n`);
  }
  process.stdout.write(`\n`);
  process.stdout.write(`v1.0.0-rc.3 status:\n`);
  process.stdout.write(`  - LLM not required for any working tool. Vision tools land in v1.0.0-rc.3 via MCP sampling.\n`);
  process.stdout.write(`  - ffmpeg / ffprobe not required for any working tool. Video tools land in v1.1.0.\n`);
}

async function installSkill(): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // Probe candidate skill source paths — works for both dev (pkg/../skills) and
  // published layout (pkg/skills) since prepack copies skills/ into mcp/.
  const candidates = [
    path.resolve(here, "..", "skills", "myindai-screenshot"),
    path.resolve(here, "..", "..", "skills", "myindai-screenshot"),
  ];
  let src: string | null = null;
  for (const c of candidates) {
    try {
      await fs.access(path.join(c, "SKILL.md"));
      src = c;
      break;
    } catch {}
  }
  if (!src) {
    process.stderr.write(
      `[myindai-screenshot-mcp] --install-skill: could not locate the bundled skill folder. Tried:\n  ${candidates.join("\n  ")}\n`
    );
    process.exit(1);
  }
  const dst = path.join(os.homedir(), ".claude", "skills", "myindai-screenshot");
  await fs.rm(dst, { recursive: true, force: true });
  await fs.cp(src, dst, { recursive: true });
  process.stdout.write(`✅ skill installed at ${dst}\n`);
  process.stdout.write(`\nNext: make sure the MCP server is also configured. Either:\n`);
  process.stdout.write(`  claude mcp add myindai-screenshot -- npx -y myindai-screenshot-mcp\n`);
  process.stdout.write(`or paste this into your MCP client's mcp_config.json:\n`);
  process.stdout.write(`  { "mcpServers": { "myindai-screenshot": { "command": "npx", "args": ["-y", "myindai-screenshot-mcp"] } } }\n`);
  process.stdout.write(`\nThen restart your client and say e.g. "make App Store screenshots for my app".\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--doctor") || args.includes("doctor")) {
    await doctor();
    return;
  }
  if (args.includes("--install-skill") || args.includes("install-skill")) {
    await installSkill();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`myindai-screenshot-mcp 1.0.0-rc.3\n`);
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        `myindai-screenshot-mcp 1.0.0-rc.3 — App Store / Play Store screenshot + video MCP`,
        ``,
        `Usage:`,
        `  myindai-screenshot-mcp                start the stdio MCP server (default — what MCP clients invoke)`,
        `  myindai-screenshot-mcp --doctor       diagnose the environment (PATH, ffmpeg, sampling availability)`,
        `  myindai-screenshot-mcp --install-skill  copy the bundled Claude Code skill into ~/.claude/skills/`,
        `  myindai-screenshot-mcp --version      print version`,
        `  myindai-screenshot-mcp --help         print this help`,
        ``,
        `Env (all optional — rc.1 has zero required env vars):`,
        `  ANTHROPIC_API_KEY      CI / non-interactive escape hatch. Calls Anthropic directly instead of asking the client.`,
        `                         For interactive MCP-client use, do NOT set this — the server uses sampling.`,
        `  ANTHROPIC_MODEL        Override the Anthropic model (default: claude-opus-4-7). Only honoured when ANTHROPIC_API_KEY is set.`,
        `  FFMPEG_PATH            Absolute path to ffmpeg, when not in the inherited PATH. Only needed once video tools land (v1.1.0).`,
        `  FFPROBE_PATH           Absolute path to ffprobe (only needed if it sits outside the FFMPEG_PATH dir).`,
        `  MCP_DEBUG              When set, log resolver decisions to stderr.`,
        `  MCP_MEMORY_DIR         Override the on-disk memory location (default: ~/.myindai-screenshot-mcp/memory/).`,
        `  MCP_TELEMETRY_DIR      Override the on-disk telemetry location (default: ~/.myindai-screenshot-mcp/telemetry/).`,
        ``,
      ].join("\n")
    );
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[myindai-screenshot-mcp] ready (stdio) — tools, resources, prompts\n");
}

main().catch((err) => {
  process.stderr.write(`[myindai-screenshot-mcp] fatal: ${err?.message || err}\n`);
  process.exit(1);
});
