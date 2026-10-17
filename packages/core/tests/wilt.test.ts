import { describe, expect, test } from "vite-plus/test";
import { type GrowtypeOptions, WILT_STAGES, growtype } from "../src/index.ts";
import { font } from "./helpers.ts";

// A straight path along y = 230, so "on the path" and "upright" are easy to check.
const opts: GrowtypeOptions = {
  text: "spores of thought",
  font,
  path: "M 20 230 L 480 230",
  width: 500,
  height: 300,
  tilt: 12,
  seed: 3,
};
const PATH_Y = 230;

type Result = ReturnType<typeof growtype>;
const pose = (r: Result) => r.characters.map((c) => [c.rotation, c.tip.x, c.tip.y, c.wilt]);
const expectSamePose = (a: Result, b: Result) => {
  const pb = pose(b);
  pose(a).forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(pb[i]![j]!, 6)));
};
/** How high each glyph's anchor stands above the (straight) path. */
const heights = (r: Result) => r.characters.map((c) => PATH_Y - c.tip.y);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("wilt stages", () => {
  test("each stage sinks lower than the last", () => {
    const h = WILT_STAGES.map((wilt) => mean(heights(growtype({ ...opts, wilt }))));
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeLessThan(h[i - 1]! - 4);
  });

  test("wilted, glyphs sink to just above the path but stay readable", () => {
    const full = growtype(opts);
    const r = growtype({ ...opts, wilt: "wilted" });
    const stalk = mean(heights(full));
    for (const c of r.characters) {
      // Still roughly upright…
      expect(Math.abs(c.rotation)).toBeLessThan(40);
      // …low down, held up by a buckled stalk, and never sunk through the path.
      expect(PATH_Y - c.tip.y).toBeLessThan(stalk * 0.5);
      expect(Math.max(...c.outline.map((p) => p.y))).toBeLessThanOrEqual(PATH_Y + 0.5);
    }
    // In the same order as the text.
    const xs = r.characters.map((c) => c.tip.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test("glyphs slump a little to one side or the other, at random", () => {
    const full = growtype(opts).characters;
    const wilted = growtype({ ...opts, wilt: "wilted" }).characters;
    const tips = wilted.map((c, i) => Math.sign(c.rotation - full[i]!.rotation));
    expect(new Set(tips)).toEqual(new Set([-1, 1]));
  });

  test("wilted sprouts stop swaying", () => {
    const sway = { wave: true };
    const amp = (svg: string) =>
      Math.max(...[...svg.matchAll(/--a:([\d.]+)deg/g)].map((m) => +m[1]!));
    const full = growtype({ ...opts, sway }).svg;
    const slight = growtype({ ...opts, sway, wilt: "slightly-damaged" }).svg;
    const wilted = growtype({ ...opts, sway, wilt: "wilted" }).svg;
    expect(amp(slight)).toBeLessThan(amp(full));
    expect(wilted).not.toMatch(/class="[a-z0-9]+-(sway|gust)"/);
  });
});

describe("wilt transitions", () => {
  const transition = { from: "full" as const, at: 0, duration: 1, stagger: 0.5 };

  test("start and end on the resting poses, so nothing jumps", () => {
    const at = (timeOffset: number) =>
      growtype({ ...opts, wilt: "wilted", wiltTransition: transition, timeOffset });
    expectSamePose(at(-0.5), growtype({ ...opts, wilt: "full" }));
    expectSamePose(at(2), growtype({ ...opts, wilt: "wilted" }));
  });

  test.each(["start", "end"] as const)(
    "sprouts set off in turn from the path's %s",
    (direction) => {
      const r = growtype({
        ...opts,
        wilt: "wilted",
        wiltTransition: { ...transition, direction },
        timeOffset: 0.4,
      });
      const byX = [...r.characters].sort((a, b) => a.base.x - b.base.x);
      const [first, last] = direction === "start" ? [byX[0]!, byX.at(-1)!] : [byX.at(-1)!, byX[0]!];
      expect(first.wilt).toBeGreaterThan(0.3);
      expect(last.wilt).toBe(0);
    },
  );

  test("wilting sprouts land and bounce; recovering ones spring up past upright", () => {
    const track = (from: "full" | "wilted", wilt: "full" | "wilted") =>
      Array.from({ length: 41 }, (_, k) =>
        growtype({
          ...opts,
          wilt,
          wiltTransition: { from, at: 0, duration: 1, stagger: 0 },
          timeOffset: k / 40,
        }),
      ).map((r) => heights(r)[0]!);
    const falling = track("full", "wilted");
    const rest = falling[40]!;
    const landed = falling.findIndex((h) => h < rest + 0.5);
    // It reaches the ground, rises a little, then settles back.
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(40);
    expect(Math.max(...falling.slice(landed))).toBeGreaterThan(rest + 1);
    const rising = track("wilted", "full");
    // Stands taller than upright before settling.
    expect(Math.max(...rising)).toBeGreaterThan(rising[40]! + 1);
  });

  test("a change made mid-transition picks each sprout up where it is", () => {
    for (const t of [0.3, 0.6, 1.2]) {
      // At the moment the second one starts nothing moves: some sprouts are still fresh, some
      // falling, some down, and each stays exactly where the first transition had it.
      const shown = growtype({
        ...opts,
        wilt: "wilted",
        wiltTransition: transition,
        timeOffset: t,
      });
      const chained = growtype({
        ...opts,
        wilt: "full",
        wiltTransition: { from: "wilted", at: t, interrupts: transition },
        timeOffset: t,
      });
      expectSamePose(chained, shown);
    }
  });

  test("leaves no trace in the markup once it's over", () => {
    const done = growtype({ ...opts, wilt: "damaged", wiltTransition: transition, timeOffset: 5 });
    expect(done.svg).toBe(growtype({ ...opts, wilt: "damaged" }).svg);
  });
});
