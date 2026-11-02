import { describe, expect, it } from "vitest";
import { createQueue, diffstatParts, pruneOldest, type CachedStat } from "./list-diffstat";

describe("diffstatParts", () => {
  it("formats GitHub's diffstat with a real minus and pluralized files", () => {
    expect(diffstatParts({ adds: 120, dels: 30, files: 4 })).toEqual({
      adds: "+120",
      dels: "−30",
      files: "4 changed files",
    });
  });
  it("uses the singular for one file and k-suffixes big counts", () => {
    expect(diffstatParts({ adds: 18255, dels: 0, files: 1 })).toEqual({
      adds: "+18.3k",
      dels: "−0",
      files: "1 changed file",
    });
  });
});

describe("pruneOldest", () => {
  const stat = (t: number): CachedStat => ({ adds: 1, dels: 1, files: 1, t });
  it("keeps the newest entries up to the cap", () => {
    const pruned = pruneOldest({ a: stat(1), b: stat(3), c: stat(2) }, 2);
    expect(Object.keys(pruned).sort()).toEqual(["b", "c"]);
  });
  it("returns the map untouched under the cap", () => {
    const map = { a: stat(1) };
    expect(pruneOldest(map, 2)).toBe(map);
  });
});

describe("createQueue", () => {
  it("never runs more than the limit at once and runs everything", async () => {
    const run = createQueue(2);
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    const task = (i: number) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      done.push(i);
      return i;
    };
    const results = await Promise.all([0, 1, 2, 3, 4].map((i) => run(task(i))));
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
