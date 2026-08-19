import { safeQueryAll } from "../../core/dom";

/**
 * The PR Files tab's two diff renderers (both verified live 2026-08-01,
 * re-verified 2026-08-19) — the selector vocabulary shared by pr-drafts,
 * pr-reviewed and pr-review-flow:
 *
 * - "All changes" stacked view: a CSS table (div display:table, table-row
 *   rows, span table-cell cells) inside per-file .repos-summary-header cards.
 * - Single-file view (a file selected in the tree): a virtualized Monaco diff
 *   editor (.monaco-diff-editor).
 */
export const DIFF_SELECTORS = {
  /** Stacked view: one div-table row per diff line. Verified live 2026-08-01. */
  row: ".repos-diff-contents-row",
  /** Stacked view: line-number cells. Verified live 2026-08-01. */
  lineNumberCell: ".text-right.secondary-text",
  /** Stacked view: the code cell; added/removed/unchanged encodes the side. Verified live 2026-08-01. */
  lineContent: ".repos-line-content",
  /** Stacked view: per-file section card; a .secondary-text holds the path. Verified live 2026-08-01. */
  fileSection: ".repos-summary-header",
  /** Single-file view: the Monaco diff editor root. Verified live 2026-08-01. */
  monacoRoot: ".monaco-diff-editor",
  /** Single-file view: line-number overlays in the modified editor's gutter. Verified live 2026-08-01. */
  monacoLineNumber: ".monaco-diff-editor .editor.modified .line-numbers",
  /** Both views: elements that may carry the current file path ("/…"). Verified live 2026-08-01. */
  pathText: ".secondary-text",
  /** Present only when the Files tab is active. Verified live 2026-08-01. */
  filesView: ".repos-changes-viewer",
};

/** First "/"-prefixed text that is an actual path (breadcrumbs emit bare "/"). */
export function pickFilePath(texts: Array<string | null | undefined>): string | null {
  return (
    texts
      .map((t) => (t ?? "").trim())
      .find((t) => t.startsWith("/") && t.length > 1) ?? null
  );
}

/** A stacked per-file section's repo path, read off its header. */
export function sectionFilePath(section: HTMLElement): string | null {
  return pickFilePath(
    safeQueryAll<HTMLElement>(DIFF_SELECTORS.pathText, section).map((e) => e.textContent)
  );
}

/** Single-file (Monaco) view: the open file's path from the breadcrumb. */
export function currentFilePath(): string | null {
  return pickFilePath(
    safeQueryAll<HTMLElement>(DIFF_SELECTORS.pathText).map((e) => e.textContent)
  );
}
