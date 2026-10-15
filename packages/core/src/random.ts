/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix integers into a well-distributed 32-bit value (murmur3 finalizer). */
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Mulberry32 PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number | string | undefined): number {
  if (seed === undefined) return 1;
  if (typeof seed === "number") return seed >>> 0 || hashString(String(seed));
  return hashString(seed);
}

/**
 * A keyed random source: each (index, channel) pair has its own stable stream,
 * so tweaking one parameter doesn't reshuffle unrelated randomness.
 */
export class Random {
  readonly seed: number;

  constructor(seed: number | string | undefined) {
    this.seed = normalizeSeed(seed);
  }

  /** A fresh PRNG for a given index and channel name. */
  stream(index: number, channel: string): () => number {
    return mulberry32(mix(mix(this.seed, hashString(channel)), index + 1));
  }

  /** A single value in [0, 1) for an index/channel. */
  value(index: number, channel: string): number {
    return this.stream(index, channel)();
  }

  /** A single value in [min, max). */
  range(index: number, channel: string, min: number, max: number): number {
    return min + (max - min) * this.value(index, channel);
  }
}
