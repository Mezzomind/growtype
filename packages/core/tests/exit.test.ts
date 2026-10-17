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
