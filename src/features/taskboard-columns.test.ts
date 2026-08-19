import { describe, expect, it } from "vitest";
import { colTargets, columnCss, headerName, stateColumns } from "./taskboard-columns";

/** The live taskboard header captured 2026-08-18. */
const HEADERS = [
  "",
  "Collapse all",
  "New",
  "Ready for development",
  "Active",
  "Ready For Review",
  "Ready for deploy",
  "Deployed to test",
  "Test approved",
  "Test rejected",
  "Blocked",
  "Resolved",
  "Closed",
  "",
];

describe("stateColumns", () => {
  it("maps state headers to 1-based nth-child indices, skipping chrome columns", () => {
    const cols = stateColumns(HEADERS);
    expect(cols[0]).toEqual({ name: "New", nth: 3 });
    expect(cols[cols.length - 1]).toEqual({ name: "Closed", nth: 13 });
    expect(cols).toHaveLength(11);
  });

  it("returns nothing for degenerate headers", () => {
    expect(stateColumns([])).toEqual([]);
    expect(stateColumns(["", "Collapse all", ""])).toEqual([]);
  });
});

describe("headerName", () => {
  it("strips the appended count so names stay stable for menu and storage", () => {
    const th = document.createElement("th");
    th.textContent = "New";
    const span = document.createElement("span");
    span.className = "adofix-col-count";
    span.textContent = " (7)";
    th.appendChild(span);
    expect(headerName(th)).toBe("New");
  });

  it("passes untouched headers through", () => {
    const th = document.createElement("th");
    th.textContent = "Ready For Review";
    expect(headerName(th)).toBe("Ready For Review");
  });
});

describe("columnCss", () => {
  it("hides the cells and pins the exact table min-width — never sets col widths", () => {
    const css = columnCss([12, 13], [3, 4, 5, 6, 7, 8, 9, 10, 11], 2064);
    expect(css).toContain("tr > :nth-child(12)");
    expect(css).toContain("tr > :nth-child(13)");
    expect(css).toContain("min-width: 2064px !important");
    // Firefox's fixed layout ignores auto AND percent/calc widths on <col> —
    // widths must be inline pixels (colTargets), never stylesheet rules.
    expect(css).not.toContain("width: calc");
    expect(css).not.toContain("width: auto");
  });

  it("emits nothing when no columns are hidden (native layout preserved)", () => {
    expect(columnCss([], [3, 4, 5], 1000)).toBe("");
    expect(columnCss([3], [], 1000)).toBe("");
  });
});

describe("colTargets", () => {
  it("lays tracks out compactly: border, capped parent, shares, border, zeros", () => {
    // 14 cols, container 1616, parent capped 220→180, 4 visible:
    // 4 + 180 + 4×357 + 4 = 1616.
    const { widths, tableMin } = colTargets(4, 14, 1616, 220);
    expect(widths.get(1)).toBe(4);
    expect(widths.get(2)).toBe(180); // PARENT_MAX cap
    expect(widths.get(3)).toBe(357);
    expect(widths.get(6)).toBe(357);
    expect(widths.get(7)).toBe(4); // right border cell shifts to track 7
    expect(widths.get(8)).toBe(0);
    expect(widths.get(14)).toBe(0);
    const total = [...widths.values()].reduce((a, w) => a + w, 0);
    expect(total).toBe(1616);
    expect(tableMin).toBe(1616);
  });

  it("keeps a parent column narrower than the cap", () => {
    expect(colTargets(4, 14, 1616, 160).widths.get(2)).toBe(160);
  });

  it("gives the rounding remainder to the last visible track", () => {
    const { widths } = colTargets(3, 8, 1030, 220);
    // avail = 1030 - 188 = 842 → tracks 3,4 = 280, track 5 = 282
    expect(widths.get(3)).toBe(280);
    expect(widths.get(5)).toBe(282);
    expect(widths.get(6)).toBe(4);
  });

  it("renders native tracks with reduced scroll when the share would be a sliver", () => {
    // 9 visible in a 1192px pane → sliver shares read as "the table shrank".
    const { widths, tableMin } = colTargets(9, 14, 1192, 220);
    expect(widths.get(3)).toBe(204);
    expect(widths.get(11)).toBe(204);
    expect(widths.get(12)).toBe(4);
    expect(tableMin).toBe(188 + 9 * 204);
  });

  it("fills the pane with sub-native shares as long as they stay usable", () => {
    // 8 visible in a 1483px pane → 161px shares fill (tracks 3..10).
    const { widths, tableMin } = colTargets(8, 14, 1483, 220);
    expect(widths.get(3)).toBe(161);
    expect(widths.get(10)).toBe(1295 - 161 * 7); // remainder → 168
    expect(widths.get(11)).toBe(4);
    expect(tableMin).toBe(1483);
  });

  it("is empty for degenerate input", () => {
    expect(colTargets(0, 8, 1000, 220).widths.size).toBe(0);
    expect(colTargets(1, 8, 0, 220).widths.size).toBe(0);
  });
});
