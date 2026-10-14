export interface Point {
    x: number;
    y: number;
}
export declare const vec: (x: number, y: number) => Point;
export declare const add: (a: Point, b: Point) => Point;
export declare const sub: (a: Point, b: Point) => Point;
export declare const scale: (a: Point, k: number) => Point;
export declare const len: (a: Point) => number;
export declare const dist: (a: Point, b: Point) => number;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const lerpPt: (a: Point, b: Point, t: number) => Point;
export declare const clamp: (v: number, min: number, max: number) => number;
export declare function normalize(a: Point): Point;
/** Rotate a vector by `deg` degrees (positive = clockwise on screen, since SVG y points down). */
export declare function rotate(a: Point, deg: number): Point;
/** Perpendicular pointing to the left of the direction of travel (on screen). */
export declare const leftNormal: (t: Point) => Point;
export declare const angleDeg: (a: Point) => number;
export declare function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point;
export declare function cubicTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point;
/** Format a number compactly for SVG output. */
export declare function fmt(n: number, digits?: number): string;
/**
 * Convert a list of points into a smooth cubic Bézier path using a
 * Catmull-Rom spline. `tension` 0 gives straight lines, 1 is standard.
 */
export declare function smoothPath(points: Point[], closed?: boolean, tension?: number): string;
/** Convex hull (Andrew's monotone chain), counter-clockwise in a y-up sense. */
export declare function convexHull(points: Point[]): Point[];
/**
 * Separating-axis test for two convex polygons. Returns the overlap depth along the axis of least
 * overlap: positive means they intersect by that much, negative is the gap between them.
 */
export declare function polygonOverlap(a: Point[], b: Point[]): number;
/**
 * Reduce a convex polygon to at most `max` vertices by repeatedly dropping the vertex whose
 * removal loses the least area. The result stays convex and inside the original.
 */
export declare function simplifyHull(hull: Point[], max: number): Point[];
