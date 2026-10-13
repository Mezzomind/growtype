import { describe, expect, test } from "vite-plus/test";
import { CssFontAdapter, growtype, renderGrowtype } from "../src/index.ts";
import { font } from "./helpers.ts";

const opts = {
  text: "Hello mold",
  font,
  path: "M 20 230 C 150 150, 300 300, 480 220",
  width: 500,
  height: 300,
};

describe("growtype", () => {
  test("is deterministic for a given seed", () => {
    expect(renderGrowtype({ ...opts, seed: 7 })).toBe(renderGrowtype({ ...opts, seed: 7 }));
    expect(renderGrowtype({ ...opts, seed: 7 })).not.toBe(renderGrowtype({ ...opts, seed: 8 }));
  });

  test("renders one stem per non-space character", () => {
    const r = growtype(opts);
    expect(r.characters.map((c) => c.char).join("")).toBe("Hellomold");
    expect(r.svg.match(/-stem"/g)?.length).toBe(9);
    expect(r.svg).toContain('viewBox="0 0 500 300"');
    expect(r.svg).toContain("<title>Hello mold</title>");
  });

  test("bases sit on the path and stems grow to the left side by default", () => {
    const r = growtype({ ...opts, path: "M0 200 L500 200", tilt: 0, twist: 0 });
    for (const c of r.characters) {
      expect(c.base.y).toBeCloseTo(200);
      expect(c.tip.y).toBeLessThan(200);
      expect(c.rotation).toBeCloseTo(0);
    }
    const flipped = growtype({ ...opts, path: "M0 200 L500 200", side: "right" });
    for (const c of flipped.characters) expect(c.tip.y).toBeGreaterThan(200);
  });

  test("curvature compensation evens out glyph spacing in hollows", () => {
    // A deep valley: glyphs above it converge unless spacing is measured at their height.
    const valley = {
      ...opts,
      text: "mmmmmmmm",
      path: "M 0 50 Q 250 450 500 50",
      tilt: 0,
      twist: 0,
      stemLengthVariance: 0,
      stemLength: 60,
    };
    const spread = (r: ReturnType<typeof growtype>) => {
      const tips = r.characters.map((c) => c.tip);
      const gaps = tips.slice(1).map((t, i) => Math.hypot(t.x - tips[i]!.x, t.y - tips[i]!.y));
      return Math.min(...gaps) / Math.max(...gaps);
    };
    const on = growtype({ ...valley, justify: "center" });
    const off = growtype({ ...valley, justify: "center", compensateCurvature: false });
    expect(spread(on)).toBeGreaterThan(spread(off));
    expect(spread(on)).toBeGreaterThan(0.85);
  });

  test("tilt range bounds the lean", () => {
    const r = growtype({
      ...opts,
      path: "M0 200 L500 200",
      tilt: [10, 10],
      twist: 0,
      stemLengthVariance: 0,
    });
    for (const c of r.characters) {
      const lean = (Math.atan2(c.tip.x - c.base.x, c.base.y - c.tip.y) * 180) / Math.PI;
      expect(lean).toBeCloseTo(10, 1);
    }
  });

  test("stem length controls tip distance", () => {
    const r = growtype({ ...opts, path: "M0 200 L500 200", stemLength: 50, stemLengthVariance: 0 });
    for (const c of r.characters)
      expect(Math.hypot(c.tip.x - c.base.x, c.tip.y - c.base.y)).toBeCloseTo(50);
  });

  test("animations are opt-in and self-contained", () => {
    expect(renderGrowtype(opts)).not.toContain("<style>");
    const anim = growtype({ ...opts, grow: true, sway: { wave: true } });
    expect(anim.svg).toContain("@keyframes");
    expect(anim.svg).toContain("<mask");
    expect(anim.svg).toContain("-gust");
    expect(anim.svg).toContain("prefers-reduced-motion");
    expect(anim.growDuration).toBeGreaterThan(1);
    // Characters sprout in order for left justification.
    const delays = anim.characters.map((c) => c.growDelay);
    expect(delays[delays.length - 1]!).toBeGreaterThan(delays[0]!);
  });

  test("wilt droops and shrinks glyphs while staying close to upright", () => {
    const flat = { ...opts, path: "M0 200 L500 200", tilt: 0, twist: 0 };
    const full = growtype({ ...flat, wilt: "full" });
    const wilted = growtype({ ...flat, wilt: "wilted" });
    for (const [i, c] of wilted.characters.entries()) {
      expect(Math.abs(c.rotation)).toBeGreaterThan(Math.abs(full.characters[i]!.rotation));
      expect(Math.abs(c.rotation)).toBeLessThan(40);
    }
    expect(wilted.svg).toContain("scale(0.9");
  });

  test("palette, spores and substrate path", () => {
    const svg = renderGrowtype({
      ...opts,
      palette: ["#123456"],
      spores: { count: 3 },
      showPath: { color: "#abcdef" },
    });
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain("<circle");
    expect(svg).toContain('stroke="#abcdef"');
  });

  test("CSS font mode emits <text> and escapes characters", () => {
    const svg = renderGrowtype({
      ...opts,
      text: "a<b",
      font: new CssFontAdapter({ family: "Georgia", weight: 700 }),
    });
    expect(svg).toContain(">&lt;</text>");
    expect(svg).toContain('font-family="Georgia"');
    expect(svg).toContain('font-weight="700"');
  });

  test("matches snapshot", () => {
    expect(
      renderGrowtype({ ...opts, seed: "snapshot", grow: true, sway: true, spores: true, wilt: 1 }),
    ).toMatchSnapshot();
  });
});
