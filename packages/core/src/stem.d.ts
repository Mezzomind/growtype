import { type Point } from "./geometry.ts";
export interface StemParams {
    /** Base point on the path. */
    base: Point;
    /** Unit normal of the path at the base (direction of growth). */
    normal: Point;
    /** Unit tangent of the path at the base. */
    tangent: Point;
    /** Where the stem meets the glyph. */
    tip: Point;
    /** Unit direction the glyph's "up" points in. */
    tipDir: Point;
    thickness: number;
    flare: number;
    wobble: number;
    /** 0–1 wilt intensity: thins the stem and adds kinks. */
    wilt: number;
    /** 0–1+: how much each stalk's shape differs from the others. */
    variance: number;
    rand: () => number;
}
export interface StemGeometry {
    /**
     * Filled shapes: the stalk outline (including its flared foot) first, then any side branches
     * and spore heads. Kept as separate paths so overlaps never cancel out under the fill rule.
     */
    shapes: string[];
    /** The stem's centreline (used to mask the grow animation). */
    centerline: string;
    /** Furthest any part of the stem strays from its centreline, for sizing masks. */
    maxHalfWidth: number;
    /** Per-stalk tone variation. */
    opacity: number;
}
/**
 * Build a wobbly, organic mould-spore stalk: a filament rising from a splayed,
 * blobby foot on the path to a small swelling (vesicle) under the glyph.
 *
 * Every stalk gets its own "personality" (scaled by `variance`): thickness, foot size and
 * asymmetry, taper, an overall C or S bow, nodal swellings, tip knob size and, now and then,
 * a side branch carrying a tiny spore head.
 */
export declare function buildStem(p: StemParams): StemGeometry;
