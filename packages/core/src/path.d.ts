import { type Point } from "./geometry.ts";
/** A path given either as SVG path data or as a list of points (smoothed into a curve). */
export type PathInput = string | ReadonlyArray<Point | readonly [number, number]>;
type Segment = {
    kind: "line";
    from: Point;
    to: Point;
} | {
    kind: "cubic";
    from: Point;
    c1: Point;
    c2: Point;
    to: Point;
} | {
    kind: "move";
    to: Point;
};
/** Parse SVG path data into absolute line/cubic segments. */
export declare function parsePathData(d: string): Segment[];
/** Convert user path input into SVG path data (points become a smooth spline). */
export declare function pathInputToData(input: PathInput): string;
/**
 * Arc-length parametrised sampler over a path. Pure math – does not touch the DOM.
 * Multiple subpaths are joined end to end without counting the jump between them.
 */
export declare class PathSampler {
    readonly length: number;
    readonly data: string;
    private readonly pts;
    private readonly cum;
    private readonly subpaths;
    constructor(input: PathInput, resolution?: number);
    private subpathAt;
    private locate;
    /** Point at arc length `s` (clamped to the path). */
    pointAt(s: number): Point;
    /** Unit tangent at arc length `s`, smoothed over a small window. */
    tangentAt(s: number, window?: number): Point;
}
/**
 * Maps arc length measured along a parallel curve (offset `height` along the growth normal)
 * back to arc length on the base path. Laying text out in offset space keeps the glyphs –
 * which sit up at the end of their stems – evenly spaced on concave and convex stretches.
 */
export declare class OffsetArcMap {
    readonly length: number;
    private readonly base;
    private readonly offset;
    constructor(sampler: PathSampler, height: number, side: "left" | "right", step?: number);
    /** Convert an offset-curve arc length to base-path arc length. */
    toBase(s: number): number;
}
export {};
