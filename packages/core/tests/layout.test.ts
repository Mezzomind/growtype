import { describe, expect, test } from "vite-plus/test";
import { layoutText } from "../src/layout.ts";
import { font } from "./helpers.ts";

const base = {
  font,
  fontSize: 40,
  letterSpacing: 0,
  pathLength: 1000,
  mode: "natural" as const,
  justify: "left" as const,
  inset: 0,
};

describe("layoutText", () => {
  test("left / center / right justification", () => {
    const left = layoutText({ ...base, text: "moss" });
    const width = left.end - left.start;
    expect(left.start).toBe(0);
    const center = layoutText({ ...base, text: "moss", justify: "center" });
    expect(center.start).toBeCloseTo((1000 - width) / 2);
    const right = layoutText({ ...base, text: "moss", justify: "right" });
    expect(right.end).toBeCloseTo(1000);
  });

  test("respects inset", () => {
    const r = layoutText({ ...base, text: "moss", justify: "right", inset: 50 });
    expect(r.end).toBeCloseTo(950);
  });

  test("fill spreads characters across the whole path", () => {
    const r = layoutText({ ...base, text: "spore", mode: "fill", inset: 10 });
    expect(r.start).toBeCloseTo(10);
    expect(r.end).toBeCloseTo(990);
    expect(r.fontSize).toBe(40);
    const gaps = r.chars
      .slice(1)
      .map((c, i) => c.s - c.advance / 2 - (r.chars[i]!.s + r.chars[i]!.advance / 2));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!);
  });

  test("natural layout auto-shrinks when text overflows", () => {
    const r = layoutText({ ...base, text: "a very long line of mould", pathLength: 200 });
    expect(r.fontSize).toBeLessThan(40);
    expect(r.end - r.start).toBeCloseTo(200, 1);
  });

  test("fill layout shrinks the font once spacing can't absorb the overflow", () => {
    const r = layoutText({
      ...base,
      text: "a very long line of mould",
      pathLength: 200,
      mode: "fill",
    });
    expect(r.fontSize).toBeLessThan(40);
    expect(r.end).toBeCloseTo(200, 1);
  });

  test("marks spaces and keeps code points intact", () => {
    const r = layoutText({ ...base, text: "a 🍄b" });
    expect(r.chars.map((c) => c.char)).toEqual(["a", " ", "🍄", "b"]);
    expect(r.chars[1]!.isSpace).toBe(true);
  });

  test("applies kerning from the font", () => {
    const pair = layoutText({ ...base, text: "AV" });
    const sum = font.glyph("A", 40).advance + font.glyph("V", 40).advance;
    // Young Serif kerns AV; at minimum, the layout must account for whatever kerning exists.
    expect(pair.end - pair.start).toBeCloseTo(sum + font.kerning("A", "V", 40));
  });
});
