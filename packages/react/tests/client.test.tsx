// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  Growtype,
  type GrowtypeHandle,
  type GrowtypeProps,
  type GrowtypeResult,
} from "../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: GrowtypeProps = {
  text: "spores",
  font: "Georgia",
  path: "M 0 100 L 400 100",
  width: 400,
  height: 200,
};

/** How far each sprout's glyph has wilted in a rendered frame. */
const wilts = (r: GrowtypeResult) => r.characters.map((c) => c.wilt);

/** A component whose wilt the test can change, recording every render. */
function wiltable(props: Partial<GrowtypeProps> = {}) {
  const frames: GrowtypeResult[] = [];
  const control = { setWilt: (_w: GrowtypeProps["wilt"]) => {} };
  function App() {
    const [wilt, set] = useState<GrowtypeProps["wilt"]>("full");
    control.setWilt = set;
    return <Growtype {...base} {...props} wilt={wilt} onRender={(r) => frames.push(r)} />;
  }
  return { App, frames, control };
}

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => host.remove());

async function mount(node: React.ReactNode) {
  const root = createRoot(host);
  await act(async () => root.render(node));
  return root;
}

describe("<Growtype> in the browser", () => {
  test("unrelated re-renders don't touch the SVG (animations keep running)", async () => {
    let bump = () => {};
    function App() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return (
        <>
          <p>{n}</p>
          <Growtype {...base} grow sway />
        </>
      );
    }
    await mount(<App />);
    const svg = host.querySelector("svg");
    expect(svg).not.toBeNull();
    await act(async () => bump());
    expect(host.querySelector("p")!.textContent).toBe("1");
    expect(host.querySelector("svg")).toBe(svg);
  });

  test("changing wilt animates each sprout in turn, then settles", async () => {
    const { App, frames, control } = wiltable({ wiltTransition: { duration: 0.2, stagger: 0.1 } });
    await mount(<App />);
    expect(wilts(frames[0]!).every((w) => w === 0)).toBe(true);
    // act() keeps flushing the per-frame re-renders until the transition has played out.
    await act(async () => control.setWilt("wilted"));
    expect(frames.length).toBeGreaterThan(3);
    // Part way through, some sprouts have fallen further than others.
    expect(frames.some((f) => new Set(wilts(f).map((w) => w.toFixed(2))).size > 1)).toBe(true);
    expect(wilts(frames.at(-1)!).every((w) => w > 0.85)).toBe(true);
  });

  test("the new wilt never shows before its transition does", async () => {
    const { App, frames, control } = wiltable({ wiltTransition: { duration: 0.2, stagger: 0.1 } });
    await mount(<App />);
    await act(async () => control.setWilt("wilted"));
    // The first render after the change starts from where the sprouts were, rather than showing
    // them already wilted for a frame before animating there.
    expect(wilts(frames[1]!).every((w) => w < 0.01)).toBe(true);
  });

  test("a change made mid-transition carries on from where the sprouts are", async () => {
    const { App, frames, control } = wiltable();
    await mount(<App />);
    // Separate acts, so the second change lands while the first transition is still playing.
    act(() => control.setWilt("wilted"));
    await act(async () => new Promise((r) => setTimeout(r, 400)));
    const before = frames.length;
    act(() => control.setWilt("full"));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    const [a, b] = [frames[before - 1]!, frames[before]!];
    // Nothing jumps: every glyph is within a frame's motion of where it just was.
    a.characters.forEach((c, i) => {
      const d = b.characters[i]!;
      expect(Math.hypot(c.tip.x - d.tip.x, c.tip.y - d.tip.y)).toBeLessThan(6);
    });
  }, 10000);

  test("wilt changes instantly when wiltTransition is off", async () => {
    const { App, frames, control } = wiltable({ wiltTransition: false });
    await mount(<App />);
    await act(async () => control.setWilt("wilted"));
    expect(frames.length).toBe(2);
    expect(wilts(frames[1]!).every((w) => w > 0.85)).toBe(true);
  });

  test("ref exposes replay and toSVG", async () => {
    const ref = createRef<GrowtypeHandle>();
    await mount(<Growtype {...base} ref={ref} grow />);
    expect(ref.current!.toSVG()).toMatch(/^<svg /);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    const before = host.querySelector("svg");
    await act(async () => ref.current!.replay());
    expect(host.querySelector("svg")).not.toBe(before);
  });

  test("loads fonts from fontUrl", async () => {
    const fixture = ["../core/tests/fixtures", "packages/core/tests/fixtures"]
      .map((d) => resolve(process.cwd(), d, "YoungSerif-Regular.ttf"))
      .find((p) => existsSync(p))!;
    const bytes = readFileSync(fixture);
    const fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const onRender = vi.fn();
    await mount(
      <Growtype
        {...base}
        font={undefined}
        fontUrl="/fonts/young.ttf"
        fallback={<i>…</i>}
        onRender={onRender}
      />,
    );
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(fetchMock).toHaveBeenCalledWith("/fonts/young.ttf");
    // Glyphs are embedded outlines, not <text>.
    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelector("text")).toBeNull();
    expect(onRender).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("changing text", () => {
  /** A component whose text the test can change, recording every render. */
  function retextable(props: Partial<GrowtypeProps> = {}) {
    const frames: GrowtypeResult[] = [];
    const control = { setText: (_t: string) => {} };
    function App() {
      const [text, set] = useState("spores");
      control.setText = set;
      return <Growtype {...base} {...props} text={text} onRender={(r) => frames.push(r)} />;
    }
    return { App, frames, control };
  }
  const text = (r: GrowtypeResult) => r.characters.map((c) => c.char).join("");
  const exit = { duration: 0.2, stagger: 0.1 };

  test("the old text drops away, then the new text grows in", async () => {
    const { App, frames, control } = retextable({ grow: true, textTransition: exit });
    await mount(<App />);
    act(() => control.setText("mould"));
    // Still the old text, now leaving.
    expect(text(frames.at(-1)!)).toBe("spores");
    expect(frames.at(-1)!.svg).toMatch(/-drop/);
    await act(async () => new Promise((r) => setTimeout(r, 450)));
    const last = frames.at(-1)!;
    expect(text(last)).toBe("mould");
    expect(last.svg).not.toMatch(/-drop/);
    // Growing from after the old text left, not already grown.
    expect(Math.min(...last.characters.map((c) => c.growDelay))).toBeGreaterThan(0.25);
  });

  test("changes made while text is leaving wait for it, and the latest one grows", async () => {
    const { App, frames, control } = retextable({ textTransition: exit });
    await mount(<App />);
    act(() => control.setText("mo"));
    act(() => control.setText("mould"));
    expect(text(frames.at(-1)!)).toBe("spores");
    await act(async () => new Promise((r) => setTimeout(r, 450)));
    expect(text(frames.at(-1)!)).toBe("mould");
    expect(frames.some((f) => text(f) === "mo")).toBe(false);
  });

  test("swaps instantly when textTransition is off", async () => {
    const { App, frames, control } = retextable({ textTransition: false });
    await mount(<App />);
    await act(async () => control.setText("mould"));
    expect(text(frames.at(-1)!)).toBe("mould");
    expect(frames.at(-1)!.characters.every((c) => c.growDelay === 0)).toBe(true);
  });
});
