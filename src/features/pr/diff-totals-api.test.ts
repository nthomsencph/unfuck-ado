import { describe, expect, it } from "vitest";
import {
  buildFileDiffParams,
  chunked,
  formatLineCount,
  scopedTotals,
  sumLineDiffBlocks,
  type ChangeEntry,
  type FileDiff,
} from "./diff-totals-api";

describe("buildFileDiffParams", () => {
  it("sends originalPath for edits so the original side is not empty", () => {
    const entries: ChangeEntry[] = [{ changeType: "edit", item: { path: "/a.yml" } }];
    expect(buildFileDiffParams(entries)).toEqual([{ path: "/a.yml", originalPath: "/a.yml" }]);
  });

  it("omits originalPath for adds", () => {
    const entries: ChangeEntry[] = [{ changeType: "add", item: { path: "/new.py" } }];
    expect(buildFileDiffParams(entries)).toEqual([{ path: "/new.py" }]);
  });

  it("uses the pre-rename path for renames", () => {
    const entries: ChangeEntry[] = [
      {
        changeType: "edit, rename",
        originalPath: "/old/TeamDialog.tsx",
        item: { path: "/new/GroupDialog.tsx" },
      },
    ];
    expect(buildFileDiffParams(entries)).toEqual([
      { path: "/new/GroupDialog.tsx", originalPath: "/old/TeamDialog.tsx" },
    ]);
  });

  it("keeps deletes with their own path on the original side", () => {
    const entries: ChangeEntry[] = [{ changeType: "delete", item: { path: "/gone.py" } }];
    expect(buildFileDiffParams(entries)).toEqual([{ path: "/gone.py", originalPath: "/gone.py" }]);
  });

  it("skips folders and pathless entries", () => {
    const entries: ChangeEntry[] = [
      { changeType: "edit", item: { path: "/dir", isFolder: true } },
      { changeType: "edit", item: {} },
      { changeType: "edit" },
    ];
    expect(buildFileDiffParams(entries)).toEqual([]);
  });
});

describe("sumLineDiffBlocks", () => {
  it("counts edit blocks on both sides, add/delete on one", () => {
    // Real shape from PR 6982's seed-database.yml: UI shows -20+13.
    const files: FileDiff[] = [
      {
        path: "/seed-database.yml",
        lineDiffBlocks: [
          { changeType: "none", originalLinesCount: 12, modifiedLinesCount: 12 },
          { changeType: "edit", originalLinesCount: 5, modifiedLinesCount: 6 },
          { changeType: "edit", originalLinesCount: 2, modifiedLinesCount: 6 },
          { changeType: "edit", originalLinesCount: 2, modifiedLinesCount: 1 },
          { changeType: "delete", originalLinesCount: 10, modifiedLinesCount: 0 },
          { changeType: "delete", originalLinesCount: 1, modifiedLinesCount: 0 },
        ],
      },
      {
        path: "/added.py",
        lineDiffBlocks: [{ changeType: "add", originalLinesCount: 0, modifiedLinesCount: 45 }],
      },
    ];
    expect(sumLineDiffBlocks(files)).toEqual({ adds: 58, dels: 20 });
  });

  it("treats binary files (no blocks) as zero", () => {
    expect(sumLineDiffBlocks([{ path: "/img.png" }])).toEqual({ adds: 0, dels: 0 });
  });
});

describe("scopedTotals", () => {
  const files = [
    { path: "/backend/app/main.py", adds: 10, dels: 2 },
    { path: "/backend/app/services/flows/runner.py", adds: 100, dels: 50 },
    { path: "/backend/tests/test_main.py", adds: 5, dels: 1 },
    { path: "/frontend/src/App.tsx", adds: 7, dels: 3 },
  ];

  it("sums everything when unscoped", () => {
    expect(scopedTotals(files, null)).toEqual({ adds: 122, dels: 56 });
    expect(scopedTotals(files, undefined)).toEqual({ adds: 122, dels: 56 });
    expect(scopedTotals(files, "")).toEqual({ adds: 122, dels: 56 });
  });

  it("sums only files under a folder scope", () => {
    expect(scopedTotals(files, "/backend/app")).toEqual({ adds: 110, dels: 52 });
    expect(scopedTotals(files, "/frontend")).toEqual({ adds: 7, dels: 3 });
  });

  it("matches a single-file scope exactly", () => {
    expect(scopedTotals(files, "/backend/app/main.py")).toEqual({ adds: 10, dels: 2 });
  });

  it("does not treat a path-prefix sibling as inside the scope", () => {
    // "/backend/app2" must not match "/backend/app" files.
    expect(scopedTotals([{ path: "/backend/app2/x.py", adds: 1, dels: 1 }], "/backend/app")).toEqual(
      { adds: 0, dels: 0 }
    );
  });
});

describe("formatLineCount", () => {
  it("keeps sub-thousand counts verbatim", () => {
    expect(formatLineCount(0)).toBe("0");
    expect(formatLineCount(842)).toBe("842");
    expect(formatLineCount(999)).toBe("999");
  });

  it("abbreviates thousands to one decimal", () => {
    expect(formatLineCount(1000)).toBe("1k");
    expect(formatLineCount(18255)).toBe("18.3k");
    expect(formatLineCount(20105)).toBe("20.1k");
    expect(formatLineCount(20999)).toBe("21k");
  });

  it("drops the decimal at 100k and up", () => {
    expect(formatLineCount(123456)).toBe("123k");
  });
});

describe("chunked", () => {
  it("splits into fixed-size batches with a short tail", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunked([], 100)).toEqual([]);
  });
});
