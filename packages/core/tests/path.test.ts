import { describe, expect, test } from "vite-plus/test";
import { PathSampler, pathInputToData } from "../src/index.ts";
import { parsePathData } from "../src/path.ts";

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
});
