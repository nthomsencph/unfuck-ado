import { describe, expect, it } from "vitest";
import { backlogScopeKey, sprintScopeKey, sprintTab, taskboardTeamKey } from "./paths";

describe("backlogScopeKey", () => {
  it("builds org/project/team/level from a backlog path", () => {
    expect(
      backlogScopeKey("/Akademikernes/AI%20og%20DT/_backlogs/backlog/AI%20og%20DT%20Team/Epics")
    ).toBe("Akademikernes/AI og DT/AI og DT Team/Epics");
  });

  it("keeps the key stable across deeper backlog sub-paths", () => {
    expect(backlogScopeKey("/o/p/_backlogs/backlog/Team/Stories/whatever")).toBe("o/p/Team/Stories");
  });

  it("returns null for non-backlog paths", () => {
    expect(backlogScopeKey("/o/p/_boards/board/t/Team/Epics")).toBeNull();
    expect(backlogScopeKey("/o/p/_backlogs/backlog/TeamOnly")).toBeNull();
  });
});

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
      sprintScopeKey(
        "/Akademikernes/AI%20og%20DT/_sprints/taskboard/AI%20og%20DT%20Team/AI%20og%20DT/Sprint%2008-26"
      )
    ).toBe("Akademikernes/AI og DT/_sprints/taskboard/AI og DT Team/AI og DT/Sprint 08-26");
  });

  it("returns null off the sprints hub", () => {
    expect(sprintScopeKey("/o/p/_backlogs/backlog/Team/Epics")).toBeNull();
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
