import { describe, expect, it } from "vitest";
import {
  counterLabel,
  nextUnreviewedPath,
  parseChangedFiles,
  reviewButtonLabel,
} from "./pr-review-flow";

describe("parseChangedFiles", () => {
  it("parses the toolbar text", () => {
    expect(parseChangedFiles("40 changed files")).toBe(40);
    expect(parseChangedFiles(" 1 changed file ")).toBe(1);
  });

  it("rejects everything else", () => {
    expect(parseChangedFiles("changed files")).toBeNull();
    expect(parseChangedFiles("40 files")).toBeNull();
    expect(parseChangedFiles(null)).toBeNull();
    expect(parseChangedFiles(undefined)).toBeNull();
  });
});

describe("nextUnreviewedPath", () => {
  const order = ["/a", "/b", "/c"];

  it("starts at the top without an anchor", () => {
    expect(nextUnreviewedPath(order, new Set(), null)).toBe("/a");
  });

  it("skips reviewed files", () => {
    expect(nextUnreviewedPath(order, new Set(["/a"]), null)).toBe("/b");
  });

  it("continues after the anchor and wraps", () => {
    expect(nextUnreviewedPath(order, new Set(), "/b")).toBe("/c");
    expect(nextUnreviewedPath(order, new Set(["/c"]), "/b")).toBe("/a");
  });

  it("returns the anchor itself when it is the only file left", () => {
    expect(nextUnreviewedPath(order, new Set(["/a", "/c"]), "/b")).toBe("/b");
  });

  it("unknown anchor starts at the top", () => {
    expect(nextUnreviewedPath(order, new Set(), "/zzz")).toBe("/a");
  });

  it("null when everything is reviewed or there are no files", () => {
    expect(nextUnreviewedPath(order, new Set(order), "/a")).toBeNull();
    expect(nextUnreviewedPath([], new Set(), null)).toBeNull();
  });
});

describe("reviewButtonLabel", () => {
  it("is Review before starting", () => {
    expect(reviewButtonLabel(3, 40, false)).toBe("Review");
  });

  it("shows progress while reviewing", () => {
    expect(reviewButtonLabel(3, 40, true)).toBe("Reviewing · 3/40");
    expect(reviewButtonLabel(0, 40, true)).toBe("Reviewing · 0/40");
  });

  it("shows done at n = m", () => {
    expect(reviewButtonLabel(40, 40, true)).toBe("Reviewed ✓");
  });

  it("degrades while counts are unknown", () => {
    expect(reviewButtonLabel(null, 40, true)).toBe("Reviewing…");
    expect(reviewButtonLabel(3, null, true)).toBe("Reviewing…");
  });
});

describe("counterLabel", () => {
  it("shows n/m", () => {
    expect(counterLabel(3, 40)).toBe("3/40 files reviewed");
  });

  it("celebrates done", () => {
    expect(counterLabel(40, 40)).toBe("All files reviewed ✓");
  });

  it("degrades while counts are unknown", () => {
    expect(counterLabel(null, 40)).toBe("…/40 files reviewed");
    expect(counterLabel(3, null)).toBe("3/… files reviewed");
  });
});
