import { type Point } from "./geometry.ts";
import { type GrowtypeOptions } from "./options.ts";
/** Where one character ended up. */
export interface PlacedCharacter {
    char: string;
    /** Index into the text (code points). */
    index: number;
    /** Arc length along the path. */
    s: number;
    /** Point where the stem's foot sits on the path. */
    base: Point;
    /** Point where the stem meets the glyph. */
    tip: Point;
    /** Glyph rotation in degrees. */
    rotation: number;
    /** Seconds after load when this character starts growing (0 without `grow`). */
    growDelay: number;
    /** Wilt intensity actually applied, 0–1. */
    wilt: number;
    /** Seconds (on the animation timeline) when the blast front reaches this character. */
    blastHit?: number;
    /** Convex outline of the glyph in SVG coordinates. */
    outline: Point[];
}
export interface GrowtypeResult {
    /** The complete, self-contained SVG markup. */
    svg: string;
    /** Font size actually used (may be smaller than requested if the text had to shrink to fit). */
    fontSize: number;
    /** Length of the path. */
    pathLength: number;
    characters: PlacedCharacter[];
    /** Seconds until the grow animation finishes (0 without `grow`). */
    growDuration: number;
}
/** Render text growing out of a path. Returns the SVG and layout details. */
export declare function growtype(options: GrowtypeOptions): GrowtypeResult;
/** Render text growing out of a path and return just the SVG markup. */
export declare function renderGrowtype(options: GrowtypeOptions): string;
/** Render into a live `<svg>` element (browser only). */
export declare function createGrowtypeElement(options: GrowtypeOptions): SVGSVGElement;
