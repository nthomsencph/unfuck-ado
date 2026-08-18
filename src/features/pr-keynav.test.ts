import { describe, expect, it } from "vitest";
import { pickNextIndex } from "./pr-keynav";

describe("pickNextIndex", () => {
  // tops are relative to the reference line; negative = above it.

  it("picks the first element below the line going forward", () => {
    expect(pickNextIndex([-200, -100, 50, 150], 1)).toBe(2);
  });

  it("picks the last element above the line going backward", () => {
    expect(pickNextIndex([-200, -100, 50, 150], -1)).toBe(1);
  });

  it("clamps to the last element when everything is above", () => {
    expect(pickNextIndex([-300, -200, -100], 1)).toBe(2);
  });

  it("clamps to the first element when everything is below", () => {
    expect(pickNextIndex([100, 200, 300], -1)).toBe(0);
  });

  it("ignores elements within the epsilon band (current element)", () => {
    // element at ~0 is "current"; next should skip it
    expect(pickNextIndex([-100, 2, 120], 1)).toBe(2);
    expect(pickNextIndex([-100, 2, 120], -1)).toBe(0);
  });

  it("returns null for no elements", () => {
    expect(pickNextIndex([], 1)).toBeNull();
  });
});
