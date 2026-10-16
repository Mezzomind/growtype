// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { Growtype, type GrowtypeHandle, type GrowtypeProps } from "../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: GrowtypeProps = {
  text: "spores",
  font: "Georgia",
  path: "M 0 100 L 400 100",
  width: 400,
  height: 200,
};

/** How many blasts a rendered frame carries: each knocks every sprout of "spores" back once. */
const blastsIn = (svg: string) => (svg.match(/-blast"/g)?.length ?? 0) / 6;

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

  test("changing wilt sweeps a blast wave across, then settles", async () => {
    let setWilt: (w: GrowtypeProps["wilt"]) => void = () => {};
    const frames: string[] = [];
    function App() {
      const [wilt, set] = useState<GrowtypeProps["wilt"]>("full");
      setWilt = set;
      return (
        <Growtype
          {...base}
          wilt={wilt}
          blastOnWiltChange={{ direction: "right", duration: 0.2, recoil: 0.2 }}
          onRender={(r) => frames.push(r.svg)}
        />
      );
    }
    await mount(<App />);
    expect(frames.some((f) => blastsIn(f) > 0)).toBe(false);
    // act() keeps flushing the per-frame re-renders until the blast has played out.
    await act(async () => setWilt("wilted"));
    const during = frames.filter((f) => blastsIn(f) > 0);
    expect(during.length).toBeGreaterThan(1);
    // Knocked towards the left, away from a blast coming from the right.
    expect(during[0]).toMatch(/--k:-[\d.]+deg/);
    // Once it's over the transient blast markup is gone.
    expect(blastsIn(host.innerHTML)).toBe(0);
  });

  test("the new wilt never shows before its blast does", async () => {
    let setWilt: (w: GrowtypeProps["wilt"]) => void = () => {};
    const frames: string[] = [];
    function App() {
      const [wilt, set] = useState<GrowtypeProps["wilt"]>("full");
      setWilt = set;
      return (
        <Growtype
          {...base}
          wilt={wilt}
          blastOnWiltChange={{ duration: 0.2, recoil: 0.2 }}
          onRender={(r) => frames.push(r.svg)}
        />
      );
    }
    await mount(<App />);
    await act(async () => setWilt("wilted"));
    // The first render after the change already carries the blast, rather than snapping every
    // sprout to the new wilt for a frame before the wave sets off.
    expect(blastsIn(frames[1]!)).toBe(1);
  });

  test("a blast fired mid-blast carries on from where the first left off", async () => {
    let setWilt: (w: GrowtypeProps["wilt"]) => void = () => {};
    const frames: string[] = [];
    function App() {
      const [wilt, set] = useState<GrowtypeProps["wilt"]>("full");
      setWilt = set;
      return (
        <Growtype {...base} wilt={wilt} blastOnWiltChange onRender={(r) => frames.push(r.svg)} />
      );
    }
    await mount(<App />);
    // Separate acts, so the second change lands while the first blast is still playing.
    act(() => setWilt("wilted"));
    act(() => setWilt("full"));
    await act(async () => new Promise((r) => setTimeout(r, 100)));
    // Both blasts play: the second interrupts the first instead of replacing it.
    expect(frames.some((f) => blastsIn(f) === 2)).toBe(true);
  }, 10000);

  test("no blast when blastOnWiltChange is off", async () => {
    let setWilt: (w: GrowtypeProps["wilt"]) => void = () => {};
    const frames: string[] = [];
    function App() {
      const [wilt, set] = useState<GrowtypeProps["wilt"]>("full");
      setWilt = set;
      return <Growtype {...base} wilt={wilt} onRender={(r) => frames.push(r.svg)} />;
    }
    await mount(<App />);
    await act(async () => setWilt("wilted"));
    expect(frames.length).toBe(2);
    expect(frames.some((f) => blastsIn(f) > 0)).toBe(false);
  });

  test("ref exposes replay, blast and toSVG", async () => {
    const ref = createRef<GrowtypeHandle>();
    const frames: string[] = [];
    await mount(<Growtype {...base} ref={ref} grow onRender={(r) => frames.push(r.svg)} />);
    expect(ref.current!.toSVG()).toMatch(/^<svg /);
    await act(async () => ref.current!.blast({ direction: "left", duration: 0.2, recoil: 0.2 }));
    expect(frames.some((f) => blastsIn(f) > 0 && /--k:[\d.]+deg/.test(f))).toBe(true);
    // The exported SVG never includes the transient blast.
    expect(blastsIn(ref.current!.toSVG())).toBe(0);
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
