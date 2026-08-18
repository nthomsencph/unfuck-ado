import { beforeEach, describe, expect, it } from "vitest";
import type { Route } from "../../core/router";
import { draftKey, loadDrafts, newDraftId, saveDrafts, type Draft } from "./drafts-store";

const prRoute: Route = {
  org: "myorg",
  project: "My Project",
  repo: "my-repo",
  area: "repos-pr",
  id: "99",
  path: "/myorg/My Project/_git/my-repo/pullrequest/99",
};

describe("draftKey", () => {
  it("keys a concrete PR as org/project/repo/id", () => {
    expect(draftKey(prRoute)).toBe("myorg/My Project/my-repo/99");
  });

  it("is null off PR routes or without a PR id", () => {
    expect(draftKey({ ...prRoute, area: "boards" })).toBeNull();
    expect(draftKey({ ...prRoute, id: null })).toBeNull();
    expect(draftKey({ ...prRoute, repo: null })).toBeNull();
  });
});

describe("draft persistence", () => {
  beforeEach(() => localStorage.clear());

  const draft: Draft = { id: "d-1", filePath: "/a.py", line: 3, side: "right", content: "hi" };

  it("round-trips drafts per PR key", () => {
    saveDrafts("k1", [draft]);
    expect(loadDrafts("k1")).toEqual([draft]);
    expect(loadDrafts("k2")).toEqual([]);
  });

  it("generates distinct draft ids", () => {
    expect(newDraftId()).not.toBe(newDraftId());
  });
});
