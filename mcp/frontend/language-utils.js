// renderer: language-utils: locale helpers for v1.0.0-rc.1 (clean-room, from spec §3)
//
// v1.0.0-rc.1 supports just English fallback. Real BCP-47 locale handling,
// RTL detection, and CJK font selection arrive with render_localized_set in
// v1.0.0-rc.2.

const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

export function resolveLocale(input) {
  if (!input || typeof input !== "string") return { tag: "en", isRTL: false };
  const tag = input.trim();
  const primary = tag.split(/[-_]/)[0].toLowerCase();
  return { tag, primary, isRTL: RTL_LANGS.has(primary) };
}

/** Pick a font family that's likely to render the given locale well. */
export function pickFontForLocale(locale, preferred) {
  if (preferred) return preferred;
  const { primary } = locale;
  // Conservative defaults — wider Asian/Cyrillic glyph coverage in later releases.
  if (primary === "ja" || primary === "ko" || primary === "zh") return "system-ui";
  return "Inter";
}
