import { afterEach, describe, expect, it } from "vitest";
import {
  composerAnchor,
  findFooterCancel,
  lineFromOverlayText,
  lineLabel,
  monacoAnchorLine,
  nearestLineAbove,
  rowInfo,
  selectionStackedRange,
  splitPath,
} from "./pr-drafts";
import { sectionFilePath } from "./pr/diff";

/** Mirrors the live stacked-view structure verified 2026-08-01. */
function makeSection(path: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "repos-summary-header";
  const pathEl = document.createElement("span");
  pathEl.className = "secondary-text";
  pathEl.textContent = path;
  section.appendChild(pathEl);
  document.body.appendChild(section);
  return section;
}

function makeRow(
  section: HTMLElement,
  opts: { line?: string; kind: "added" | "removed" | "unchanged" }
): HTMLElement {
  const row = document.createElement("div");
  row.className = "repos-diff-contents-row monospaced-text";
  for (const text of [opts.line ?? "", ""]) {
    const num = document.createElement("span");
    num.className = "padding-horizontal-8 text-right secondary-text";
    num.textContent = text;
    row.appendChild(num);
  }
  const content = document.createElement("span");
  content.className = `repos-line-content ${opts.kind}`;
  content.textContent = "code";
  row.appendChild(content);
  section.appendChild(row);
  return row;
}

/** A bare composer row, as ADO inserts after the commented line. */
function makeComposerRow(section: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "repos-diff-contents-row";
  section.appendChild(row);
  return row;
}

describe("lineFromOverlayText", () => {
  it("parses plain gutter numbers", () => {
    expect(lineFromOverlayText("36")).toBe(36);
  });

  it("tolerates trailing non-digits", () => {
    expect(lineFromOverlayText("36+")).toBe(36);
  });

  it("returns null for non-numbers", () => {
    expect(lineFromOverlayText("+")).toBeNull();
    expect(lineFromOverlayText("")).toBeNull();
    expect(lineFromOverlayText(null)).toBeNull();
  });
});

describe("splitPath", () => {
  it("splits directory and basename", () => {
    expect(splitPath("/backend/app/core/scheduler.py")).toEqual({
      dir: "/backend/app/core",
      base: "scheduler.py",
    });
  });

  it("keeps root-level files with an empty dir", () => {
    expect(splitPath("/README.md")).toEqual({ dir: "", base: "README.md" });
  });

  it("passes bare names through", () => {
    expect(splitPath("README.md")).toEqual({ dir: "", base: "README.md" });
  });
});

describe("lineLabel", () => {
  it("labels single lines", () => {
    expect(lineLabel(97)).toBe("L97");
  });

  it("labels ranges", () => {
    expect(lineLabel(10, 12)).toBe("L10–12");
  });
});

describe("rowInfo", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads line, right side and file path from an added row", () => {
    const section = makeSection("/backend/app/core/scheduler.py");
    const row = makeRow(section, { line: "39", kind: "added" });
    expect(rowInfo(row)).toEqual({
      line: 39,
      side: "right",
      filePath: "/backend/app/core/scheduler.py",
    });
  });

  it("maps removed rows to the left side", () => {
    const row = makeRow(makeSection("/a.py"), { line: "92", kind: "removed" });
    expect(rowInfo(row)?.side).toBe("left");
  });

  it("maps unchanged rows to the right side", () => {
    const row = makeRow(makeSection("/a.py"), { line: "36", kind: "unchanged" });
    expect(rowInfo(row)?.side).toBe("right");
  });

  it("returns null for rows without a line number", () => {
    const row = makeRow(makeSection("/a.py"), { kind: "added" });
    expect(rowInfo(row)).toBeNull();
  });

  it("returns null for rows outside a file section", () => {
    const row = document.createElement("div");
    row.className = "repos-diff-contents-row";
    const content = document.createElement("span");
    content.className = "repos-line-content added";
    row.appendChild(content);
    document.body.appendChild(row);
    expect(rowInfo(row)).toBeNull();
  });

  it("ignores line-number cells when hunting the section path", () => {
    const section = makeSection("/a.py");
    makeRow(section, { line: "12", kind: "added" });
    expect(sectionFilePath(section)).toBe("/a.py");
  });
});

describe("composerAnchor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("anchors to the diff row directly above the composer", () => {
    const section = makeSection("/a.py");
    makeRow(section, { line: "9", kind: "unchanged" });
    makeRow(section, { line: "10", kind: "added" });
    const composer = makeComposerRow(section);
    expect(composerAnchor(composer)).toEqual({ line: 10, side: "right", filePath: "/a.py" });
  });

  it("skips intervening non-line rows (rendered threads ride as rows too)", () => {
    const section = makeSection("/a.py");
    makeRow(section, { line: "7", kind: "removed" });
    const thread = document.createElement("div");
    thread.className = "repos-diff-contents-row";
    section.appendChild(thread);
    const composer = makeComposerRow(section);
    expect(composerAnchor(composer)).toEqual({ line: 7, side: "left", filePath: "/a.py" });
  });

  it("returns null when nothing above parses as a diff line", () => {
    const section = makeSection("/a.py");
    const composer = makeComposerRow(section);
    expect(composerAnchor(composer)).toBeNull();
  });
});

describe("nearestLineAbove", () => {
  const lines = [
    { line: 8, bottom: 376 },
    { line: 9, bottom: 394 },
    { line: 10, bottom: 412 },
  ];

  it("picks the closest gutter number ending above the composer", () => {
    // Live-measured geometry 2026-08-01: composer input top 438, line 10 bottom 412.
    expect(nearestLineAbove(lines, 438)).toBe(10);
  });

  it("tolerates a couple of px of overlap", () => {
    expect(nearestLineAbove(lines, 411)).toBe(10);
  });

  it("returns null when every line starts below", () => {
    expect(nearestLineAbove(lines, 100)).toBeNull();
  });

  it("returns null for no lines", () => {
    expect(nearestLineAbove([], 438)).toBeNull();
  });
});

describe("monacoAnchorLine", () => {
  const lines = [
    { line: 1, bottom: 286 },
    { line: 9, bottom: 430 },
  ];

  it("anchors to the nearest line above the composer", () => {
    // Live-measured 2026-08-19: settled composer top 382.5, line 9 bottom 356.5.
    expect(monacoAnchorLine(438, lines)).toEqual({ line: 9 });
  });

  it("treats a composer just above line 1 as the file-level composer", () => {
    // ADO renders the file-level composer directly above line 1.
    expect(monacoAnchorLine(100, lines)).toEqual({ fileLevel: true });
  });

  it("rejects a composer far above every line (unpositioned view zone)", () => {
    // Live-measured 2026-08-19: a fresh composer transiently reports top
    // ~-705 while line 1's bottom is 286 — anchoring it would silently
    // store a mis-anchored file-level draft.
    expect(monacoAnchorLine(-705, lines)).toBeNull();
  });

  it("returns null for no lines", () => {
    expect(monacoAnchorLine(438, [])).toBeNull();
  });
});

describe("findFooterCancel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** Mirrors the live composer structure verified 2026-08-01: the input sits
   *  several wrappers deep; the footer with Cancel/Comment is an ancestor's
   *  descendant. */
  function makeComposer(): { input: HTMLTextAreaElement; cancel: HTMLButtonElement } {
    const widget = document.createElement("div");
    widget.className = "repos-comment-editor-fit";
    const body = document.createElement("div");
    const wrap = document.createElement("div");
    const input = document.createElement("textarea");
    input.className = "threadId--1 bolt-textfield-input";
    wrap.appendChild(input);
    body.appendChild(wrap);
    widget.appendChild(body);
    const footer = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const comment = document.createElement("button");
    comment.textContent = "Comment";
    footer.append(cancel, comment);
    widget.appendChild(footer);
    document.body.appendChild(widget);
    return { input, cancel };
  }

  it("finds the Cancel button from the composer input", () => {
    const { input, cancel } = makeComposer();
    expect(findFooterCancel(input)).toBe(cancel);
  });

  it("returns null when there is no Cancel in reach", () => {
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    expect(findFooterCancel(input)).toBeNull();
  });
});

describe("selectionStackedRange", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  function select(fromRow: HTMLElement, toRow: HTMLElement): void {
    const range = document.createRange();
    range.setStart(fromRow.querySelector(".repos-line-content")!.firstChild!, 0);
    range.setEnd(toRow.querySelector(".repos-line-content")!.firstChild!, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it("derives file and range from a selection spanning rows", () => {
    const section = makeSection("/a.py");
    const first = makeRow(section, { line: "10", kind: "added" });
    makeRow(section, { line: "11", kind: "added" });
    const last = makeRow(section, { line: "12", kind: "added" });
    select(first, last);
    expect(selectionStackedRange()).toEqual({ filePath: "/a.py", start: 10, end: 12 });
  });

  it("returns null for a selection within one line", () => {
    const section = makeSection("/a.py");
    const only = makeRow(section, { line: "10", kind: "added" });
    select(only, only);
    expect(selectionStackedRange()).toBeNull();
  });

  it("returns null when the selection spans two files", () => {
    const a = makeRow(makeSection("/a.py"), { line: "10", kind: "added" });
    const b = makeRow(makeSection("/b.py"), { line: "3", kind: "added" });
    select(a, b);
    expect(selectionStackedRange()).toBeNull();
  });

  it("returns null with no selection", () => {
    makeRow(makeSection("/a.py"), { line: "10", kind: "added" });
    expect(selectionStackedRange()).toBeNull();
  });
});
