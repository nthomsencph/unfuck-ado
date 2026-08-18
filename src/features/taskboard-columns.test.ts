import { describe, expect, it } from "vitest";
import { colTargets, columnCss, stateColumns, taskboardTeamKey } from "./taskboard-columns";

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
  it("lays tracks out compactly: border, shares, border, then zeros", () => {
    // 14 cols, container 1616, parent 220, 4 visible: 4+220+4×347+4 = 1616.
    const { widths, tableMin } = colTargets(4, 14, 1616, 220);
    expect(widths.get(1)).toBe(4);
    expect(widths.get(3)).toBe(347);
    expect(widths.get(6)).toBe(347);
    expect(widths.get(7)).toBe(4); // right border cell shifts to track 7
    expect(widths.get(8)).toBe(0);
    expect(widths.get(14)).toBe(0);
    const total = 220 + [...widths.values()].reduce((a, w) => a + w, 0);
    expect(total).toBe(1616);
    expect(tableMin).toBe(1616);
  });

  it("gives the rounding remainder to the last visible track", () => {
    const { widths } = colTargets(3, 8, 1030, 220);
    // avail = 1030 - 228 = 802 → tracks 3,4 = 267, track 5 = 268
    expect(widths.get(3)).toBe(267);
    expect(widths.get(5)).toBe(268);
    expect(widths.get(6)).toBe(4);
  });

  it("renders native tracks with reduced scroll when the share would be a sliver", () => {
    // 9 visible in a 1192px pane → 107px shares read as "the table shrank".
    const { widths, tableMin } = colTargets(9, 14, 1192, 220);
    expect(widths.get(3)).toBe(204);
    expect(widths.get(11)).toBe(204);
    expect(widths.get(12)).toBe(4);
    expect(tableMin).toBe(228 + 9 * 204);
  });

  it("fills the pane with sub-native shares as long as they stay usable", () => {
    // 8 visible in a 1483px pane → 156px shares fill (tracks 3..10).
    const { widths, tableMin } = colTargets(8, 14, 1483, 220);
    expect(widths.get(3)).toBe(156);
    expect(widths.get(10)).toBe(1255 - 156 * 7); // remainder → 163
    expect(widths.get(11)).toBe(4);
    expect(tableMin).toBe(1483);
  });

  it("is empty for degenerate input", () => {
    expect(colTargets(0, 8, 1000, 220).widths.size).toBe(0);
    expect(colTargets(1, 8, 0, 220).widths.size).toBe(0);
  });
});

describe("taskboardTeamKey", () => {
  it("builds org/project/team from a sprints path", () => {
    expect(
      taskboardTeamKey(
        "/Akademikernes/AI%20og%20DT/_sprints/taskboard/AI%20og%20DT%20Team/AI%20og%20DT/Sprint%2008-26"
      )
    ).toBe("Akademikernes/AI og DT/AI og DT Team");
  });

  it("is iteration-independent", () => {
    expect(taskboardTeamKey("/o/p/_sprints/taskboard/Team/It1")).toBe(
      taskboardTeamKey("/o/p/_sprints/taskboard/Team/It2")
    );
  });

  it("returns null off the sprints hub", () => {
    expect(taskboardTeamKey("/o/p/_backlogs/backlog/Team/Epics")).toBeNull();
  });
});
