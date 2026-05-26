// renderer: app: window.__mcp implementation for v1.0.0-rc.1
// (clean-room, from spec §1–§6)
//
// Contract (server expectation, see docs/clean-room-rewrite.md):
//   window.__mcp.ready          : Promise<void>
//   window.__mcp.applySpec(spec): Promise<void>
//   window.__mcp.exportCanvasAsPng(): string  (base64, no data: prefix)
//   window.__mcp.listPresets()  : PresetCatalog
//
// v1.0.0-rc.1 scope: one template (clean-minimal), one effective device
// (iphone-15-pro-max → 1290×2796). Other catalogue entries are listed for
// validation but resolve to the same 6.7" geometry until rc.2.

import { setupThreeRenderer } from "./three-renderer.js";
import { resolveLocale, pickFontForLocale } from "./language-utils.js";

const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d");

const debugEl = document.getElementById("debug");
function debug(msg) {
  // The server scrapes lines starting with [mcp-debug] from page console.
  console.log("[mcp-debug] " + msg);
  if (window.__mcp_debug) {
    debugEl.hidden = false;
    debugEl.textContent += msg + "\n";
  }
}

// --- Preset catalogue (spec §5) -------------------------------------------

const PRESET_CATALOG = {
  contractVersion: 1,
  positionPresets: ["center", "top", "bottom", "tilt-left", "tilt-right"],
  positionPresetDetails: {
    "center":     { scale: 1.0,  x: 0,    y: 0,    rotation: 0,   perspective: 0    },
    "top":        { scale: 0.9,  x: 0,    y: -200, rotation: 0,   perspective: 0    },
    "bottom":     { scale: 0.9,  x: 0,    y: 200,  rotation: 0,   perspective: 0    },
    "tilt-left":  { scale: 0.92, x: -50,  y: 0,    rotation: -8,  perspective: 0.05 },
    "tilt-right": { scale: 0.92, x: 50,   y: 0,    rotation: 8,   perspective: 0.05 },
  },
  gradientPresets: [
    { name: "sunset", gradient: "linear-gradient(180deg, #ff8a00, #e52e71)" },
    { name: "ocean",  gradient: "linear-gradient(180deg, #00c6ff, #0072ff)" },
    { name: "forest", gradient: "linear-gradient(180deg, #11998e, #38ef7d)" },
    { name: "violet", gradient: "linear-gradient(180deg, #6a11cb, #2575fc)" },
    { name: "peach",  gradient: "linear-gradient(180deg, #ffecd2, #fcb69f)" },
  ],
  modes: ["light", "dark"],
  textPositions: ["top", "bottom", "center"],
  fontFamilies: ["Inter", "Manrope", "system-ui"],
  fontWeights: ["400", "500", "600", "700", "800"],
  backgroundTypes: ["solid", "gradient", "blurred-screenshot"],
  imageFits: ["contain", "cover"],
  // Issue #10 fix: every device key the server's tools/render.ts schema enum
  // advertises MUST resolve here. Apple's App Store-required pixel dimensions:
  outputDevices: [
    "iphone-6.9", "iphone-6.7", "iphone-6.5", "iphone-5.5",
    "iphone-15-pro-max", "google-pixel-8",
  ],
  canvasDimensions: {
    "iphone-6.9":        { width: 1320, height: 2868 },
    "iphone-6.7":        { width: 1290, height: 2796 },
    "iphone-6.5":        { width: 1242, height: 2688 },
    "iphone-5.5":        { width: 1242, height: 2208 },
    "iphone-15-pro-max": { width: 1290, height: 2796 },
    "google-pixel-8":    { width: 1080, height: 2400 },
  },
};

// --- Template registry (spec §4) ------------------------------------------

const TEMPLATES = new Map();

TEMPLATES.set("clean-minimal", {
  name: "clean-minimal",
  description:
    "Minimal preview template — solid or gradient background, headline above device, screenshot centred in a soft rounded frame.",
  defaults: {
    background: "ocean",
    fontFamily: "Inter",
    fontWeight: "700",
    textPosition: "top",
    mode: "light",
    imageFit: "contain",
  },
  async render(spec, canvasCtx, three) {
    const decision = normalizeDecision(spec.decision, this.defaults);
    const locale = resolveLocale(spec.language);
    const font = pickFontForLocale(locale, decision.fontFamily);
    const { width, height } = canvas;

    paintBackground(canvasCtx, decision, width, height);

    const image = await loadInputImage(spec.dataUrl);

    // Issues #4 + #6: read screenshot overrides + positionPreset.
    const sx = decision.screenshot && typeof decision.screenshot === "object" ? decision.screenshot : {};
    const positionPreset = decision.positionPreset
      && PRESET_CATALOG.positionPresetDetails[decision.positionPreset]
      ? PRESET_CATALOG.positionPresetDetails[decision.positionPreset]
      : null;

    // Issue #5: read text overrides.
    const tx = decision.text && typeof decision.text === "object" ? decision.text : {};

    const layout = computeLayout({
      canvasW: width,
      canvasH: height,
      textPosition: tx.position || decision.textPosition,
      hasHeadline: Boolean(decision.headline),
      hasSubheadline: Boolean(decision.subheadline),
      screenshotOverride: sx,
      positionPreset,
      textOffsetY: tx.offsetY,
    });

    drawDevice(canvasCtx, three, layout.device, sx);
    drawScreenshot(canvasCtx, image, layout.screen, decision.imageFit, sx, layout.device);

    if (decision.headline) {
      drawText(canvasCtx, {
        text: decision.headline,
        x: width / 2,
        y: layout.headlineY,
        maxWidth: width * (tx.headlineMaxWidthPct ? tx.headlineMaxWidthPct / 100 : 0.86),
        fontSize: scaleText(width, tx.headlineSize, 0.062),
        fontWeight: tx.headlineWeight || decision.fontWeight,
        font: tx.headlineFont || tx.font || font,
        color: tx.headlineColor || (decision._isLight ? "#ffffff" : "#0a0a0a"),
        align: tx.headlineTextAlign || "center",
        baseline: "middle",
        lineHeight: tx.lineHeight || 1.1,
        letterSpacing: typeof tx.headlineLetterSpacing === "number" ? tx.headlineLetterSpacing : 0,
        italic: Boolean(tx.headlineItalic),
        underline: Boolean(tx.headlineUnderline),
        highlight: tx.headlineHighlightWord ? {
          word: tx.headlineHighlightWord,
          color: tx.headlineHighlightColor || "#fde68a",
          style: tx.headlineHighlightStyle || "color",  // "color" | "pill"
          pillTextColor: tx.headlineHighlightPillTextColor,
        } : null,
      });
    }
    if (decision.subheadline) {
      drawText(canvasCtx, {
        text: decision.subheadline,
        x: width / 2,
        y: layout.subheadlineY,
        maxWidth: width * 0.82,
        fontSize: scaleText(width, tx.subheadlineSize, 0.034),
        fontWeight: tx.subheadlineWeight || "500",
        font: tx.subheadlineFont || tx.font || font,
        color: tx.subheadlineColor || (decision._isLight ? "#dddddd" : "#3a3a3a"),
        align: tx.subheadlineTextAlign || "center",
        baseline: "middle",
        lineHeight: tx.lineHeight || 1.25,
        letterSpacing: 0,
      });
    }

    debug(`rendered clean-minimal ${width}×${height} (locale=${locale.tag}, bg=${decision._bgKind}, preset=${decision.positionPreset || "none"}, scale=${sx.scale ?? "auto"})`);
  },
});

// scaleText: design-skill semantics — text.headlineSize/subheadlineSize are
// authored against a 1320 px-wide canvas. We scale proportionally to the
// actual canvas width. If no override is given, fall back to a fraction of
// the canvas width (the legacy behaviour).
function scaleText(canvasW, authoredPx, fallbackFraction) {
  if (typeof authoredPx === "number" && authoredPx > 0) {
    return Math.round((authoredPx / 1320) * canvasW);
  }
  return Math.round(canvasW * fallbackFraction);
}

// --- Helpers --------------------------------------------------------------

// renderer: bug #1 fix — accept every server-side field-name variant.
// Server (`mcp/src/tools/render.ts`) sets `backgroundPreset` (camelCase) and
// `textColor`; original frontend contract used `background` and `mode`.
// Render-time normalisation keeps both paths working — render_screenshot,
// generate_screenshot, render_aso_set, and any future tool that builds the
// decision object can use whichever convention they prefer.
function normalizeDecision(raw, defaults) {
  const d = { ...defaults, ...(raw || {}) };

  // Background. Three legal shapes:
  //   (a) decision.background = "<presetName>"          ← original contract
  //   (b) decision.backgroundPreset = "<presetName>"    ← what render_screenshot sends
  //   (c) decision.background = { type, gradient|solid|image, ... } ← rich object
  //       (also sent by render_screenshot as input.background)
  let bgPreset = null;
  let bgObject = null;
  let bgKind = "none";
  if (d.background && typeof d.background === "object") {
    bgObject = d.background;
    bgKind = `object:${bgObject.type || "unknown"}`;
  } else if (typeof d.backgroundPreset === "string" && d.backgroundPreset.trim()) {
    bgPreset = d.backgroundPreset.trim();
    bgKind = `preset:${bgPreset}`;
  } else if (typeof d.background_preset === "string" && d.background_preset.trim()) {
    bgPreset = d.background_preset.trim();
    bgKind = `preset:${bgPreset}`;
  } else if (typeof d.background === "string" && d.background.trim()) {
    bgPreset = d.background.trim();
    bgKind = `preset:${bgPreset}`;
  }

  // Text light/dark. Semantic per issue #7: `text_color: "light"` means
  // **render light (white) text** — for use on dark backgrounds. The old code
  // compared `decision.mode === "dark"` but mode is "2d"|"3d" on the server
  // contract, so the path was effectively dead.
  // Default: light text (the bundled preset gradients are medium-to-dark, so
  // white headlines are the more useful default than black).
  const textColorRaw = d.textColor || d.text_color;
  let isLight;
  if (textColorRaw === "light") isLight = true;
  else if (textColorRaw === "dark") isLight = false;
  else if (d.mode === "dark") isLight = true;  // legacy: mode=dark theme → light text
  else if (d.mode === "light") isLight = false; // legacy: mode=light theme → dark text
  else isLight = true;

  // Nested text overrides (server passes input.text through verbatim).
  const tx = d.text && typeof d.text === "object" ? d.text : {};
  const fontFamily = d.fontFamily || tx.font || tx.fontFamily || defaults.fontFamily;
  const fontWeight = d.fontWeight || tx.headlineWeight || tx.fontWeight || defaults.fontWeight;

  return {
    ...d,
    fontFamily,
    fontWeight,
    textPosition: d.textPosition || d.text_position || defaults.textPosition,
    imageFit: d.imageFit || d.image_fit || defaults.imageFit,
    _bgPreset: bgPreset,
    _bgObject: bgObject,
    _bgKind: bgKind,
    _isLight: isLight,
  };
}

function paintBackground(c, decision, w, h) {
  // (a) rich background object — gradient or solid or image.
  if (decision._bgObject) {
    const bg = decision._bgObject;
    if (bg.type === "gradient" && bg.gradient) {
      paintGradientObject(c, bg.gradient, w, h);
      return;
    }
    if (bg.type === "solid" && bg.solid) {
      c.fillStyle = bg.solid;
      c.fillRect(0, 0, w, h);
      return;
    }
    // type "image" not implemented yet (lands with vision tools in rc.x).
  }

  // (b) named preset — case-insensitive lookup so "Ocean" and "ocean" both work.
  if (decision._bgPreset) {
    const name = decision._bgPreset;
    const preset = PRESET_CATALOG.gradientPresets.find(
      (g) => g.name === name || g.name.toLowerCase() === name.toLowerCase()
    );
    if (preset) { paintCssGradient(c, preset.gradient, w, h); return; }
    // Inline CSS gradient string.
    if (name.startsWith("linear-gradient")) { paintCssGradient(c, name, w, h); return; }
    // Hex / rgb / hsl colour.
    if (/^#|^rgb|^hsl/.test(name)) { c.fillStyle = name; c.fillRect(0, 0, w, h); return; }
  }

  // (c) fallback solid.
  c.fillStyle = decision._isLight ? "#0a0a0a" : "#ffffff";
  c.fillRect(0, 0, w, h);
}

// Paint a gradient defined by the rich background.gradient object:
//   { angle: <0-360>, stops: [{ color, position }, ...] }
function paintGradientObject(c, g, w, h) {
  if (!g.stops || !g.stops.length) { c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h); return; }
  const angleDeg = typeof g.angle === "number" ? g.angle : 180;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  const r = Math.max(w, h);
  const grad = c.createLinearGradient(
    cx - Math.cos(angleRad) * r,
    cy - Math.sin(angleRad) * r,
    cx + Math.cos(angleRad) * r,
    cy + Math.sin(angleRad) * r
  );
  for (const stop of g.stops) {
    const pos = typeof stop.position === "number" ? Math.max(0, Math.min(1, stop.position / 100)) : 0;
    grad.addColorStop(pos, stop.color || "#000000");
  }
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
}

// Parse a small subset of CSS `linear-gradient(...)` strings well enough for
// our preset palette. Format: `linear-gradient(<angle>deg, <color>, <color>[, ...])`.
function paintCssGradient(c, css, w, h) {
  const m = css.match(/linear-gradient\(\s*([^,]+),\s*(.+)\s*\)/);
  if (!m) { c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h); return; }
  const angleRaw = m[1].trim();
  const colors = splitCsv(m[2]).map((s) => s.trim());
  const angleDeg = angleRaw.endsWith("deg") ? parseFloat(angleRaw) : 180;
  const angleRad = ((angleDeg - 90) * Math.PI) / 180; // CSS angle → canvas angle
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(w, h);
  const x0 = cx - Math.cos(angleRad) * r;
  const y0 = cy - Math.sin(angleRad) * r;
  const x1 = cx + Math.cos(angleRad) * r;
  const y1 = cy + Math.sin(angleRad) * r;
  const grad = c.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((col, i) => grad.addColorStop(i / (colors.length - 1), col));
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
}

function splitCsv(s) {
  // CSS gradient stops can contain commas inside rgb(...) — keep it simple:
  // we only support plain hex/rgb-no-comma colors in v1.0.0-rc.1.
  return s.split(",");
}

async function loadInputImage(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    throw new Error("applySpec: invalid spec.dataUrl (expected data:image/* URL)");
  }
  const img = new Image();
  img.decoding = "async";
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("applySpec: failed to decode input image"));
    img.src = dataUrl;
  });
}

// Issues #4 + #6: layout now consumes screenshot.{scale,x,y,rotation} and the
// positionPreset's pre-canned offsets/rotation. Authoring semantics match the
// design-templates skill: scale/x/y are **percentages**; x=50/y=80 anchors the
// device CENTER at (50% canvas width, 80% canvas height); scale=73 means the
// device width is 73% of canvas width.
function computeLayout({ canvasW, canvasH, textPosition, hasHeadline, hasSubheadline, screenshotOverride, positionPreset, textOffsetY }) {
  const sx = screenshotOverride || {};
  const pp = positionPreset || null;
  const margin = Math.round(canvasW * 0.065);
  const headlineBlockH = (hasHeadline ? Math.round(canvasW * 0.10) : 0)
    + (hasSubheadline ? Math.round(canvasW * 0.055) : 0)
    + (hasHeadline || hasSubheadline ? Math.round(canvasW * 0.04) : 0);

  // Base text Y (still respects textPosition / textOffsetY %).
  let headlineY = 0;
  let subheadlineY = 0;
  if (textPosition === "bottom") {
    headlineY = canvasH - headlineBlockH - margin * 0.6;
    subheadlineY = headlineY + Math.round(canvasW * 0.08);
  } else if (textPosition === "center") {
    headlineY = canvasH * 0.45;
    subheadlineY = headlineY + Math.round(canvasW * 0.07);
  } else {
    headlineY = margin * 0.9 + (hasHeadline ? Math.round(canvasW * 0.055) : 0);
    subheadlineY = headlineY + Math.round(canvasW * 0.082);
  }
  // Text overrides — design-skill says offsetY is a percentage (−100..100).
  if (typeof textOffsetY === "number") {
    const shift = (textOffsetY / 100) * canvasH;
    headlineY += shift;
    subheadlineY += shift;
  }

  // Device sizing. Override > preset > default 78%.
  const defaultScalePct = 78;
  const scalePct = typeof sx.scale === "number"
    ? sx.scale
    : pp ? defaultScalePct * pp.scale : defaultScalePct;
  const deviceWidth = Math.round(canvasW * (scalePct / 100));
  const deviceHeight = Math.round(deviceWidth * 2.165); // iPhone 6.x aspect

  // Device CENTER position. Override.x/y are percentages of canvas.
  // Preset.x/y are pixel offsets from canvas center.
  const centerX = typeof sx.x === "number"
    ? (sx.x / 100) * canvasW
    : (canvasW / 2) + (pp ? pp.x : 0);
  // Default device-center Y depends on text position so device + text don't
  // overlap. If user supplied y override, use that absolute placement instead.
  let centerY;
  if (typeof sx.y === "number") {
    centerY = (sx.y / 100) * canvasH;
  } else {
    let baseDeviceTop;
    if (textPosition === "bottom") baseDeviceTop = margin * 1.2;
    else if (textPosition === "center") baseDeviceTop = margin * 2.2;
    else baseDeviceTop = headlineBlockH + margin * 1.4;
    centerY = baseDeviceTop + deviceHeight / 2 + (pp ? pp.y : 0);
  }

  const deviceX = Math.round(centerX - deviceWidth / 2);
  const deviceY = Math.round(centerY - deviceHeight / 2);

  // Rotation: explicit override wins; otherwise preset.
  const rotationDeg = typeof sx.rotation === "number"
    ? sx.rotation
    : pp ? pp.rotation : 0;

  // Inset the screen inside the device frame; tunable per-device in rc.x.
  const cornerRadius = typeof sx.cornerRadius === "number"
    ? sx.cornerRadius
    : Math.round(deviceWidth * 0.085);
  const bezel = Math.round(deviceWidth * 0.025);
  const screen = {
    x: deviceX + bezel,
    y: deviceY + bezel,
    w: deviceWidth - bezel * 2,
    h: deviceHeight - bezel * 2,
    radius: Math.max(cornerRadius - bezel, 0),
  };

  return {
    device: { x: deviceX, y: deviceY, w: deviceWidth, h: deviceHeight, rotation: rotationDeg, cornerRadius },
    screen,
    headlineY,
    subheadlineY,
  };
}

function drawDevice(c, three, frame, screenshotOverride) {
  const sx = screenshotOverride || {};
  c.save();
  // Rotation around device center.
  if (frame.rotation) {
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    c.translate(cx, cy);
    c.rotate((frame.rotation * Math.PI) / 180);
    c.translate(-cx, -cy);
  }

  // Shadow override.
  const shadow = (sx.shadow && typeof sx.shadow === "object") ? sx.shadow : null;
  if (shadow && shadow.enabled !== false) {
    c.shadowColor = hexWithAlpha(shadow.color || "#000000", typeof shadow.opacity === "number" ? shadow.opacity / 100 : 0.22);
    c.shadowBlur = typeof shadow.blur === "number" ? shadow.blur : 60;
    c.shadowOffsetX = typeof shadow.x === "number" ? shadow.x : 0;
    c.shadowOffsetY = typeof shadow.y === "number" ? shadow.y : 30;
  } else {
    c.shadowColor = "rgba(0, 0, 0, 0.22)";
    c.shadowBlur = 60;
    c.shadowOffsetY = 30;
  }
  three.drawDeviceFrame(c, {
    x: frame.x,
    y: frame.y,
    width: frame.w,
    height: frame.h,
    cornerRadius: frame.cornerRadius,
    fill: "#0a0a0a",
  });

  // Glow override — second pass with a coloured halo.
  const glow = (sx.glow && typeof sx.glow === "object") ? sx.glow : null;
  if (glow && glow.enabled !== false && (typeof glow.intensity !== "number" || glow.intensity > 0)) {
    c.shadowColor = hexWithAlpha(glow.color || "#ffffff", typeof glow.intensity === "number" ? glow.intensity / 100 : 0.5);
    c.shadowBlur = typeof glow.size === "number" ? glow.size : 100;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 0;
    three.drawDeviceFrame(c, {
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
      cornerRadius: frame.cornerRadius,
      fill: "#0a0a0a",
    });
  }

  c.restore();
}

function drawScreenshot(c, image, screen, fit, screenshotOverride, frame) {
  c.save();
  // Match device rotation so screenshot stays inside the frame.
  if (frame && frame.rotation) {
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    c.translate(cx, cy);
    c.rotate((frame.rotation * Math.PI) / 180);
    c.translate(-cx, -cy);
  }
  roundRectPath(c, screen.x, screen.y, screen.w, screen.h, screen.radius || Math.round(screen.w * 0.065));
  c.clip();

  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  let dw, dh, dx, dy;
  if (fit === "cover") {
    const scale = Math.max(screen.w / iw, screen.h / ih);
    dw = iw * scale;
    dh = ih * scale;
    dx = screen.x + (screen.w - dw) / 2;
    dy = screen.y + (screen.h - dh) / 2;
  } else {
    const scale = Math.min(screen.w / iw, screen.h / ih);
    dw = iw * scale;
    dh = ih * scale;
    dx = screen.x + (screen.w - dw) / 2;
    dy = screen.y + (screen.h - dh) / 2;
  }
  c.drawImage(image, dx, dy, dw, dh);
  c.restore();
}

// Issue #5: drawText now honours letter spacing, italic, underline, and the
// headlineHighlightWord ("color" or "pill" style). Fields not covered:
// headlineGradient + headlineStrikethrough land in rc.x.
function drawText(c, opts) {
  const { text, x, y, maxWidth, fontSize, fontWeight, font, color, align, baseline, lineHeight,
          letterSpacing, italic, underline, highlight } = opts;
  c.save();
  c.fillStyle = color;
  const styleParts = [];
  if (italic) styleParts.push("italic");
  styleParts.push(String(fontWeight));
  styleParts.push(`${fontSize}px`);
  c.font = `${styleParts.join(" ")} "${font}", "Inter", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = baseline;
  if (typeof c.letterSpacing === "string") {
    // Chromium ≥ 99 supports CSS letter-spacing on canvas.
    c.letterSpacing = `${letterSpacing || 0}px`;
  }

  const lines = wrapText(c, text, maxWidth);
  const lh = Math.round(fontSize * lineHeight);
  const startY = y - ((lines.length - 1) * lh) / 2;

  lines.forEach((line, i) => {
    const yy = startY + i * lh;
    if (highlight && line.toLowerCase().includes(highlight.word.toLowerCase())) {
      drawLineWithHighlight(c, line, x, yy, align, highlight, fontSize, color);
    } else {
      c.fillText(line, x, yy);
    }
    if (underline) {
      const w = c.measureText(line).width;
      const ux = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
      const uy = yy + fontSize * 0.5;
      c.fillRect(ux, uy + 4, w, Math.max(2, Math.round(fontSize * 0.04)));
    }
  });
  c.restore();
}

// Split a line at the highlight word; paint highlight word in highlight.color
// (or as a coloured pill behind the word for style="pill").
function drawLineWithHighlight(c, line, x, y, align, highlight, fontSize, baseColor) {
  const idx = line.toLowerCase().indexOf(highlight.word.toLowerCase());
  const before = line.slice(0, idx);
  const word = line.slice(idx, idx + highlight.word.length);
  const after = line.slice(idx + highlight.word.length);
  const wBefore = c.measureText(before).width;
  const wWord = c.measureText(word).width;
  const wAfter = c.measureText(after).width;
  const total = wBefore + wWord + wAfter;
  let startX;
  if (align === "center") startX = x - total / 2;
  else if (align === "right") startX = x - total;
  else startX = x;

  const savedAlign = c.textAlign;
  c.textAlign = "left";
  c.fillStyle = baseColor;
  c.fillText(before, startX, y);
  if (highlight.style === "pill") {
    const padX = fontSize * 0.18;
    const padY = fontSize * 0.10;
    c.fillStyle = highlight.color;
    roundRectPath(c, startX + wBefore - padX, y - fontSize * 0.5 - padY, wWord + padX * 2, fontSize + padY * 2, fontSize * 0.18);
    c.fill();
    c.fillStyle = highlight.pillTextColor || "#1a1a1a";
  } else {
    c.fillStyle = highlight.color;
  }
  c.fillText(word, startX + wBefore, y);
  c.fillStyle = baseColor;
  c.fillText(after, startX + wBefore + wWord, y);
  c.textAlign = savedAlign;
}

// Hex → rgba helper for shadow/glow opacity.
function hexWithAlpha(hex, alpha) {
  if (!hex || typeof hex !== "string") return `rgba(0, 0, 0, ${alpha})`;
  const m = hex.replace("#", "");
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16), g = parseInt(m[1] + m[1], 16), b = parseInt(m[2] + m[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function wrapText(c, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? current + " " + word : word;
    if (c.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [String(text)];
}

function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// --- Public surface (spec §1) ---------------------------------------------

const three = setupThreeRenderer();

const ready = (async () => {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* ignore — system fallback is fine */ }
  }
  debug("ready");
})();

const mcp = {
  ready,

  async applySpec(spec) {
    if (!spec || typeof spec !== "object") {
      throw new Error("applySpec: spec must be an object");
    }
    const decision = spec.decision || {};
    const templateName = decision.template || "clean-minimal";
    const tpl = TEMPLATES.get(templateName);
    if (!tpl) throw new Error("unknown template: " + templateName);

    const deviceKey = spec.outputDevice || "iphone-15-pro-max";
    const dim = PRESET_CATALOG.canvasDimensions[deviceKey];
    if (!dim) throw new Error("unknown outputDevice: " + deviceKey);

    if (canvas.width !== dim.width) canvas.width = dim.width;
    if (canvas.height !== dim.height) canvas.height = dim.height;

    await tpl.render(spec, ctx, three);
  },

  exportCanvasAsPng() {
    const url = canvas.toDataURL("image/png");
    const idx = url.indexOf(",");
    return idx >= 0 ? url.slice(idx + 1) : url;
  },

  listPresets() {
    return PRESET_CATALOG;
  },
};

window.__mcp = mcp;
