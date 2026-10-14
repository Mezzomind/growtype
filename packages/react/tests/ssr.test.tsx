import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import { CssFontAdapter, Growtype, optionsKey } from "../src/index.ts";

const props = {
  text: "moss",
  path: "M 0 100 L 400 100",
  width: 400,
  height: 200,
};

describe("<Growtype> on the server", () => {
  test("renders the SVG inline, scaled to its container by default", () => {
    const html = renderToString(<Growtype {...props} font="Georgia" className="hero" />);
    expect(html).toContain('<div class="hero">');
    expect(html).toContain('<svg style="display:block;width:100%;height:auto"');
    expect(html).toContain("<title>moss</title>");
  });

  test("responsive={false} keeps the SVG's own size", () => {
    const html = renderToString(<Growtype {...props} responsive={false} />);
    expect(html).not.toContain("width:100%");
    expect(html).toContain('width="400"');
  });

  test("shows the fallback while a font file loads", () => {
    const html = renderToString(
      <Growtype {...props} fontUrl="/fonts/x.ttf" fallback={<span>loading</span>} />,
    );
    expect(html).toBe("<span>loading</span>");
  });
});

describe("optionsKey", () => {
  test("changes exactly when options change, comparing fonts by identity", () => {
    const font = new CssFontAdapter("Georgia");
    const a = { ...props, font };
    expect(optionsKey(a)).toBe(optionsKey({ ...a }));
    expect(optionsKey(a)).not.toBe(optionsKey({ ...a, text: "mould" }));
    expect(optionsKey(a)).not.toBe(optionsKey({ ...a, font: new CssFontAdapter("Georgia") }));
    expect(optionsKey(null)).toBe("");
  });
});
