import { describe, expect, it } from "vitest";
import { changedPaths, myVote, voteLabel, type Reviewer } from "./reviewer-api";

describe("myVote", () => {
  const reviewers: Reviewer[] = [
    { id: "team-guid", vote: 0, isContainer: true },
    { id: "me-guid", vote: 10 },
    { id: "other-guid", vote: -5 },
  ];

  it("finds the user's individual vote", () => {
    expect(myVote(reviewers, "me-guid")).toBe(10);
  });

  it("returns null when not an assigned reviewer", () => {
    expect(myVote(reviewers, "stranger-guid")).toBeNull();
  });

  it("never matches container (group/team) entries", () => {
    expect(myVote(reviewers, "team-guid")).toBeNull();
  });

  it("treats a declined reviewer as not assigned", () => {
    // ADO's "Decline to review" keeps the entry, flagged (live 2026-08-19).
    expect(myVote([{ id: "me-guid", vote: 0, hasDeclined: true }], "me-guid")).toBeNull();
  });

  it("returns null without an identity", () => {
    expect(myVote(reviewers, null)).toBeNull();
  });
});

describe("voteLabel", () => {
  it("labels each cast vote", () => {
    expect(voteLabel(10)).toBe("Approved ✓");
    expect(voteLabel(5)).toBe("Approved · suggestions");
    expect(voteLabel(-5)).toBe("Waiting for author");
    expect(voteLabel(-10)).toBe("Rejected ✕");
  });

  it("returns null for no vote", () => {
    expect(voteLabel(0)).toBeNull();
  });
});

describe("changedPaths", () => {
  it("collects item paths, deletes via originalPath, and skips folders", () => {
    expect(
      changedPaths([
        { item: { path: "/a.py" } },
        { changeType: "delete", originalPath: "/gone.py" },
        { item: { path: "/dir", isFolder: true } },
        { changeType: "edit, rename", originalPath: "/old.py", item: { path: "/new.py" } },
        {},
      ])
    ).toEqual(new Set(["/a.py", "/gone.py", "/new.py"]));
  });
});
