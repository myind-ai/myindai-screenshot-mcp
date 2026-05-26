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
  outputDevices: ["iphone-15-pro-max", "iphone-6.7", "google-pixel-8"],
  canvasDimensions: {
    "iphone-15-pro-max": { width: 1290, height: 2796 },
    "iphone-6.7":        { width: 1290, height: 2796 },
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

    const layout = computeLayout({
      canvasW: width,
      canvasH: height,
      textPosition: decision.textPosition,
      hasHeadline: Boolean(decision.headline),
      hasSubheadline: Boolean(decision.subheadline),
    });

    drawDevice(canvasCtx, three, layout.device);
    drawScreenshot(canvasCtx, image, layout.screen, decision.imageFit);

    if (decision.headline) {
      drawText(canvasCtx, {
        text: decision.headline,
        x: width / 2,
        y: layout.headlineY,
        maxWidth: width * 0.86,
        fontSize: Math.round(width * 0.062),
        fontWeight: decision.fontWeight,
        font,
        color: decision._isDark ? "#ffffff" : "#0a0a0a",
        align: "center",
        baseline: "middle",
        lineHeight: 1.1,
      });
    }
    if (decision.subheadline) {
      drawText(canvasCtx, {
        text: decision.subheadline,
        x: width / 2,
        y: layout.subheadlineY,
        maxWidth: width * 0.82,
        fontSize: Math.round(width * 0.034),
        fontWeight: "500",
        font,
        color: decision._isDark ? "#dddddd" : "#3a3a3a",
        align: "center",
        baseline: "middle",
        lineHeight: 1.25,
      });
    }

    debug(`rendered clean-minimal ${width}×${height} (locale=${locale.tag}, bg=${decision._bgKind})`);
  },
});

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

  // Text dark/light. `textColor` ("light"|"dark") is what render_screenshot
  // sends. The pre-fix code looked at decision.mode and compared to "dark" —
  // but mode is "2d"|"3d" in the server contract, so the dark text path was
  // never taken. Defaults to light (white-text) when explicit dark not set.
  const textColorRaw = d.textColor || d.text_color;
  let isDark = false;
  if (textColorRaw === "dark") isDark = true;
  else if (textColorRaw === "light") isDark = false;
  else if (d.mode === "dark" || d.mode === "light") isDark = d.mode === "dark";

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
    _isDark: isDark,
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
  c.fillStyle = decision._isDark ? "#0a0a0a" : "#ffffff";
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

function computeLayout({ canvasW, canvasH, textPosition, hasHeadline, hasSubheadline }) {
  // Spec §3: keep layout symmetric and centred. Headline above device when
  // textPosition === "top", below when "bottom", overlaid when "center".
  const margin = Math.round(canvasW * 0.065);
  const headlineBlockH = (hasHeadline ? Math.round(canvasW * 0.10) : 0)
    + (hasSubheadline ? Math.round(canvasW * 0.055) : 0)
    + (hasHeadline || hasSubheadline ? Math.round(canvasW * 0.04) : 0);

  let deviceY;
  let headlineY = 0;
  let subheadlineY = 0;

  if (textPosition === "bottom") {
    deviceY = margin * 1.2;
    headlineY = canvasH - headlineBlockH - margin * 0.6;
    subheadlineY = headlineY + Math.round(canvasW * 0.08);
  } else if (textPosition === "center") {
    deviceY = margin * 2.2;
    headlineY = canvasH * 0.45;
    subheadlineY = headlineY + Math.round(canvasW * 0.07);
  } else {
    // top (default)
    headlineY = margin * 0.9 + (hasHeadline ? Math.round(canvasW * 0.055) : 0);
    subheadlineY = headlineY + Math.round(canvasW * 0.082);
    deviceY = headlineBlockH + margin * 1.4;
  }

  const deviceWidth = Math.round(canvasW * 0.78);
  const deviceHeight = Math.round(deviceWidth * 2.165); // ~ iPhone 15 Pro Max aspect
  const deviceX = Math.round((canvasW - deviceWidth) / 2);

  // Inset the screen inside the device frame; tunable per-device in rc.2.
  const bezel = Math.round(deviceWidth * 0.025);
  const screen = {
    x: deviceX + bezel,
    y: deviceY + bezel,
    w: deviceWidth - bezel * 2,
    h: deviceHeight - bezel * 2,
  };

  return {
    device: { x: deviceX, y: deviceY, w: deviceWidth, h: deviceHeight },
    screen,
    headlineY,
    subheadlineY,
  };
}

function drawDevice(c, three, frame) {
  // Soft shadow under the device.
  c.save();
  c.shadowColor = "rgba(0, 0, 0, 0.22)";
  c.shadowBlur = 60;
  c.shadowOffsetY = 30;
  three.drawDeviceFrame(c, {
    x: frame.x,
    y: frame.y,
    width: frame.w,
    height: frame.h,
    cornerRadius: Math.round(frame.w * 0.085),
    fill: "#0a0a0a",
  });
  c.restore();
}

function drawScreenshot(c, image, screen, fit) {
  c.save();
  roundRectPath(c, screen.x, screen.y, screen.w, screen.h, Math.round(screen.w * 0.065));
  c.clip();

  // Compute draw rect based on `fit`.
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

function drawText(c, opts) {
  const { text, x, y, maxWidth, fontSize, fontWeight, font, color, align, baseline, lineHeight } = opts;
  c.save();
  c.fillStyle = color;
  c.font = `${fontWeight} ${fontSize}px "${font}", "Inter", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = baseline;
  const lines = wrapText(c, text, maxWidth);
  const lh = Math.round(fontSize * lineHeight);
  const startY = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => c.fillText(line, x, startY + i * lh));
  c.restore();
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
