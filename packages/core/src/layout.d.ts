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
export declare const isSpace: (c: string) => boolean;
/**
 * Split text into user-perceived characters (grapheme clusters), so emoji sequences such as
 * 👨‍👩‍👧, 🇯🇵, 👍🏽 and 1️⃣ – and letters with combining accents – stay whole.
 */
export declare function splitGraphemes(text: string): string[];
/** Place characters along a path by arc length. */
export declare function layoutText(p: LayoutParams): LayoutResult;
