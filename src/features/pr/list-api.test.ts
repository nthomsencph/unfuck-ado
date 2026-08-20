import { describe, expect, it } from "vitest";
import { ownershipMap, type ListPr } from "./list-api";

const ME = "my-guid";

function pr(id: number, authorId: string, reviewers: ListPr["reviewers"] = []): ListPr {
  return { pullRequestId: id, createdBy: { id: authorId }, reviewers };
}

describe("ownershipMap", () => {
  it("tags authored PRs as author", () => {
    const map = ownershipMap([pr(1, ME)], ME);
    expect(map.get(1)).toBe("author");
  });

  it("tags PRs the user reviews as reviewer", () => {
    const map = ownershipMap([pr(2, "other", [{ id: ME, vote: 0 }])], ME);
    expect(map.get(2)).toBe("reviewer");
  });

  it("author wins when the user is both author and reviewer", () => {
    const map = ownershipMap([pr(3, ME, [{ id: ME, vote: 0 }])], ME);
    expect(map.get(3)).toBe("author");
  });

  it("skips container and declined reviewer entries", () => {
    const map = ownershipMap(
      [
        pr(4, "other", [{ id: ME, vote: 0, isContainer: true }]),
        pr(5, "other", [{ id: ME, vote: 0, hasDeclined: true }]),
      ],
      ME
    );
    expect(map.size).toBe(0);
  });

  it("omits unrelated PRs entirely", () => {
    const map = ownershipMap([pr(6, "other", [{ id: "someone", vote: 10 }])], ME);
    expect(map.has(6)).toBe(false);
  });
});
