import { describe, expect, it } from "vitest";
import { buildTreePaths, buildWindowedPaths } from "./reviewed-tree";

describe("buildTreePaths", () => {
  it("joins nested levels into paths", () => {
    expect(
      buildTreePaths([
        { level: 1, name: ".azure-pipelines" },
        { level: 2, name: "templates" },
        { level: 3, name: "stages" },
        { level: 4, name: "production.yml" },
      ])
    ).toEqual([
      "/.azure-pipelines",
      "/.azure-pipelines/templates",
      "/.azure-pipelines/templates/stages",
      "/.azure-pipelines/templates/stages/production.yml",
    ]);
  });

  it("pops back up when the level drops", () => {
    expect(
      buildTreePaths([
        { level: 1, name: "backend" },
        { level: 2, name: "app" },
        { level: 3, name: "main.py" },
        { level: 2, name: "tests" },
        { level: 3, name: "test_main.py" },
        { level: 1, name: "README.md" },
      ])
    ).toEqual([
      "/backend",
      "/backend/app",
      "/backend/app/main.py",
      "/backend/tests",
      "/backend/tests/test_main.py",
      "/README.md",
    ]);
  });

  it("keeps compressed folder chains as one segment", () => {
    // ADO renders single-child chains as one row: ".claude/skills/docs".
    expect(
      buildTreePaths([
        { level: 1, name: ".claude/skills/docs" },
        { level: 2, name: "SKILL.md" },
      ])
    ).toEqual(["/.claude/skills/docs", "/.claude/skills/docs/SKILL.md"]);
  });

  it("siblings at the same level replace each other", () => {
    expect(
      buildTreePaths([
        { level: 1, name: "a.txt" },
        { level: 1, name: "b.txt" },
      ])
    ).toEqual(["/a.txt", "/b.txt"]);
  });

  it("clamps a malformed level jump instead of emitting empty segments", () => {
    expect(
      buildTreePaths([
        { level: 1, name: "src" },
        { level: 4, name: "deep.ts" },
      ])
    ).toEqual(["/src", "/src/deep.ts"]);
  });
});

describe("buildWindowedPaths", () => {
  it("resolves a contiguous window that starts at the tree top", () => {
    expect(
      buildWindowedPaths([
        { index: 0, level: 1, name: "src" },
        { index: 1, level: 2, name: "a.ts" },
      ])
    ).toEqual(["/src", "/src/a.ts"]);
  });

  it("refuses paths for a window that starts mid-tree", () => {
    // Virtualized away: the ancestors of these rows are not rendered.
    expect(
      buildWindowedPaths([
        { index: 40, level: 3, name: "deep.py" },
        { index: 41, level: 3, name: "deeper.py" },
      ])
    ).toEqual([null, null]);
  });

  it("re-anchors at a root-level row after a gap", () => {
    expect(
      buildWindowedPaths([
        { index: 40, level: 3, name: "lost.py" },
        { index: 41, level: 1, name: "docs" },
        { index: 42, level: 2, name: "readme.md" },
      ])
    ).toEqual([null, "/docs", "/docs/readme.md"]);
  });

  it("invalidates across an index gap even at the same level", () => {
    expect(
      buildWindowedPaths([
        { index: 0, level: 1, name: "src" },
        { index: 1, level: 2, name: "a.ts" },
        { index: 9, level: 2, name: "z.ts" },
      ])
    ).toEqual(["/src", "/src/a.ts", null]);
  });
});
