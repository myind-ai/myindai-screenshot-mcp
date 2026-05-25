// renderer: three-renderer: placeholder for v1.0.0-rc.1 (clean-room, from spec §7)
//
// v1.0.0-rc.1 ships a 2D-only renderer; this module exports a no-op surface so
// app.js can call into it uniformly. Real WebGL device-frame rendering lands in
// v1.0.0-rc.2 once licenced .glb files are committed to mcp/frontend/models/.
//
// Why a stub instead of nothing: keeping the surface stable means template
// authors can write the same `render(spec, ctx, three)` signature now and have
// it work when three.js shows up in rc.2.

export function setupThreeRenderer() {
  return {
    isPlaceholder: true,
    /** Draws a flat rounded-rectangle "device" directly on the 2D ctx. */
    drawDeviceFrame(ctx, { x, y, width, height, cornerRadius = 56, fill = "#0a0a0a" }) {
      ctx.save();
      ctx.fillStyle = fill;
      roundRectPath(ctx, x, y, width, height, cornerRadius);
      ctx.fill();
      ctx.restore();
    },
  };
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
