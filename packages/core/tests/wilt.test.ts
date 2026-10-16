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
const meanDroop = (r: Result) =>
  r.characters.reduce((acc, c) => acc + Math.abs(c.rotation), 0) / r.characters.length;

describe("wilt stages", () => {
  test("each stage droops further than the last", () => {
    const droops = WILT_STAGES.map((wilt) => meanDroop(growtype({ ...opts, wilt })));
    for (let i = 1; i < droops.length; i++) expect(droops[i]).toBeGreaterThan(droops[i - 1]! + 10);
  });

  test("wilted, every glyph has fallen the same way and lies on the path", () => {
    const r = growtype({ ...opts, wilt: "wilted" });
    const sides = new Set(r.characters.map((c) => Math.sign(c.rotation)));
    expect(sides.size).toBe(1);
    for (const c of r.characters) {
      // Lying on its side…
      expect(Math.abs(Math.abs(c.rotation) - 90)).toBeLessThan(20);
      // …resting on the path, not floating above it or sunk through it.
      const lowest = Math.max(...c.outline.map((p) => p.y));
      expect(lowest).toBeLessThanOrEqual(PATH_Y + 0.5);
      expect(lowest).toBeGreaterThan(PATH_Y - 12);
    }
  });

  test("collapsed glyphs fall towards the end of the path with more room", () => {
    const atStart = growtype({ ...opts, wilt: "wilted", justify: "start" });
    const atEnd = growtype({ ...opts, wilt: "wilted", justify: "end" });
    // Falling towards the path's end (+x) rotates clockwise; towards its start, anticlockwise.
    expect(atStart.characters.every((c) => c.tip.x > c.base.x)).toBe(true);
    expect(atEnd.characters.every((c) => c.tip.x < c.base.x)).toBe(true);
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

  test("wilting sprouts land and bounce; recovering ones spring past upright", () => {
    const track = (from: "full" | "wilted", wilt: "full" | "wilted") =>
      Array.from({ length: 41 }, (_, k) =>
        growtype({
          ...opts,
          wilt,
          wiltTransition: { from, at: 0, duration: 1, stagger: 0 },
          timeOffset: k / 40,
        }),
      ).map((r) => r.characters[0]!.rotation);
    const falling = track("full", "wilted");
    const landed = falling.findIndex((v) => Math.abs(v - falling[40]!) < 0.5);
    // It reaches the ground, rises a little, then settles back.
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(40);
    const bounce = Math.min(...falling.slice(landed).map((v) => Math.abs(v)));
    expect(bounce).toBeLessThan(Math.abs(falling[40]!) - 3);
    const rising = track("wilted", "full");
    const upright = rising[40]!;
    // Swings beyond its upright pose before settling.
    expect(Math.max(...rising.map((v) => Math.sign(rising[0]!) * (upright - v)))).toBeGreaterThan(
      2,
    );
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
