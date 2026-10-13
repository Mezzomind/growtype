import type { FontAdapter, GlyphInfo } from "./font.ts";
import type { Justify, LayoutMode } from "./options.ts";

export interface LaidOutChar {
  /** Index into the code-point array of the text. */
  index: number;
  char: string;
  /** Arc length at the centre of the character's advance. */
  s: number;
  advance: number;
  isSpace: boolean;
  glyph: GlyphInfo;
}

export interface LayoutResult {
  chars: LaidOutChar[];
  /** Effective font size after any auto-shrinking. */
  fontSize: number;
  /** Arc length where the text starts and ends. */
  start: number;
  end: number;
}

export interface LayoutParams {
  text: string;
  font: FontAdapter;
  fontSize: number;
  letterSpacing: number;
  pathLength: number;
  mode: LayoutMode;
  justify: Justify;
  inset: number;
}

/** Smallest gap allowed between characters in fill mode before the font shrinks, as a fraction of font size. */
const MIN_FILL_GAP = -0.08;

function measure(chars: string[], font: FontAdapter, fontSize: number) {
  const glyphs = chars.map((c) => font.glyph(c, fontSize));
  const advances = glyphs.map((g, i) =>
    i < chars.length - 1 ? g.advance + font.kerning(chars[i]!, chars[i + 1]!, fontSize) : g.advance,
  );
  const total = advances.reduce((a, b) => a + b, 0);
  return { glyphs, advances, total };
}

export const isSpace = (c: string): boolean => /^\s$/u.test(c);

/**
 * Split text into user-perceived characters (grapheme clusters), so emoji sequences such as
 * 👨‍👩‍👧, 🇯🇵, 👍🏽 and 1️⃣ – and letters with combining accents – stay whole.
 */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  // Fallback: glue modifiers, variation selectors, keycaps, ZWJ links and flag pairs onto the
  // preceding code point.
  const out: string[] = [];
  let joinNext = false;
  for (const cp of Array.from(text)) {
    const prev = out[out.length - 1];
    const extends_ =
      /[\p{M}\p{Emoji_Modifier}\uFE0E\uFE0F\u20E3\u200D]|[\u{E0020}-\u{E007F}]/u.test(cp);
    const flagPair =
      prev !== undefined &&
      /^\p{Regional_Indicator}$/u.test(prev) &&
      /\p{Regional_Indicator}/u.test(cp);
    if (prev !== undefined && (joinNext || extends_ || flagPair)) out[out.length - 1] = prev + cp;
    else out.push(cp);
    joinNext = cp === "\u200D";
  }
  return out;
}

/** Place characters along a path by arc length. */
export function layoutText(p: LayoutParams): LayoutResult {
  const chars = splitGraphemes(p.text.replace(/[\r\n\t]+/g, " "));
  const available = Math.max(0, p.pathLength - 2 * p.inset);
  if (chars.length === 0 || available === 0) {
    return { chars: [], fontSize: p.fontSize, start: p.inset, end: p.inset };
  }
  const n = chars.length;
  let fontSize = p.fontSize;
  let m = measure(chars, p.font, fontSize);
  let gap: number;
  let start: number;

  if (p.mode === "fill" && n > 1) {
    gap = (available - m.total) / (n - 1);
    if (gap < MIN_FILL_GAP * fontSize) {
      // Shrink the font so that the minimum gap just fits.
      const k = available / (m.total + MIN_FILL_GAP * fontSize * (n - 1));
      fontSize *= k;
      m = measure(chars, p.font, fontSize);
      gap = (available - m.total) / (n - 1);
    }
    start = p.inset;
  } else {
    gap = p.mode === "fill" ? 0 : p.letterSpacing;
    let width = m.total + gap * (n - 1);
    if (width > available) {
      // Natural layout overflows: shrink everything (including spacing) to fit.
      const k = available / width;
      fontSize *= k;
      gap *= k;
      m = measure(chars, p.font, fontSize);
      width = m.total + gap * (n - 1);
    }
    const justify = p.mode === "fill" ? "center" : p.justify;
    const slack = available - width;
    start = p.inset + (justify === "left" ? 0 : justify === "center" ? slack / 2 : slack);
  }

  const out: LaidOutChar[] = [];
  let pen = start;
  for (let i = 0; i < n; i++) {
    const adv = m.advances[i]!;
    out.push({
      index: i,
      char: chars[i]!,
      s: pen + adv / 2,
      advance: adv,
      isSpace: isSpace(chars[i]!),
      glyph: m.glyphs[i]!,
    });
    pen += adv + (i < n - 1 ? gap : 0);
  }
  return { chars: out, fontSize, start, end: pen };
}
