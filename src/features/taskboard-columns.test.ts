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
  it("pins borders, zeroes hidden, shares the rest in pixels summing to the container", () => {
    // 14 cols, container 1616, parent 220: 4 + 220 + 4×347 + 4 = 1616.
    const { widths, tableMin } = colTargets([7, 8, 9, 10, 11, 12, 13], [3, 4, 5, 6], 14, 1616, 220);
    expect(widths.get(1)).toBe(4);
    expect(widths.get(14)).toBe(4);
    expect(widths.get(7)).toBe(0);
    expect(widths.get(3)).toBe(347);
    const total = 220 + [...widths.values()].reduce((a, w) => a + w, 0);
    expect(total).toBe(1616);
    expect(tableMin).toBe(1616);
  });

  it("gives the rounding remainder to the last visible column", () => {
    const { widths } = colTargets([3], [4, 5, 6], 8, 1030, 220);
    // avail = 1030 - 228 = 802 → 267 + 267 + 268
    expect(widths.get(4)).toBe(267);
    expect(widths.get(6)).toBe(268);
  });

  it("floors columns at their native width and accepts reduced scroll", () => {
    // The Firefox report: 9 visible in a 1192px pane would mean 107px
    // columns — half native. Floor at 204 instead, table = 228 + 9×204.
    const { widths, tableMin } = colTargets(
      [9, 10],
      [3, 4, 5, 6, 7, 8, 11, 12, 13],
      14,
      1192,
      220
    );
    expect(widths.get(3)).toBe(204);
    expect(widths.get(13)).toBe(204);
    expect(tableMin).toBe(228 + 9 * 204);
  });

  it("is empty for degenerate input", () => {
    expect(colTargets([3], [], 8, 1000, 220).widths.size).toBe(0);
    expect(colTargets([3], [4], 8, 0, 220).widths.size).toBe(0);
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
