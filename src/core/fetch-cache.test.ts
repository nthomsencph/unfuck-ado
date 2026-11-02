import { describe, expect, it, vi } from "vitest";
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

  describe("load", () => {
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

    it("fetches once, then serves the value; onSettled sees the fetch land", async () => {
      const cache = createFetchCache<string, number>();
      const fetch = vi.fn(async () => 7);
      const settled = vi.fn();
      expect(cache.load("a", fetch, settled)).toBeUndefined();
      expect(cache.load("a", fetch, settled)).toBeUndefined(); // in flight
      await flush();
      expect(settled).toHaveBeenCalledWith(7);
      expect(cache.load("a", fetch, settled)).toBe(7);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("null and rejection are failures under the cache's policy", async () => {
      const latch = createFetchCache<string, number>();
      const retry = createFetchCache<string, number>({ onFailure: "retry" });
      const settled = vi.fn();
      latch.load("a", async () => null, settled);
      retry.load("a", () => Promise.reject(new Error("x")), settled);
      await flush();
      expect(latch.known("a")).toBe(true);
      expect(retry.known("a")).toBe(false);
      expect(settled).not.toHaveBeenCalled();
    });
  });
});
