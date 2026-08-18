import { describe, expect, it } from "vitest";
import { sprintScopeKey, sprintTab } from "./sprint-header";

describe("sprintTab", () => {
  it("extracts the tab segment after _sprints", () => {
    expect(sprintTab("/org/proj/_sprints/taskboard/Team/Iter")).toBe("taskboard");
    expect(sprintTab("/org/proj/_sprints/backlog/Team/Iter/Sprint%2008")).toBe("backlog");
    expect(sprintTab("/org/proj/_sprints/capacity/Team/Iter")).toBe("capacity");
  });

  it("lowercases the segment", () => {
    expect(sprintTab("/o/p/_sprints/Taskboard/t/i")).toBe("taskboard");
  });

  it("returns null off the sprints hub or without a tab", () => {
    expect(sprintTab("/o/p/_backlogs/backlog/Team/Epics")).toBeNull();
    expect(sprintTab("/o/p/_sprints")).toBeNull();
  });
});

describe("sprintScopeKey", () => {
  it("decodes the full path so each tab+team+iteration remembers its own total", () => {
    expect(
      sprintScopeKey("/Akademikernes/AI%20og%20DT/_sprints/taskboard/AI%20og%20DT%20Team/AI%20og%20DT/Sprint%2008-26")
    ).toBe("Akademikernes/AI og DT/_sprints/taskboard/AI og DT Team/AI og DT/Sprint 08-26");
  });

  it("returns null off the sprints hub", () => {
    expect(sprintScopeKey("/o/p/_backlogs/backlog/Team/Epics")).toBeNull();
  });
});
