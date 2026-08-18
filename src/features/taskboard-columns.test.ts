import { describe, expect, it } from "vitest";
import { columnCss, stateColumns, taskboardTeamKey } from "./taskboard-columns";

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
  it("hides cells and tracks, shares width among the visible, kills the min-width", () => {
    const css = columnCss([12, 13], [3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(css).toContain("tr > :nth-child(12)");
    expect(css).toContain("col:nth-child(13)");
    expect(css).toContain("width: auto !important");
    expect(css).toContain("min-width: 0 !important");
    // The 0%-width border cols must be pinned: fixed layout treats 0% as
    // auto and would hand them a full share of the freed width.
    expect(css).toContain("col:first-child");
  });

  it("emits nothing when no columns are hidden (native layout preserved)", () => {
    expect(columnCss([], [3, 4, 5])).toBe("");
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
