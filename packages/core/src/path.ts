import {
  type Point,
  clamp,
  cubicAt,
  dist,
  lerpPt,
  normalize,
  smoothPath,
  sub,
} from "./geometry.ts";

/** A path given either as SVG path data or as a list of points (smoothed into a curve). */
export type PathInput = string | ReadonlyArray<Point | readonly [number, number]>;

type Segment =
  | { kind: "line"; from: Point; to: Point }
  | { kind: "cubic"; from: Point; c1: Point; c2: Point; to: Point }
  | { kind: "move"; to: Point };

const PARAM_COUNTS: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

function tokenize(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) tokens.push(m[1]);
    else tokens.push(parseFloat(m[2]!));
  }
  return tokens;
}

function arcToCubics(
  from: Point,
  rxIn: number,
  ryIn: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): Segment[] {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ kind: "line", from, to }];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2;
  const cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / count;
  const k = (4 / 3) * Math.tan(delta / 4);
  const pointOn = (t: number): Point => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const deriv = (t: number): Point => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });
  const segs: Segment[] = [];
  let t = theta1;
  let p = from;
  for (let i = 0; i < count; i++) {
    const t2 = t + delta;
    const p2 = i === count - 1 ? to : pointOn(t2);
    const d1 = deriv(t);
    const d2 = deriv(t2);
    segs.push({
      kind: "cubic",
      from: p,
      c1: { x: p.x + k * d1.x, y: p.y + k * d1.y },
      c2: { x: p2.x - k * d2.x, y: p2.y - k * d2.y },
      to: p2,
    });
    t = t2;
    p = p2;
  }
  return segs;
}

/** Parse SVG path data into absolute line/cubic segments. */
export function parsePathData(d: string): Segment[] {
  const tokens = tokenize(d);
  const segs: Segment[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCubicCtrl: Point | null = null;
  let lastQuadCtrl: Point | null = null;

  const num = (): number => {
    const t = tokens[i++];
    if (typeof t !== "number") throw new Error(`growtype: malformed path data near token ${i}`);
    return t;
  };
  // Arc flags can be packed together ("01" means two flags), handle that.
  const flag = (): boolean => {
    const t = tokens[i];
    if (typeof t !== "number") throw new Error("growtype: malformed arc flag");
    if (t === 0 || t === 1) {
      i++;
      return t === 1;
    }
    // A packed token like 10 or 0.5: take first digit as flag, push remainder back.
    const s = String(t);
    const first = s[0] === "1";
    const rest = s.slice(1);
    if (rest.length) tokens[i] = parseFloat(rest.startsWith(".") ? "0" + rest : rest);
    else i++;
    return first;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      cmd = t;
      i++;
    } else if (!cmd) {
      throw new Error("growtype: path data must start with a command");
    }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;
    if (lower !== "z" && typeof tokens[i] !== "number") {
      if (PARAM_COUNTS[lower] === undefined) throw new Error(`growtype: unknown command ${cmd}`);
      // Command with no params (other than z) – skip.
      continue;
    }
    let nextCubic: Point | null = null;
    let nextQuad: Point | null = null;
    switch (lower) {
      case "m": {
        cur = { x: ox + num(), y: oy + num() };
        start = cur;
        segs.push({ kind: "move", to: cur });
        // Subsequent coordinate pairs are implicit linetos.
        cmd = rel ? "l" : "L";
        break;
      }
      case "l": {
        const to = { x: ox + num(), y: oy + num() };
        segs.push({ kind: "line", from: cur, to });
        cur = to;
        break;
      }
      case "h": {
        const to = { x: (rel ? cur.x : 0) + num(), y: cur.y };
        segs.push({ kind: "line", from: cur, to });
        cur = to;
        break;
      }
      case "v": {
        const to = { x: cur.x, y: (rel ? cur.y : 0) + num() };
        segs.push({ kind: "line", from: cur, to });
        cur = to;
        break;
      }
      case "c": {
        const c1 = { x: ox + num(), y: oy + num() };
        const c2 = { x: ox + num(), y: oy + num() };
        const to = { x: ox + num(), y: oy + num() };
        segs.push({ kind: "cubic", from: cur, c1, c2, to });
        nextCubic = c2;
        cur = to;
        break;
      }
      case "s": {
        const c1 = lastCubicCtrl
          ? { x: 2 * cur.x - lastCubicCtrl.x, y: 2 * cur.y - lastCubicCtrl.y }
          : cur;
        const c2 = { x: ox + num(), y: oy + num() };
        const to = { x: ox + num(), y: oy + num() };
        segs.push({ kind: "cubic", from: cur, c1, c2, to });
        nextCubic = c2;
        cur = to;
        break;
      }
      case "q":
      case "t": {
        let q: Point;
        if (lower === "q") {
          q = { x: ox + num(), y: oy + num() };
        } else {
          q = lastQuadCtrl ? { x: 2 * cur.x - lastQuadCtrl.x, y: 2 * cur.y - lastQuadCtrl.y } : cur;
        }
        const to = { x: ox + num(), y: oy + num() };
        segs.push({
          kind: "cubic",
          from: cur,
          c1: lerpPt(cur, q, 2 / 3),
          c2: lerpPt(to, q, 2 / 3),
          to,
        });
        nextQuad = q;
        cur = to;
        break;
      }
      case "a": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = flag();
        const sweep = flag();
        const to = { x: ox + num(), y: oy + num() };
        segs.push(...arcToCubics(cur, rx, ry, rot, large, sweep, to));
        cur = to;
        break;
      }
      case "z": {
        if (cur.x !== start.x || cur.y !== start.y)
          segs.push({ kind: "line", from: cur, to: start });
        cur = start;
        break;
      }
      default:
        throw new Error(`growtype: unknown command ${cmd}`);
    }
    lastCubicCtrl = nextCubic;
    lastQuadCtrl = nextQuad;
  }
  return segs;
}

/** Normalize a point-ish value. */
function toPoint(p: Point | readonly [number, number]): Point {
  return Array.isArray(p) ? { x: p[0] as number, y: p[1] as number } : (p as Point);
}

/** Convert user path input into SVG path data (points become a smooth spline). */
export function pathInputToData(input: PathInput): string {
  if (typeof input === "string") return input;
  return smoothPath(input.map(toPoint), false, 1);
}

interface Subpath {
  /** Index of first point in `pts`. */
  first: number;
  /** Index of last point in `pts` (inclusive). */
  last: number;
  start: number;
  end: number;
}

/**
 * Arc-length parametrised sampler over a path. Pure math – does not touch the DOM.
 * Multiple subpaths are joined end to end without counting the jump between them.
 */
export class PathSampler {
  readonly length: number;
  readonly data: string;
  private readonly pts: Point[] = [];
  private readonly cum: number[] = [];
  private readonly subpaths: Subpath[] = [];

  constructor(input: PathInput, resolution = 1) {
    this.data = pathInputToData(input);
    const segs = parsePathData(this.data);
    let total = 0;
    let cur: Point | null = null;
    let sub: Subpath | null = null;

    const pushPoint = (p: Point) => {
      if (sub && cur) total += dist(cur, p);
      this.pts.push(p);
      this.cum.push(total);
      cur = p;
    };
    const beginSub = (p: Point) => {
      if (sub && sub.last > sub.first) this.subpaths.push(sub);
      else if (sub) {
        // Drop a degenerate (single point) subpath.
        this.pts.length = sub.first;
        this.cum.length = sub.first;
      }
      sub = { first: this.pts.length, last: this.pts.length, start: total, end: total };
      cur = null;
      pushPoint(p);
    };

    for (const s of segs) {
      if (s.kind === "move") {
        beginSub(s.to);
        continue;
      }
      if (!sub) beginSub(s.from);
      const curSub = sub as unknown as Subpath;
      if (s.kind === "line") {
        pushPoint(s.to);
      } else {
        const approx = dist(s.from, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.to);
        const n = clamp(Math.ceil(approx / resolution), 4, 4000);
        for (let k = 1; k <= n; k++) pushPoint(cubicAt(s.from, s.c1, s.c2, s.to, k / n));
      }
      curSub.last = this.pts.length - 1;
      curSub.end = total;
    }
    if (sub) {
      const s = sub as Subpath;
      if (s.last > s.first) this.subpaths.push(s);
    }
    this.length = total;
    if (this.subpaths.length === 0) {
      throw new Error("growtype: path has no length");
    }
  }

  private subpathAt(s: number): Subpath {
    for (const sp of this.subpaths) if (s <= sp.end) return sp;
    return this.subpaths[this.subpaths.length - 1]!;
  }

  private locate(s: number, sp: Subpath): number {
    // Binary search for the segment index i such that cum[i] <= s <= cum[i+1].
    let lo = sp.first;
    let hi = sp.last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Point at arc length `s` (clamped to the path). */
  pointAt(s: number): Point {
    const c = clamp(s, 0, this.length);
    const sp = this.subpathAt(c);
    const cs = clamp(c, sp.start, sp.end);
    const i = this.locate(cs, sp);
    const a = this.pts[i]!;
    const b = this.pts[Math.min(i + 1, sp.last)]!;
    const segLen = this.cum[Math.min(i + 1, sp.last)]! - this.cum[i]!;
    const t = segLen > 0 ? (cs - this.cum[i]!) / segLen : 0;
    return lerpPt(a, b, t);
  }

  /** Unit tangent at arc length `s`, smoothed over a small window. */
  tangentAt(s: number, window = 2): Point {
    const c = clamp(s, 0, this.length);
    const sp = this.subpathAt(c);
    let a = clamp(c - window, sp.start, sp.end);
    let b = clamp(c + window, sp.start, sp.end);
    if (b - a < 1e-6) {
      a = sp.start;
      b = sp.end;
    }
    return normalize(sub(this.pointAt(b), this.pointAt(a)));
  }
}

/**
 * Maps arc length measured along a parallel curve (offset `height` along the growth normal)
 * back to arc length on the base path. Laying text out in offset space keeps the glyphs –
 * which sit up at the end of their stems – evenly spaced on concave and convex stretches.
 */
export class OffsetArcMap {
  readonly length: number;
  private readonly base: number[] = [];
  private readonly offset: number[] = [];

  constructor(sampler: PathSampler, height: number, side: "left" | "right", step = 1) {
    const sign = side === "left" ? 1 : -1;
    const n = Math.max(2, Math.ceil(sampler.length / step));
    let prev: Point | null = null;
    let prevBase: Point | null = null;
    let total = 0;
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * sampler.length;
      const p = sampler.pointAt(s);
      const t = sampler.tangentAt(s);
      const q = { x: p.x + t.y * height * sign, y: p.y - t.x * height * sign };
      if (prev && prevBase) {
        const ds = dist(p, prevBase);
        const dx = q.x - prev.x;
        const dy = q.y - prev.y;
        // Where the offset curve folds back on itself (tight inner bends), keep a minimum pace.
        const forward = dx * (p.x - prevBase.x) + dy * (p.y - prevBase.y) > 0;
        total += forward ? Math.max(Math.hypot(dx, dy), ds * 0.15) : ds * 0.15;
      }
      this.base.push(s);
      this.offset.push(total);
      prev = q;
      prevBase = p;
    }
    this.length = total;
  }

  /** Convert an offset-curve arc length to base-path arc length. */
  toBase(s: number): number {
    const o = this.offset;
    if (s <= 0) return 0;
    if (s >= this.length) return this.base[this.base.length - 1]!;
    let lo = 0;
    let hi = o.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (o[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const span = o[hi]! - o[lo]!;
    const t = span > 0 ? (s - o[lo]!) / span : 0;
    return this.base[lo]! + (this.base[hi]! - this.base[lo]!) * t;
  }
}
