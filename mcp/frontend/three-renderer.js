// renderer: three-renderer: hand-drawn iPhone device frame (Canvas 2D).
// No external assets — every shape is generated from geometry below, so the
// renderer is asset-free until the rc.7+ .glb work lands.
//
// Surface:
//   const three = setupThreeRenderer();
//   three.drawDeviceFrame(ctx, frame)        ← chassis BEFORE the screenshot
//   three.drawDeviceForeground(ctx, frame)   ← dynamic island AFTER the screenshot
//
// `frame` shape (from computeLayout in app.js):
//   { x, y, width, height, cornerRadius, fill?, style? }
//
// `style` selects the chassis treatment:
//   "iphone" (default) — modern iPhone (rounded rect + chrome rim + dynamic island)
//   "rounded-rect"     — minimal stub for non-Apple devices

export function setupThreeRenderer() {
  return {
    isPlaceholder: false,
    drawDeviceFrame(ctx, frame) {
      const style = frame.style || "iphone";
      if (style === "rounded-rect") return drawPlainShell(ctx, frame);
      return drawIPhoneShell(ctx, frame);
    },
    drawDeviceForeground(ctx, frame) {
      const style = frame.style || "iphone";
      // Default to OFF — most iOS captures (Simulator, real device) already
      // include the dynamic island in the input pixels. Drawing our own on top
      // creates a doubled "stacked pill" artifact. Opt in via the layout
      // option for cases where the input was stripped or is Android.
      if (style === "iphone" && frame.dynamicIsland) drawDynamicIsland(ctx, frame);
    },
  };
}

function drawPlainShell(ctx, { x, y, width, height, cornerRadius, fill }) {
  ctx.save();
  ctx.fillStyle = fill || "#0a0a0a";
  roundRectPath(ctx, x, y, width, height, cornerRadius || width * 0.085);
  ctx.fill();
  ctx.restore();
}

function drawIPhoneShell(ctx, { x, y, width, height, cornerRadius, fill }) {
  const corner = cornerRadius || width * 0.105; // modern iPhones have ~11% corner radius
  const chassisColor = fill || "#0a0a0a";

  ctx.save();
  // 1. Chassis body — slightly larger than the screen area so a thin rim shows.
  ctx.fillStyle = chassisColor;
  roundRectPath(ctx, x, y, width, height, corner);
  ctx.fill();

  // 2. Chrome rim — thin lighter outline simulating titanium / aluminium edge.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = Math.max(1, width * 0.0035);
  roundRectPath(ctx, x + 1.5, y + 1.5, width - 3, height - 3, corner - 1.5);
  ctx.stroke();

  // 3. Inner bezel — slightly darker ring just inside where the screen sits.
  const bezel = Math.max(2, width * 0.018);
  ctx.fillStyle = "#000000";
  roundRectPath(ctx, x + bezel, y + bezel, width - bezel * 2, height - bezel * 2, corner - bezel);
  ctx.fill();
  ctx.restore();
}

function drawDynamicIsland(ctx, { x, y, width, height }) {
  // Real iPhone 15/16 Pro: island ≈ 125×37 px on a 1290×2796 screen.
  // → 9.7% of screen width × 1.3% of screen height.
  // Our device frame ≈ 95% of the visible width once chassis bezels are inset,
  // so island ≈ 10% of device width, 1.6% of device height looks right.
  const islandW = width * 0.105;
  const islandH = height * 0.0185;
  const islandX = x + (width - islandW) / 2;
  const islandY = y + height * 0.020;

  ctx.save();
  ctx.fillStyle = "#000000";
  roundRectPath(ctx, islandX, islandY, islandW, islandH, islandH / 2);
  ctx.fill();

  // Subtle lens hint at top-right of island, ~30% of island height in radius.
  const lensR = islandH * 0.28;
  const lensCX = islandX + islandW - islandH * 0.85;
  const lensCY = islandY + islandH / 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.beginPath();
  ctx.arc(lensCX, lensCY, lensR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
