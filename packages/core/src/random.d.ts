/** 32-bit FNV-1a hash of a string. */
export declare function hashString(input: string): number;
/** Mulberry32 PRNG returning floats in [0, 1). */
export declare function mulberry32(seed: number): () => number;
export declare function normalizeSeed(seed: number | string | undefined): number;
/**
 * A keyed random source: each (index, channel) pair has its own stable stream,
 * so tweaking one parameter doesn't reshuffle unrelated randomness.
 */
export declare class Random {
    readonly seed: number;
    constructor(seed: number | string | undefined);
    /** A fresh PRNG for a given index and channel name. */
    stream(index: number, channel: string): () => number;
    /** A single value in [0, 1) for an index/channel. */
    value(index: number, channel: string): number;
    /** A single value in [min, max). */
    range(index: number, channel: string, min: number, max: number): number;
}
