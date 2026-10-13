import { describe, expect, test } from "vite-plus/test";
import { growtype, isEmoji, splitGraphemes } from "../src/index.ts";
import { font } from "./helpers.ts";

const opts = { font, path: "M0 200 L900 200", width: 900, height: 300, fontSize: 40 };

const SEQUENCES = ["👨‍👩‍👧", "🇯🇵", "👍🏽", "1️⃣", "❤️", "🏳️‍🌈", "🍄"];

describe("splitGraphemes", () => {
  test("keeps emoji sequences whole", () => {
    expect(splitGraphemes(`a${SEQUENCES.join("")}b`)).toEqual(["a", ...SEQUENCES, "b"]);
  });

  test("keeps combining accents with their letter", () => {
    expect(splitGraphemes("café")).toEqual(["c", "a", "f", "é"]);
  });

  test("fallback splitter matches Intl.Segmenter", () => {
    // Simulate an environment without Intl.Segmenter.
    const intl = Intl as { Segmenter?: typeof Intl.Segmenter };
    const segmenter = intl.Segmenter;
    try {
      delete intl.Segmenter;
      expect(splitGraphemes(`a${SEQUENCES.join("")}b`)).toEqual(["a", ...SEQUENCES, "b"]);
    } finally {
      intl.Segmenter = segmenter;
    }
  });
});

test("isEmoji", () => {
  for (const e of SEQUENCES) expect(isEmoji(e)).toBe(true);
  for (const c of ["a", "1", "©", "™", " ", "é", "❤︎"]) expect(isEmoji(c)).toBe(false);
});

describe("emoji in text", () => {
  test.each([
    ["start", "🍄moss"],
    ["middle", "mo🍄ss"],
    ["end", "moss🍄"],
    ["between words", "moss 🍄 grows"],
    ["only emoji", "🍄👨‍👩‍👧🇯🇵"],
  ])("emoji at %s sprout like any other character", (_, text) => {
    const r = growtype({ ...opts, text });
    const expected = splitGraphemes(text).filter((c) => c.trim());
    expect(r.characters.map((c) => c.char)).toEqual(expected);
    expect(r.svg.match(/-stem"/g)?.length).toBe(expected.length);
    // Letters stay glyph paths; each emoji is one <text> in the colour emoji font.
    const emojiCount = expected.filter(isEmoji).length;
    expect(r.svg.match(/<text /g)?.length ?? 0).toBe(emojiCount);
    expect(r.svg).not.toContain("&amp;#"); // no double escaping
    for (const e of expected.filter(isEmoji)) expect(r.svg).toContain(`>${e}</text>`);
    if (emojiCount) expect(r.svg).toContain("Noto Color Emoji");
  });

  test("emoji are spaced by their own advance and keep their order along the path", () => {
    const r = growtype({ ...opts, text: "a🍄b" });
    const [a, m, b] = r.characters;
    expect(m!.base.x).toBeGreaterThan(a!.base.x);
    expect(b!.base.x).toBeGreaterThan(m!.base.x);
  });

  test("characters missing from the font fall back to <text>", () => {
    const r = growtype({ ...opts, text: "a中b" }); // a CJK ideograph Young Serif lacks
    expect(r.svg).toContain(">中</text>");
    expect(r.svg.match(/<text /g)?.length).toBe(1);
  });

  test("emojiFont and emojiScale are configurable", () => {
    const svg = growtype({ ...opts, text: "a🍄", emojiFont: "Twemoji", emojiScale: 0.5 }).svg;
    expect(svg).toContain('font-family="Twemoji"');
    expect(svg).toContain('font-size="20"');
  });

  test("CSS font mode also routes emoji to the emoji font", () => {
    const svg = growtype({ ...opts, font: "Georgia", text: "a🍄" }).svg;
    expect(svg).toContain('font-family="Georgia"');
    expect(svg).toContain("Apple Color Emoji");
  });
});
