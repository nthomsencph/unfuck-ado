import { describe, expect, it } from "vitest";
import { fitColumns, type ColSpec } from "./backlog-grid";

/** The live Epics backlog captured 2026-08-18: container 1328, table 1657. */
function liveSpecs(): ColSpec[] {
  return [
    { kind: "fixed", width: 8 }, // border
    { kind: "fixed", width: 70 }, // expand/collapse
    { kind: "fixed", width: 60 }, // Order
    { kind: "data", width: 100 }, // Work Item Type
    { kind: "title", width: 400 }, // Title
    { kind: "fixed", width: 42 }, // More actions (2.625rem)
    { kind: "data", width: 100 }, // State
    { kind: "data", width: 111 }, // Effort
    { kind: "data", width: 200 }, // Tags
    { kind: "data", width: 291 }, // Assigned To
    { kind: "data", width: 267 }, // Changed Date
    { kind: "filler", width: 0 }, // width:100% filler
    { kind: "fixed", width: 8 }, // border
  ];
}

function total(widths: number[]): number {
  return widths.reduce((a, w) => a + w, 0);
}

describe("fitColumns", () => {
  it("gives all slack to the title column when the table underflows", () => {
    const widths = fitColumns(liveSpecs(), 2000);
    expect(widths).not.toBeNull();
    expect(total(widths!)).toBe(2000);
    // Data columns keep their natural widths; only title grew.
    expect(widths![3]).toBe(100);
    expect(widths![9]).toBe(291);
    // All slack lands on the title: container minus fixed (188) minus data (1069).
    expect(widths![4]).toBe(2000 - 188 - 1069);
  });

  it("shrinks data columns proportionally when the title would fall below its minimum", () => {
    const widths = fitColumns(liveSpecs(), 1328);
    expect(widths).not.toBeNull();
    // Exact fit: no horizontal scroll.
    expect(total(widths!)).toBe(1328);
    // Title clamped to its minimum.
    expect(widths![4]).toBeGreaterThanOrEqual(280);
    // Fat columns gave up space, proportionally (0.804... of natural).
    expect(widths![9]).toBeLessThan(291);
    expect(widths![10]).toBeLessThan(267);
    // Fixed columns untouched.
    expect(widths![0]).toBe(8);
    expect(widths![1]).toBe(70);
    expect(widths![5]).toBe(42);
    // Filler stays collapsed.
    expect(widths![11]).toBe(0);
  });

  it("keeps natural widths when the table already fits exactly", () => {
    // fixed 188 + data 1069 + title 400 = 1657
    const widths = fitColumns(liveSpecs(), 1657);
    expect(widths).not.toBeNull();
    expect(widths![4]).toBe(400);
    expect(widths![9]).toBe(291);
    expect(total(widths!)).toBe(1657);
  });

  it("stops shrinking at the scale floor and accepts overflow on tiny viewports", () => {
    const widths = fitColumns(liveSpecs(), 500);
    expect(widths).not.toBeNull();
    // Data columns never go below half their natural width…
    expect(widths![9]).toBeGreaterThanOrEqual(Math.floor(291 * 0.5));
    // …and the title keeps its minimum, so the table overflows (scroll returns).
    expect(widths![4]).toBe(280);
    expect(total(widths!)).toBeGreaterThan(500);
  });

  it("is a fixpoint: refitting its own output changes nothing", () => {
    const specs = liveSpecs();
    const first = fitColumns(specs, 1328)!;
    const refit = fitColumns(
      specs.map((s, i) => ({ kind: s.kind, width: s.kind === "fixed" ? s.width : first[i]! })),
      1328
    );
    expect(refit).toEqual(first);
  });

  it("bails without exactly one title column", () => {
    expect(fitColumns([{ kind: "data", width: 100 }], 800)).toBeNull();
    expect(
      fitColumns(
        [
          { kind: "title", width: 100 },
          { kind: "title", width: 100 },
        ],
        800
      )
    ).toBeNull();
  });

  it("bails on a nonsense container width", () => {
    expect(fitColumns(liveSpecs(), 0)).toBeNull();
  });
});
