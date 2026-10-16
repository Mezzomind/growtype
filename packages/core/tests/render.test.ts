import { describe, expect, test } from "vite-plus/test";
import { CssFontAdapter, growtype, renderGrowtype } from "../src/index.ts";
import { polygonOverlap } from "../src/geometry.ts";
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

  test("stemVariance adds per-stalk personality", () => {
    const text = "variation is good for mould";
    const flat = renderGrowtype({ ...opts, text, stemVariance: 0 });
    const varied = renderGrowtype({ ...opts, text, stemVariance: 1.2 });
    // No variance: single-outline stalks with uniform tone.
    expect(flat).not.toMatch(/-stem" opacity/);
    expect(flat).not.toMatch(/<g class="[a-z0-9]+-stem"/);
    // High variance: tone shifts and at least one branched stalk (a group of shapes).
    expect(varied).toMatch(/-stem" [^>]*opacity="0\.\d+"/);
    expect(varied).toMatch(/<g class="[a-z0-9]+-stem"/);
  });

  test("avoidOverlap keeps neighbouring glyphs apart", () => {
    const strong = { ...opts, text: "spores of thought", tilt: 35, twist: 20 };
    let before = 0;
    let after = 0;
    for (let seed = 1; seed <= 12; seed++) {
      // Tight kerning means some pairs touch even standing upright; count only what's added.
      const up = growtype({
        ...strong,
        seed,
        tilt: 0,
        twist: 0,
        wilt: 0,
        avoidOverlap: false,
      }).characters;
      const count = (avoidOverlap: boolean) => {
        const cs = growtype({ ...strong, seed, avoidOverlap }).characters;
        let n = 0;
        for (let i = 0; i + 1 < cs.length; i++) {
          const inherent = Math.max(0, polygonOverlap(up[i]!.outline, up[i + 1]!.outline));
          if (polygonOverlap(cs[i]!.outline, cs[i + 1]!.outline) - inherent > 2) n++;
        }
        return n;
      };
      before += count(false);
      after += count(true);
    }
    expect(before).toBeGreaterThan(10);
    expect(after).toBeLessThanOrEqual(1);
  });

  test("ink anchors keep glyphs at their natural spacing", () => {
    const text = "jumpy gq";
    const flat = { ...opts, text, path: "M0 200 L500 200", tilt: 0, twist: 0, avoidOverlap: false };
    const centre = (pts: { x: number }[]) =>
      (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
    const baseline = growtype({ ...flat, anchor: "baseline" }).characters;
    const ink = growtype({ ...flat, anchor: "ink" }).characters;
    for (const [i, c] of ink.entries()) {
      // Same horizontal position as baseline-anchored glyphs, however far the ink anchor is off-centre.
      expect(centre(c.outline)).toBeCloseTo(centre(baseline[i]!.outline), 3);
      // And the same baseline height.
      const bottom = (pts: { y: number }[]) => Math.max(...pts.map((p) => p.y));
      expect(bottom(c.outline)).toBeCloseTo(bottom(baseline[i]!.outline), 3);
    }
  });

  test("baseSpacing gathers stem bases within words but keeps glyphs in place", () => {
    const text = "moss grows";
    const flat = { ...opts, text, path: "M0 200 L500 200", tilt: 0, twist: 0, avoidOverlap: false };
    const loose = growtype({ ...flat, baseSpacing: 1 }).characters;
    const tight = growtype({ ...flat, baseSpacing: 0.4 }).characters;
    const span = (cs: typeof loose, from: number, to: number) => cs[to]!.base.x - cs[from]!.base.x;
    // "moss" is characters 0–3, "grows" 4–8: each word's bases huddle together…
    expect(span(tight, 0, 3)).toBeCloseTo(span(loose, 0, 3) * 0.4, 3);
    expect(span(tight, 4, 8)).toBeCloseTo(span(loose, 4, 8) * 0.4, 3);
    // …while each word keeps its own centre, and the glyphs stay where they were.
    const mid = (cs: typeof loose, a: number, b: number) => (cs[a]!.base.x + cs[b]!.base.x) / 2;
    expect(mid(tight, 4, 8)).toBeCloseTo(mid(loose, 4, 8), 3);
    for (const [i, c] of tight.entries()) {
      expect(c.tip.x).toBeCloseTo(loose[i]!.tip.x, 3);
      expect(c.tip.y).toBeCloseTo(loose[i]!.tip.y, 3);
    }
  });

  test("tilt range bounds the lean", () => {
    const r = growtype({
      ...opts,
      path: "M0 200 L500 200",
      tilt: [10, 10],
      twist: 0,
      avoidOverlap: false,
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
    // Stalks grow by a transform stretch, not an animated mask (masks can flicker).
    expect(anim.svg).not.toContain("<mask");
    expect(anim.svg).toContain("-stretch");
    expect(anim.svg).toContain("-gust");
    expect(anim.svg).toContain("prefers-reduced-motion");
    expect(anim.growDuration).toBeGreaterThan(1);
    // Characters sprout in order for left justification.
    const delays = anim.characters.map((c) => c.growDelay);
    expect(delays[delays.length - 1]!).toBeGreaterThan(delays[0]!);
  });

  test("wilt droops and shrinks glyphs", () => {
    const flat = { ...opts, path: "M0 200 L500 200", tilt: 0, twist: 0 };
    const full = growtype({ ...flat, wilt: "full" });
    const wilted = growtype({ ...flat, wilt: "wilted" });
    for (const [i, c] of wilted.characters.entries()) {
      // Sunk well down towards the path (y = 200).
      expect(200 - c.tip.y).toBeLessThan((200 - full.characters[i]!.tip.y) * 0.5);
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
