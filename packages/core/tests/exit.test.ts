import { describe, expect, test } from "vite-plus/test";
import { type GrowtypeOptions, growtype } from "../src/index.ts";
import { font } from "./helpers.ts";

const opts: GrowtypeOptions = {
  text: "spores of thought",
  font,
  path: "M 20 230 L 480 230",
  width: 500,
  height: 300,
  seed: 3,
};

/** Animation delays (seconds) of each element with the given class, in document order. */
const delays = (svg: string, cls: string) =>
  [
    ...svg.matchAll(
      new RegExp(`class="[a-z0-9]+-${cls}" style="[^"]*animation-delay:(-?[\\d.]+)s`, "g"),
    ),
  ].map((m) => +m[1]!);

describe("exit", () => {
  test("every glyph drops and every stalk withers, in turn along the path", () => {
    const { svg } = growtype({ ...opts, exit: { at: 2, stagger: 0.5, duration: 1 } });
    const drops = delays(svg, "drop");
    const withers = delays(svg, "wither");
    expect(drops).toHaveLength(15);
    expect(withers).toHaveLength(15);
    expect(drops[0]).toBeCloseTo(2);
    expect(drops.at(-1)).toBeCloseTo(2.5);
    expect(drops).toEqual([...drops].sort((a, b) => a - b));
    // A stalk starts wilting once its glyph has let go.
    withers.forEach((w, i) => expect(w).toBeGreaterThan(drops[i]!));
  });

  test("goes from the end of the path when asked", () => {
    const drops = delays(growtype({ ...opts, exit: { direction: "end" } }).svg, "drop");
    expect(drops[0]).toBeGreaterThan(drops.at(-1)!);
  });

  test("goes in a seeded random order when asked", () => {
    const random = (seed: number) =>
      delays(growtype({ ...opts, seed, exit: { direction: "random", stagger: 1 } }).svg, "drop");
    const drops = random(3);
    expect(drops).not.toEqual([...drops].sort((a, b) => a - b));
    expect(Math.min(...drops)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drops)).toBeLessThanOrEqual(1);
    expect(random(3)).toEqual(drops);
  });

  test("stalks start wilting while their glyphs are still falling", () => {
    const { svg } = growtype({ ...opts, exit: { duration: 1 } });
    const fall = 0.75;
    const drops = delays(svg, "drop");
    delays(svg, "wither").forEach((w, i) => expect(w).toBeLessThan(drops[i]! + fall / 2));
  });

  test("is timed on the shared timeline", () => {
    const drops = delays(growtype({ ...opts, exit: { at: 2 }, timeOffset: 1.5 }).svg, "drop");
    expect(drops[0]).toBeCloseTo(0.5);
  });

  test("starts from the sprouts as they stand", () => {
    const still = growtype(opts);
    const leaving = growtype({ ...opts, exit: true });
    expect(leaving.characters).toEqual(still.characters);
    expect(still.svg).not.toMatch(/-drop|-wither/);
  });
});

describe("text transitions", () => {
  const change = { ...opts, text: "mould", textTransition: { from: "spores", at: 1 } };
  const end = 1 + 0.6 + 1.2;

  test("the old text leaves, then the new text grows in under the drawn path", () => {
    const r = growtype({ ...change, grow: true, showPath: true, timeOffset: 1 });
    expect(delays(r.svg, "drop")).toHaveLength(6);
    expect(r.characters.map((c) => c.char).join("")).toBe("mould");
    expect(Math.min(...r.characters.map((c) => c.growDelay))).toBeGreaterThanOrEqual(end);
    // The path keeps its own timing: drawn from the start, not again after the swap.
    expect(r.svg).toMatch(/-reveal"[^>]*animation-delay:-1s/);
  });

  test("leaves no old text behind once it has gone", () => {
    const r = growtype({ ...change, timeOffset: end + 0.1 });
    expect(r.svg).not.toMatch(/-drop/);
    expect(r.characters).toHaveLength(5);
  });

  test("does nothing when the text hasn't changed", () => {
    const same = { ...opts, textTransition: { from: opts.text } };
    expect(growtype(same).svg).toBe(growtype(opts).svg);
  });
});
