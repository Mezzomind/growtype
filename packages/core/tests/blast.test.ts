import { describe, expect, test } from "vite-plus/test";
import { growtype } from "../src/index.ts";
import { font } from "./helpers.ts";

const opts = {
  text: "spores of thought",
  font,
  path: "M 20 230 C 150 150, 300 300, 480 220",
  width: 500,
  height: 300,
};

describe("blast wave", () => {
  test("emits a shock ring, debris and a knock-back per sprout", () => {
    const r = growtype({ ...opts, blast: { direction: "left" } });
    expect(r.svg).toMatch(/class="[a-z0-9]+-ring"/);
    expect(r.svg).toContain("radialGradient");
    expect(r.svg.match(/-blast"/g)?.length).toBe(r.characters.length);
    expect(r.svg.match(/-debris"/g)?.length).toBe(r.characters.length * 3);
    expect(r.svg).toContain("@keyframes");
  });

  test.each(["left", "right"] as const)("the front sweeps from the %s", (direction) => {
    const r = growtype({ ...opts, blast: { direction, at: 2, duration: 1 } });
    const byX = [...r.characters].sort((a, b) => a.base.x - b.base.x);
    const hits = byX.map((c) => c.blastHit!);
    const sorted = [...hits].sort((a, b) => (direction === "left" ? a - b : b - a));
    expect(hits).toEqual(sorted);
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...hits)).toBeCloseTo(3, 5);
    // Knock-back direction follows the blast: tops pushed away from the origin.
    const k = Number(/--k:(-?[\d.]+)deg/.exec(r.svg)![1]);
    expect(Math.sign(k)).toBe(direction === "left" ? 1 : -1);
  });

  test("sprouts change wilt as the front reaches them", () => {
    const blast = { direction: "left" as const, at: 0, duration: 1, fromWilt: "full" as const };
    const before = growtype({ ...opts, wilt: "wilted", blast, timeOffset: -0.5 });
    const after = growtype({ ...opts, wilt: "wilted", blast, timeOffset: 2 });
    const mid = growtype({ ...opts, wilt: "wilted", blast, timeOffset: 0.5 });
    expect(before.characters.every((c) => c.wilt === 0)).toBe(true);
    expect(after.characters.every((c) => c.wilt > 0.8)).toBe(true);
    const sorted = [...mid.characters].sort((a, b) => a.base.x - b.base.x);
    // Left half already hit (wilted), right half not yet.
    expect(sorted[0]!.wilt).toBeGreaterThan(0.8);
    expect(sorted[sorted.length - 1]!.wilt).toBe(0);
  });

  test("starts and ends on the resting placements, so nothing jumps", () => {
    const tilted = { ...opts, tilt: 25, twist: 15, seed: 3 };
    const blast = { direction: "left" as const, at: 0, duration: 1, fromWilt: "full" as const };
    const pose = (r: ReturnType<typeof growtype>) =>
      r.characters.map((c) => [c.rotation, c.tip.x, c.tip.y, c.wilt]);
    const at = (timeOffset: number) =>
      pose(growtype({ ...tilted, wilt: "wilted", blast, timeOffset }));
    const close = (a: number[][], b: number[][]) =>
      a.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(b[i]![j]!, 6)));
    close(at(-0.5), pose(growtype({ ...tilted, wilt: "full" })));
    close(at(3), pose(growtype({ ...tilted, wilt: "wilted" })));
  });

  test("a blast that interrupts another picks each sprout up where it is", () => {
    const tilted = { ...opts, tilt: 25, twist: 15, seed: 3 };
    const first = { direction: "left" as const, at: 0, duration: 1, fromWilt: "full" as const };
    const pose = (r: ReturnType<typeof growtype>) =>
      r.characters.map((c) => [c.rotation, c.tip.x, c.tip.y, c.wilt]);
    for (const t of [0.3, 0.6, 1.2]) {
      // At the moment the second blast fires, nothing moves: some sprouts are still fresh, some
      // mid-wilt, some wilted, and each stays exactly where the first blast had it.
      const shown = growtype({ ...tilted, wilt: "wilted", blast: first, timeOffset: t });
      const second = { at: t, fromWilt: "wilted" as const, interrupts: first };
      const chained = growtype({ ...tilted, wilt: "full", blast: second, timeOffset: t });
      const a = pose(shown);
      pose(chained).forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(a[i]![j]!, 6)));
      // Both shock rings and both knock-backs play.
      expect(chained.svg.match(/-ring"/g)?.length).toBe(2);
      expect(chained.svg.match(/-blast"/g)?.length).toBe(chained.characters.length * 2);
    }
  });

  test("no blast markup unless requested", () => {
    expect(growtype(opts).svg).not.toContain("-ring");
  });
});
