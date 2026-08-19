import { describe, expect, it } from "vitest";
import { createFetchCache } from "./fetch-cache";

describe("createFetchCache", () => {
  it("claims unknown keys exactly once", () => {
    const cache = createFetchCache<number, string>();
    expect(cache.begin([1, 2])).toEqual([1, 2]);
    // In flight: a second settle pass must not refetch.
    expect(cache.begin([1, 2, 3])).toEqual([3]);
  });

  it("serves settled values and stops claiming them", () => {
    const cache = createFetchCache<string, number>();
    cache.begin(["a"]);
    cache.settle("a", 42);
    expect(cache.get("a")).toBe(42);
    expect(cache.known("a")).toBe(true);
    expect(cache.begin(["a"])).toEqual([]);
  });

  it("latches failures for the page lifetime by default (the v0.6.0 flood guard)", () => {
    const cache = createFetchCache<string, number>();
    cache.begin(["a"]);
    cache.fail(["a"]);
    expect(cache.known("a")).toBe(true);
    expect(cache.begin(["a"])).toEqual([]);
    expect(cache.get("a")).toBeUndefined();
  });

  it("forgets failures under the retry policy so a later pass refetches", () => {
    const cache = createFetchCache<number, number>({ onFailure: "retry" });
    cache.begin([1, 2]);
    cache.fail([1, 2]);
    expect(cache.known(1)).toBe(false);
    expect(cache.begin([1, 2])).toEqual([1, 2]);
  });

  it("keys settle independently within a claimed batch", () => {
    const cache = createFetchCache<number, number>();
    cache.begin([1, 2, 3]);
    cache.settle(1, 10);
    cache.fail([2]);
    expect(cache.get(1)).toBe(10);
    expect(cache.get(2)).toBeUndefined();
    expect(cache.known(3)).toBe(true); // still in flight
  });
});
