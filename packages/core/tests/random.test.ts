import { expect, test } from "vite-plus/test";
import { Random, mulberry32 } from "../src/random.ts";

test("mulberry32 is deterministic and in [0,1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("Random streams are keyed by seed, index and channel", () => {
  const r = new Random("moss");
  expect(r.value(3, "tilt")).toBe(new Random("moss").value(3, "tilt"));
  expect(r.value(3, "tilt")).not.toBe(r.value(4, "tilt"));
  expect(r.value(3, "tilt")).not.toBe(r.value(3, "length"));
  expect(r.value(3, "tilt")).not.toBe(new Random("lichen").value(3, "tilt"));
});
