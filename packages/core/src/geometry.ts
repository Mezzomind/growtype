export interface Point {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpPt = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});
export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export function normalize(a: Point): Point {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Rotate a vector by `deg` degrees (positive = clockwise on screen, since SVG y points down). */
export function rotate(a: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Perpendicular pointing to the left of the direction of travel (on screen). */
export const leftNormal = (t: Point): Point => ({ x: t.y, y: -t.x });

export const angleDeg = (a: Point): number => (Math.atan2(a.y, a.x) * 180) / Math.PI;

export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export function cubicTangent(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

/** Format a number compactly for SVG output. */
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(digits);
  // Trim trailing zeros and a dangling decimal point.
  const t = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  return t === "-0" ? "0" : t;
}

/**
 * Convert a list of points into a smooth cubic Bézier path using a
 * Catmull-Rom spline. `tension` 0 gives straight lines, 1 is standard.
 */
export function smoothPath(points: Point[], closed = false, tension = 1): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;
  const get = (i: number): Point => {
    if (closed) return points[((i % n) + n) % n]!;
    return points[clamp(i, 0, n - 1)]!;
  };
  const k = tension / 6;
  let d = `M${fmt(get(0).x)} ${fmt(get(0).y)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return closed ? d + "Z" : d;
}
