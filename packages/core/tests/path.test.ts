import { describe, expect, test } from "vite-plus/test";
import { PathSampler, pathInputToData } from "../src/index.ts";
import { getOffsetArcMap, getPathSampler, parsePathData } from "../src/path.ts";

describe("PathSampler", () => {
  test("measures a straight line", () => {
    const p = new PathSampler("M0 0 L100 0");
    expect(p.length).toBeCloseTo(100, 5);
    expect(p.pointAt(25)).toEqual({ x: 25, y: 0 });
    const t = p.tangentAt(50);
    expect(t.x).toBeCloseTo(1);
    expect(t.y).toBeCloseTo(0);
  });

  test("handles relative, H and V commands", () => {
    const p = new PathSampler("m10 10 h30 v40 H10 z");
    expect(p.length).toBeCloseTo(30 + 40 + 30 + 40, 5);
    expect(p.pointAt(30)).toEqual({ x: 40, y: 10 });
  });

  test("measures a circle made of arcs", () => {
    const r = 50;
    const p = new PathSampler(
      `M ${-r} 0 a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`,
    );
    expect(p.length).toBeCloseTo(2 * Math.PI * r, 0);
    // Top of the circle is a quarter of the way round (sweep=1 goes clockwise on screen, i.e. up first).
    const top = p.pointAt(p.length / 4);
    expect(top.x).toBeCloseTo(0, 0);
    expect(top.y).toBeCloseTo(-r, 0);
  });

  test("parses packed arc flags", () => {
    const segs = parsePathData("M0 0a10 10 0 0110 10");
    expect(segs.filter((s) => s.kind === "cubic").length).toBeGreaterThan(0);
  });

  test("measures cubic and quadratic curves", () => {
    // A cubic with collinear control points is a straight line.
    expect(new PathSampler("M0 0 C 10 0 20 0 30 0").length).toBeCloseTo(30, 3);
    expect(new PathSampler("M0 0 Q 15 0 30 0 T 60 0").length).toBeCloseTo(60, 3);
  });

  test("does not count jumps between subpaths", () => {
    const p = new PathSampler("M0 0 L10 0 M100 100 L110 100");
    expect(p.length).toBeCloseTo(20, 5);
    expect(p.pointAt(15)).toEqual({ x: 105, y: 100 });
  });

  test("clamps out-of-range arc lengths", () => {
    const p = new PathSampler("M0 0 L10 0");
    expect(p.pointAt(-5)).toEqual({ x: 0, y: 0 });
    expect(p.pointAt(50)).toEqual({ x: 10, y: 0 });
  });

  test("accepts points and tuples", () => {
    const d = pathInputToData([[0, 0], { x: 50, y: 20 }, [100, 0]]);
    expect(d.startsWith("M0 0C")).toBe(true);
    const p = new PathSampler(d);
    expect(p.pointAt(p.length).x).toBeCloseTo(100);
  });

  test("rejects empty paths", () => {
    expect(() => new PathSampler("M0 0")).toThrow(/no length/);
  });

  test("locates arc lengths across many subpaths", () => {
    // Each subpath is 10 long, so arc length 10n + 5 is the middle of subpath n.
    const n = 40;
    const d = Array.from({ length: n }, (_, i) => `M${i * 100} ${i} L${i * 100 + 10} ${i}`).join(
      " ",
    );
    const p = new PathSampler(d);
    expect(p.length).toBeCloseTo(10 * n, 5);
    for (let i = 0; i < n; i++) {
      expect(p.pointAt(i * 10 + 5)).toEqual({ x: i * 100 + 5, y: i });
    }
    // Boundaries resolve to the end of the earlier subpath, as a linear scan did.
    expect(p.pointAt(10)).toEqual({ x: 10, y: 0 });
    expect(p.pointAt(p.length)).toEqual({ x: (n - 1) * 100 + 10, y: n - 1 });
  });

  test("caps offset-map samples so path length alone cannot drive the cost", () => {
    // A very long path still maps end to end, and monotonically.
    const map = getOffsetArcMap(new PathSampler("M0 500 L200000 500"), 60, "left");
    expect(map.toBase(0)).toBeCloseTo(0);
    expect(map.toBase(map.length)).toBeCloseTo(200000, 0);
    expect(map.toBase(map.length / 2)).toBeGreaterThan(map.toBase(map.length / 4));
  });
});

describe("path caches", () => {
  test("reuse a sampler and offset map for the same inputs", () => {
    const d = "M 10 100 C 100 20, 200 180, 300 100";
    const a = getPathSampler(d);
    expect(getPathSampler(d)).toBe(a);
    expect(getPathSampler("M 10 100 L 300 100")).not.toBe(a);
    const map = getOffsetArcMap(a, 40, "left");
    expect(getOffsetArcMap(a, 40, "left")).toBe(map);
    expect(getOffsetArcMap(a, 40, "right")).not.toBe(map);
    expect(getOffsetArcMap(a, 80, "left")).not.toBe(map);
  });

  test("point input is keyed by the path it produces, not by array identity", () => {
    expect(
      getPathSampler([
        [0, 0],
        [50, 20],
        [100, 0],
      ]),
    ).toBe(
      getPathSampler([
        [0, 0],
        [50, 20],
        [100, 0],
      ]),
    );
  });
});
