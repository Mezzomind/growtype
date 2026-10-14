import opentype from "opentype.js";
import { type Point } from "./geometry.ts";
/** How a glyph is drawn in the output SVG. */
export type GlyphShape = {
    kind: "path";
    d: string;
}
/** Text glyphs carry the font attributes to put on their `<text>` element. */
 | {
    kind: "text";
    char: string;
    attrs: Record<string, string>;
};
/** Glyph metrics in output units (y down, baseline at 0, origin at the pen position). */
export interface GlyphInfo {
    /** Horizontal advance, without kerning. */
    advance: number;
    /** Ink bounds, if known. */
    bounds: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    } | null;
    /** The lowest point of the glyph's ink (largest y), if known. */
    inkBottom: {
        x: number;
        y: number;
    } | null;
    /** Convex hull of the glyph's ink, used to keep neighbouring glyphs from overlapping. */
    hull: Point[] | null;
    shape: GlyphShape;
}
/** Abstraction over font sources: parsed font files and CSS font families. */
export interface FontAdapter {
    readonly kind: "path" | "text";
    glyph(char: string, fontSize: number): GlyphInfo;
    kerning(left: string, right: string, fontSize: number): number;
    /** Whether the font can draw this character itself (defaults to true). */
    hasGlyph?(char: string): boolean;
}
/** Colour emoji fonts, tried in order. */
export declare const EMOJI_FONT_FAMILY = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", \"Twemoji Mozilla\", \"Segoe UI Symbol\", sans-serif";
/**
 * Whether a character (grapheme cluster) should be drawn as a colour emoji: anything with emoji
 * presentation, flags, keycaps, skin-tone and ZWJ sequences, or an explicit emoji variation
 * selector. Symbols like © or ™ that default to text presentation are left to the main font.
 */
export declare function isEmoji(char: string): boolean;
/** A CSS font, rendered with `<text>` elements. The font must be available where the SVG is shown. */
export interface CssFont {
    family: string;
    weight?: string | number;
    style?: string;
}
/** A parsed font file whose glyph outlines are embedded as `<path>` elements. */
export declare class GrowFont implements FontAdapter {
    readonly kind: "path";
    readonly font: opentype.Font;
    private readonly cache;
    constructor(font: opentype.Font);
    hasGlyph(char: string): boolean;
    get familyName(): string;
    glyph(char: string, fontSize: number): GlyphInfo;
    kerning(left: string, right: string, fontSize: number): number;
}
/** Parse a font file (TTF / OTF / WOFF) from bytes. */
export declare function parseFont(data: ArrayBuffer | Uint8Array): GrowFont;
/** Load a font file from a URL, or parse it from bytes. */
export declare function loadFont(source: string | URL | ArrayBuffer | Uint8Array): Promise<GrowFont>;
/**
 * A CSS font family, measured with a canvas. Glyphs are emitted as `<text>`,
 * so ink positions are approximate and the font must be loaded where the SVG is displayed.
 */
export declare class CssFontAdapter implements FontAdapter {
    readonly kind: "text";
    readonly spec: Required<CssFont>;
    private readonly cache;
    constructor(spec: CssFont | string);
    private fontString;
    private measure;
    glyph(char: string, fontSize: number): GlyphInfo;
    kerning(left: string, right: string, fontSize: number): number;
    textAttributes(fontSize: number): Record<string, string>;
}
export type FontInput = GrowFont | FontAdapter | CssFont | string;
/**
 * Routes emoji – and any character the primary font can't draw – to a fallback font
 * (by default the system colour emoji fonts), so they can appear anywhere in the text.
 */
export declare class FallbackFontAdapter implements FontAdapter {
    readonly kind: "path" | "text";
    readonly primary: FontAdapter;
    readonly fallback: FontAdapter;
    /** Size of fallback glyphs relative to the font size. */
    readonly scale: number;
    constructor(primary: FontAdapter, fallback: FontAdapter, scale?: number);
    private usesFallback;
    glyph(char: string, fontSize: number): GlyphInfo;
    kerning(left: string, right: string, fontSize: number): number;
}
export declare function toFontAdapter(font: FontInput, fallback?: CssFont | string, emojiScale?: number): FontAdapter;
