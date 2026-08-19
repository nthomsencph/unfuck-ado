import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { ACCENT, flashOutline, injectStyleOnce, safeQuery, safeQueryAll, showToast } from "../core/dom";
import { waitFor } from "../core/observe";
import { log } from "../core/log";
import { createThread, prRefFromRoute, type PrRef } from "./pr/threads-api";
import { draftKey, loadDrafts, newDraftId, saveDrafts, type Draft } from "./pr/drafts-store";
import { currentFilePath, DIFF_SELECTORS, sectionFilePath } from "./pr/diff";
import { findDiffEditor, type MonacoEditor, type ViewZone } from "./pr/monaco";
import { clickTreeFileRow, mapTreeFiles, TREE_SELECTORS } from "./pr/reviewed-tree";

/** ADO's native comment composer (all verified live 2026-08-01). */
export const COMPOSER_SELECTORS = {
  /**
   * The composer input of an UNSAVED thread: ADO assigns negative thread ids
   * (-1, -2, … per widget opened), so the class reads "threadId--<n>" — the
   * double dash distinguishes new threads from reply inputs on existing
   * threads ("threadId-<id>").
   */
  input: 'textarea[class*="threadId--"]',
  /** The input's invisible auto-size twin — same classes plus this one. Never target it. */
  mirrorClass: "bolt-textfield-auto-adjust-hidden",
  /** Wrapper around the composer body (shared with reply composers). */
  widgetWrap: ".repos-discussion-thread-reply",
  /** Stacked view's per-line "Add comment" gutter affordance. */
  stackedAffordance: ".repos-add-comment-widget",
  /** Monaco view's hover-following gutter affordance. */
  monacoAffordance: ".repos-add-comment-button",
};

/**
 * Whole-file comments: ADO's only native entry is the file tree row's "⋯ →
 * Add comment", which navigates to the single-file view and opens a
 * file-level composer above line 1. Our header button drives exactly that
 * chain — the header's own View link first, because the tree is virtualized
 * and only the single-file view guarantees the file's row is rendered AND
 * selected. All verified live 2026-08-01. Menu texts are English-UI.
 */
export const FILE_COMMENT_SELECTORS = {
  /** Per-file header's native "View" link (navigates to the single-file view). */
  viewLink: ".justify-end a.bolt-link-button",
  /** The single-file view auto-selects its tree row. */
  selectedTreeRow: '.bolt-tree-row[aria-selected="true"], .bolt-tree-row.selected',
  contextMenu: ".bolt-contextual-menu",
};

const FEATURE_ID = "pr-drafts";
const CARD_ID_ATTR = "data-adofix-draft-id";

/*
 * Design language (worked out live against ADO dark, 2026-08-01): every
 * surface is native ADO material — its own CSS variables for background,
 * hairlines and text, so both themes work — and the accent is confined to
 * one motif: a 3px left "unsent ink" spine plus small purple markers.
 * --adofix-ink mixes the accent toward the theme's text color so accent
 * TEXT stays readable on both dark and light surfaces.
 */
const DRAFTS_CSS = `
/* The panel gets --adofix-ink from .adofix-surface; these are inline (non-
   surface) hosts that need it too. */
.adofix-draft-card, .adofix-draft-capture, .adofix-file-comment, .adofix-tree-draft-item {
  --adofix-ink: color-mix(in srgb, ${ACCENT} 62%, var(--text-primary-color, #201f1e));
}

/* -- "Comment on file" icon button in the per-file header ----------------- */
.adofix-file-comment {
  border: none; background: transparent;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.7));
  font-size: 14px; padding: 4px 8px; border-radius: 2px;
  margin-right: 8px; cursor: pointer; line-height: 1;
  display: inline-flex; align-items: center;
}
.adofix-file-comment:hover {
  background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.05));
  color: var(--adofix-ink);
}

/* file-level draft cards sit inside the section, under its header row */
.adofix-file-draft { margin: 4px 12px 6px; }

/* -- "Comment as draft" button inside ADO's composer footer -------------- */
.adofix-draft-capture {
  border: none; background: rgba(130, 80, 223, 0.15); color: var(--adofix-ink);
  font-weight: 600; font-size: 14px; padding: 6px 14px; border-radius: 2px;
  margin-right: 8px; cursor: pointer; font-family: inherit;
}
.adofix-draft-capture:hover { background: rgba(130, 80, 223, 0.28); }

/* -- inline cards (stacked view only) ----------------------------------- */
.adofix-draft-card {
  display: block; max-width: 640px; margin: 6px 0;
  position: relative; z-index: 1; /* above the row's own decorations */
  background: var(--callout-background-color, #fff);
  border: 1px solid var(--border-subtle-color, rgba(0, 0, 0, 0.08));
  border-left: 3px solid ${ACCENT};
  border-radius: 4px; padding: 8px 12px 10px;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 13px; line-height: 1.45; white-space: normal;
  color: var(--text-primary-color, #201f1e);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.adofix-draft-head { display: flex; align-items: baseline; gap: 8px; }
.adofix-draft-chip {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--adofix-ink); text-transform: uppercase;
}
.adofix-draft-loc {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.7));
}
.adofix-draft-card .adofix-draft-actions { opacity: 0; transition: opacity 0.12s; }
.adofix-draft-card:hover .adofix-draft-actions,
.adofix-draft-card:focus-within .adofix-draft-actions,
.adofix-draft-card:has(.adofix-draft-inline-ta) .adofix-draft-actions,
.adofix-draft-item:has(.adofix-draft-inline-ta) .adofix-draft-actions { opacity: 1; }
.adofix-draft-card-content { white-space: pre-wrap; margin-top: 4px; }

/* -- quiet + primary buttons --------------------------------------------- */
.adofix-draft-actions { display: flex; gap: 2px; align-items: center; margin-left: auto; }
.adofix-draft-btn {
  border: none; background: transparent;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.7));
  border-radius: 2px; padding: 2px 8px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.adofix-draft-btn:hover {
  background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.05));
  color: var(--adofix-ink);
}
.adofix-draft-btn.adofix-primary { background: ${ACCENT}; color: #fff; padding: 4px 12px; }
.adofix-draft-btn.adofix-primary:hover { background: #9161ea; color: #fff; }
.adofix-draft-inline-ta {
  width: 100%; min-height: 70px; box-sizing: border-box;
  font-family: inherit; font-size: 13px; line-height: 1.45;
  margin-top: 6px; border: 1px solid var(--palette-black-alpha-10, rgba(0, 0, 0, 0.2));
  border-radius: 2px; padding: 6px 8px;
  background: rgba(0, 0, 0, 0.18); color: var(--text-primary-color, inherit);
}
.adofix-draft-inline-ta:focus { outline: none; border-color: ${ACCENT}; }

/* -- drafts panel --------------------------------------------------------- */
/* Surface material comes from .adofix-surface (core BASE_CSS). */
.adofix-drafts-panel {
  position: fixed; top: 120px; right: 24px; width: 380px; max-height: 70vh;
  display: flex; flex-direction: column; overflow: hidden; z-index: 99999;
  font-size: 13px;
}
.adofix-drafts-panel-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px;
  font-size: 14px; font-weight: 600;
  border-bottom: 1px solid var(--border-subtle-color, rgba(0, 0, 0, 0.08));
}
.adofix-count-pill {
  background: rgba(130, 80, 223, 0.22); color: var(--adofix-ink);
  font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 10px;
}
.adofix-panel-close { margin-left: auto; font-size: 14px; padding: 2px 7px; }
.adofix-drafts-panel-body { overflow-y: auto; flex: 1; }
.adofix-draft-item { padding: 9px 14px 11px 11px; border-left: 3px solid transparent; }
.adofix-draft-item + .adofix-draft-item {
  border-top: 1px solid var(--border-subtle-color, rgba(0, 0, 0, 0.08));
}
.adofix-draft-item:hover {
  background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.04));
  border-left-color: ${ACCENT};
}
.adofix-draft-item-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.adofix-draft-file {
  font-weight: 600; font-size: 12.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.adofix-draft-lines {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px;
  color: var(--adofix-ink); flex-shrink: 0;
}
.adofix-draft-item-name .adofix-draft-actions { opacity: 0; transition: opacity 0.12s; }
.adofix-draft-item:hover .adofix-draft-actions,
.adofix-draft-item:focus-within .adofix-draft-actions { opacity: 1; }
.adofix-draft-dir {
  font-size: 11px; color: var(--text-secondary-color, rgba(0, 0, 0, 0.6)); opacity: 0.75;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
}
.adofix-draft-item-text {
  white-space: pre-wrap; margin-top: 5px; font-size: 12.5px; line-height: 1.5;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.75));
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.adofix-drafts-panel-foot {
  padding: 10px 12px;
  border-top: 1px solid var(--border-subtle-color, rgba(0, 0, 0, 0.08));
}
.adofix-send { width: 100%; padding: 7px 12px; font-size: 13px; }

/* -- view-zone cards (single-file Monaco view) --------------------------- */
/* Zones render under .view-lines without a z-index (verified 2026-08-19). */
.adofix-zone-wrap { z-index: 10; }
.adofix-zone-card { margin: 3px 12px 3px 4px; }

/* -- draft rows in the file tree ----------------------------------------- */
.adofix-tree-draft { cursor: pointer; }
.adofix-tree-draft:hover { background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.05)); }
.adofix-tree-draft-item { gap: 4px; }
.adofix-tree-draft-icon { color: var(--adofix-ink); font-size: 12px; flex-shrink: 0; }
.adofix-tree-draft-text {
  font-size: 12px;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.7));
}

/* -- drafted-line gutter markers (Monaco view) --------------------------- */
.line-numbers.adofix-has-draft { color: ${ACCENT} !important; font-weight: 700; }
.line-numbers.adofix-has-draft::after {
  content: "\\25CF"; font-size: 7px; margin-left: 2px; vertical-align: middle;
}
`;

export interface RowInfo {
  line: number;
  side: "left" | "right";
  filePath: string;
}

/** A capture target: a diff line, or the whole file (line 0). */
export interface DraftAnchor extends RowInfo {
  fileLevel?: boolean;
}

export interface StackedRange {
  filePath: string;
  start: number;
  end: number;
}

/** Stacked view only: where in the diff a table row sits. Null → not a code line. */
export function rowInfo(row: HTMLElement): RowInfo | null {
  const content = safeQuery<HTMLElement>(DIFF_SELECTORS.lineContent, row);
  if (!content) return null;
  const numText = safeQueryAll<HTMLElement>(DIFF_SELECTORS.lineNumberCell, row)
    .map((c) => c.textContent?.trim() ?? "")
    .find((t) => /^\d+$/.test(t));
  if (!numText) return null;
  const section = row.closest<HTMLElement>(DIFF_SELECTORS.fileSection);
  if (!section) return null;
  const filePath = sectionFilePath(section);
  if (!filePath) return null;
  const side = content.classList.contains("removed") ? ("left" as const) : ("right" as const);
  return { line: Number(numText), side, filePath };
}

// Feature-owned state (per the spec: features keep state behind their module).
let currentKey: string | null = null;
let currentRef: PrRef | null = null;
let panelOpen = false;
let confirmArmed = false;
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
let gestureTrackingInstalled = false;

/** "36" -> 36. */
export function lineFromOverlayText(text: string | null | undefined): number | null {
  const match = /\d+/.exec(text ?? "");
  return match ? Number(match[0]) : null;
}

/** "/a/b/c.py" -> { dir: "/a/b", base: "c.py" }; bare names keep dir "". */
export function splitPath(filePath: string): { dir: string; base: string } {
  const i = filePath.lastIndexOf("/");
  return i < 0 ? { dir: "", base: filePath } : { dir: filePath.slice(0, i), base: filePath.slice(i + 1) };
}

/** "L12" or "L12–18" for range drafts. */
export function lineLabel(line: number, endLine?: number): string {
  return `L${line}${endLine !== undefined ? `–${endLine}` : ""}`;
}

/** Where a draft anchors, for chips and toasts: a line label or "File". */
function locLabel(draft: Pick<Draft, "line" | "endLine" | "fileLevel">): string {
  return draft.fileLevel ? "File" : lineLabel(draft.line, draft.endLine);
}

// ---- range gestures ---------------------------------------------------------
//
// Multi-line drafts keep the selection gesture: select lines in the diff, then
// open ADO's composer on a line inside the selection — the capture button
// stores the whole range. The two views need different tracking:
// - stacked: the native selection is snapshotted on mouseup (a later click on
//   the "Add comment" affordance collapses it before the composer opens).
// - Monaco: Monaco paints its own selection (getSelection() stays empty), so
//   a drag's start/end lines are tracked by Y-coordinate.

let dragStartLine: number | null = null;
let pendingMonacoRange: { start: number; end: number } | null = null;
let lastStackedRange: StackedRange | null = null;

/**
 * Mousedowns here must not disturb the captured gestures: clicks on the
 * affordances OPEN the composer the gesture is for, and clicks inside the
 * composer (typing, toolbar, our button) come after it.
 */
const GESTURE_GUARD =
  `${COMPOSER_SELECTORS.widgetWrap}, ${COMPOSER_SELECTORS.stackedAffordance}, ` +
  `${COMPOSER_SELECTORS.monacoAffordance}, .adofix-draft-capture`;

/** Stacked view: the current selection as file lines, if it spans rows. */
export function selectionStackedRange(): StackedRange | null {
  const sel = window.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return null;
  const rowOf = (node: Node): HTMLElement | null => {
    const el = node instanceof Element ? node : node.parentElement;
    return el?.closest<HTMLElement>(DIFF_SELECTORS.row) ?? null;
  };
  const anchorRow = rowOf(sel.anchorNode);
  const focusRow = rowOf(sel.focusNode);
  if (!anchorRow || !focusRow) return null;
  const a = rowInfo(anchorRow);
  const f = rowInfo(focusRow);
  if (!a || !f || a.filePath !== f.filePath) return null;
  const start = Math.min(a.line, f.line);
  const end = Math.max(a.line, f.line);
  if (start === end) return null;
  return { filePath: a.filePath, start, end };
}

function lineAtY(editorEl: HTMLElement, y: number): number | null {
  const overlay = safeQueryAll<HTMLElement>(DIFF_SELECTORS.monacoLineNumber, editorEl).find(
    (o) => {
      const r = o.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    }
  );
  return overlay ? lineFromOverlayText(overlay.textContent) : null;
}

function onGestureMouseDown(e: MouseEvent): void {
  if (!currentKey) return;
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(GESTURE_GUARD)) return;
  const editorEl = e.target.closest<HTMLElement>(DIFF_SELECTORS.monacoRoot);
  if (!editorEl) return;
  pendingMonacoRange = null; // a new gesture invalidates the previous drag
  dragStartLine = lineAtY(editorEl, e.clientY);
}

function onGestureMouseUp(e: MouseEvent): void {
  if (!currentKey) return;
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(GESTURE_GUARD)) return;
  lastStackedRange = selectionStackedRange();
  if (dragStartLine === null) return;
  const start = dragStartLine;
  dragStartLine = null;
  const editorEl = e.target.closest<HTMLElement>(DIFF_SELECTORS.monacoRoot);
  if (!editorEl) return;
  const end = lineAtY(editorEl, e.clientY);
  if (end === null || end === start) return;
  pendingMonacoRange = { start: Math.min(start, end), end: Math.max(start, end) };
}

function installGestureTracking(): void {
  if (gestureTrackingInstalled) return;
  gestureTrackingInstalled = true;
  document.addEventListener("mousedown", onGestureMouseDown, true);
  document.addEventListener("mouseup", onGestureMouseUp, true);
}

// ---- ADO's composer: adorn with a capture button ----------------------------

/**
 * The composer's footer, found from its input: the nearest ancestor holding a
 * "Cancel" button. Text-matched — ADO ships English UI here; revisit if the
 * client org ever localizes.
 */
export function findFooterCancel(input: HTMLElement): HTMLButtonElement | null {
  let ancestor = input.parentElement;
  for (let hops = 0; ancestor && hops < 12; hops++) {
    const cancel = [...ancestor.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Cancel"
    );
    if (cancel) return cancel;
    ancestor = ancestor.parentElement;
  }
  return null;
}

/**
 * Stacked view: the composer renders as its own table row directly after the
 * commented line. Rendered threads ride as rows too, so walk back to the
 * nearest row that still parses as a diff line.
 */
export function composerAnchor(composerRow: HTMLElement): RowInfo | null {
  let prev = composerRow.previousElementSibling;
  while (prev) {
    if (prev instanceof HTMLElement && prev.matches(DIFF_SELECTORS.row)) {
      const info = rowInfo(prev);
      if (info) return info;
    }
    prev = prev.previousElementSibling;
  }
  return null;
}

/**
 * Monaco view: the composer's view zone displaces all later lines downward,
 * so its anchor is simply the closest gutter number that ends above it.
 */
export function nearestLineAbove(
  lines: Array<{ line: number; bottom: number }>,
  top: number
): number | null {
  let best: { line: number; bottom: number } | null = null;
  for (const l of lines) {
    if (l.bottom <= top + 2 && (!best || l.bottom > best.bottom)) best = l;
  }
  return best?.line ?? null;
}

/**
 * A lineless composer within this gap of line 1 is the legit file-level
 * composer (ADO renders it directly above line 1, verified live 2026-08-01).
 * Farther than this and it's a NOT-YET-POSITIONED view zone: fresh composers
 * transiently measure ~700px above the viewport before Monaco lays the zone
 * out (seen live 2026-08-19) — anchoring one would silently store a
 * mis-anchored file-level draft.
 */
export const FILE_LEVEL_MAX_GAP = 300;

/** Where a Monaco composer at `top` anchors; null → geometry unusable. */
export function monacoAnchorLine(
  top: number,
  overlays: Array<{ line: number; bottom: number }>
): { line: number } | { fileLevel: true } | null {
  if (overlays.length === 0) return null;
  const line = nearestLineAbove(overlays, top);
  if (line !== null) return { line };
  const minBottom = Math.min(...overlays.map((o) => o.bottom));
  return minBottom - top <= FILE_LEVEL_MAX_GAP ? { fileLevel: true } : null;
}

function monacoComposerAnchor(input: HTMLElement): DraftAnchor | null {
  const filePath = currentFilePath();
  if (!filePath) return null;
  const top = input.getBoundingClientRect().top;
  const overlays = safeQueryAll<HTMLElement>(DIFF_SELECTORS.monacoLineNumber)
    .map((o) => ({
      line: lineFromOverlayText(o.textContent),
      bottom: o.getBoundingClientRect().bottom,
    }))
    .filter((o): o is { line: number; bottom: number } => o.line !== null);
  const anchor = monacoAnchorLine(top, overlays);
  if (anchor === null) return null;
  if ("fileLevel" in anchor) return { line: 0, side: "right", filePath, fileLevel: true };
  // Monaco gutter numbers are the modified (right) side; removed-line
  // anchoring in this view is not supported yet.
  return { line: anchor.line, side: "right", filePath };
}

function captureDraft(input: HTMLTextAreaElement, cancel: HTMLButtonElement): void {
  if (!currentKey) return;
  const content = input.value.trim();
  if (!content) {
    showToast("Write the comment first — then save it as a draft");
    return;
  }
  const composerRow = input.closest<HTMLElement>(DIFF_SELECTORS.row);
  const anchor: DraftAnchor | null = composerRow
    ? composerAnchor(composerRow)
    : monacoComposerAnchor(input);
  if (!anchor) {
    // Leave the composer open — the text stays safe in ADO's editor.
    showToast("Couldn't resolve a file and line for this draft");
    return;
  }
  const range = anchor.fileLevel
    ? null
    : composerRow
      ? lastStackedRange &&
        lastStackedRange.filePath === anchor.filePath &&
        anchor.line >= lastStackedRange.start &&
        anchor.line <= lastStackedRange.end
        ? lastStackedRange
        : null
      : pendingMonacoRange &&
          anchor.line >= pendingMonacoRange.start &&
          anchor.line <= pendingMonacoRange.end
        ? pendingMonacoRange
        : null;
  const start = range?.start ?? anchor.line;
  const endLine = range && range.end !== start ? range.end : undefined;

  const key = currentKey;
  const drafts = loadDrafts(key);
  const existing = drafts.find(
    (d) =>
      d.filePath === anchor.filePath &&
      d.line === start &&
      d.side === anchor.side &&
      !d.fileLevel === !anchor.fileLevel
  );
  if (existing) {
    existing.content = content;
    if (endLine === undefined) delete existing.endLine;
    else existing.endLine = endLine;
    safeQuery(`[${CARD_ID_ATTR}="${existing.id}"]`)?.remove();
  } else {
    drafts.push({
      id: newDraftId(),
      filePath: anchor.filePath,
      line: start,
      side: anchor.side,
      ...(endLine !== undefined ? { endLine } : {}),
      ...(anchor.fileLevel ? { fileLevel: true } : {}),
      content,
    });
  }
  saveDrafts(key, drafts);
  lastStackedRange = null;
  pendingMonacoRange = null;

  // Verified live 2026-08-01: Cancel with text closes without a discard prompt.
  cancel.click();

  renderDraftCards();
  markMonacoDraftLines();
  renderMonacoZoneCards();
  renderTreeDraftRows();
  updateToolbar();
  renderPanel();
  showToast(
    `Draft saved — ${splitPath(anchor.filePath).base} ${locLabel({ line: start, endLine, fileLevel: anchor.fileLevel })}`
  );
}

let fileCommentBusy = false;

/**
 * Drive ADO's native whole-file comment chain from a per-file header: View →
 * single-file view (its tree row is rendered and selected there, which the
 * virtualized tree can't promise in the stacked view) → the row's "More..."
 * menu → "Add comment" → ADO opens its file-level composer, which
 * adornComposers then picks up like any other.
 */
async function startFileComment(section: HTMLElement): Promise<void> {
  if (fileCommentBusy) return;
  fileCommentBusy = true;
  try {
    const targetBase = splitPath(sectionFilePath(section) ?? "").base;
    const view = safeQuery<HTMLAnchorElement>(FILE_COMMENT_SELECTORS.viewLink, section);
    if (!view) {
      showToast("Couldn't find this file's View button");
      return;
    }
    view.click();
    // Wait for the single-file view: stacked sections gone, Monaco up.
    const inFileView = await waitFor(() =>
      !safeQuery(DIFF_SELECTORS.fileSection) && safeQuery(DIFF_SELECTORS.monacoRoot)
        ? true
        : null
    );
    const row = inFileView
      ? await waitFor(() => {
          const r = safeQuery<HTMLElement>(FILE_COMMENT_SELECTORS.selectedTreeRow);
          return r && (r.textContent ?? "").includes(targetBase) ? r : null;
        })
      : null;
    const more = row
      ? [...row.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "More...")
      : null;
    if (!more) {
      showToast("Couldn't open the file menu — use the file tree's ⋯ menu instead");
      return;
    }
    more.click();
    const item = await waitFor(() => {
      const menu = safeQuery<HTMLElement>(FILE_COMMENT_SELECTORS.contextMenu);
      if (!menu) return null;
      return (
        [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], .bolt-list-row')].find((i) =>
          (i.textContent ?? "").trim().startsWith("Add comment")
        ) ?? null
      );
    }, 3000);
    if (!item) {
      showToast("Couldn't find “Add comment” in the file menu");
      return;
    }
    item.click();
  } finally {
    fileCommentBusy = false;
  }
}

/** Put a "Comment on file" button into every stacked per-file header. */
function adornFileHeaders(): number {
  let adorned = 0;
  for (const section of safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection)) {
    const host = safeQuery<HTMLElement>(".justify-end", section);
    if (!host || host.querySelector(".adofix-file-comment")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "adofix-file-comment";
    const icon = document.createElement("span");
    icon.className = "fabric-icon ms-Icon--CommentAdd";
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    btn.setAttribute("aria-label", "Comment on file");
    btn.title = "Comment on the whole file (ado-unfuck)";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      void startFileComment(section);
    });
    host.insertBefore(btn, host.firstChild);
    adorned++;
  }
  return adorned;
}

/** Put a "Comment as draft" button into every open composer that lacks one. */
function adornComposers(): number {
  let adorned = 0;
  for (const input of safeQueryAll<HTMLTextAreaElement>(COMPOSER_SELECTORS.input)) {
    if (input.classList.contains(COMPOSER_SELECTORS.mirrorClass)) continue;
    const cancel = findFooterCancel(input);
    const footer = cancel?.parentElement;
    if (!cancel || !footer) continue;
    if (footer.querySelector(".adofix-draft-capture")) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "adofix-draft-btn adofix-draft-capture";
    btn.textContent = "Comment as draft";
    btn.title = 'Save locally — nothing is posted until "Submit all" (ado-unfuck)';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      captureDraft(input, cancel);
    });
    footer.insertBefore(btn, cancel);
    adorned++;
  }
  return adorned;
}

// ---- draft display: inline cards (stacked) + gutter marks (Monaco) ----------

function findRowFor(draft: Draft): HTMLElement | null {
  for (const section of safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection)) {
    if (sectionFilePath(section) !== draft.filePath) continue;
    for (const row of safeQueryAll<HTMLElement>(DIFF_SELECTORS.row, section)) {
      const info = rowInfo(row);
      if (info && info.line === draft.line && info.side === draft.side) return row;
    }
  }
  return null;
}

/**
 * Swap a card's / panel item's content for an editing textarea. The native
 * composer only exists per diff line, so stored drafts are edited in place.
 */
function startInlineEdit(host: HTMLElement, draft: Draft): void {
  if (!currentKey || host.querySelector("textarea")) return;
  const key = currentKey;
  const content = host.querySelector<HTMLElement>(
    ".adofix-draft-card-content, .adofix-draft-item-text"
  );
  const actions = host.querySelector<HTMLElement>(".adofix-draft-actions");
  if (!content || !actions) return;

  const ta = document.createElement("textarea");
  ta.className = "adofix-draft-inline-ta";
  ta.value = draft.content;

  const rerender = (): void => {
    safeQuery(`[${CARD_ID_ATTR}="${draft.id}"]`)?.remove();
    renderDraftCards();
    renderMonacoZoneCards();
    renderTreeDraftRows();
    renderPanel();
  };
  const save = (): void => {
    const text = ta.value.trim();
    if (!text) return;
    const drafts = loadDrafts(key);
    const target = drafts.find((d) => d.id === draft.id);
    if (target) target.content = text;
    saveDrafts(key, drafts);
    rerender();
  };

  ta.addEventListener("keydown", (e) => {
    // Keep ADO's page-level key handlers away from typing.
    e.stopPropagation();
    if (e.key === "Escape") rerender();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "adofix-draft-btn adofix-primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", save);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "adofix-draft-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", rerender);

  content.replaceWith(ta);
  actions.replaceChildren(saveBtn, cancelBtn);
  ta.focus();
}

function quietButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "adofix-draft-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function actionsFor(host: HTMLElement, draft: Draft): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "adofix-draft-actions";
  actions.append(
    quietButton("Edit", () => startInlineEdit(host, draft)),
    quietButton("Delete", () => deleteDraft(draft.id))
  );
  return actions;
}

function buildCard(draft: Draft): HTMLElement {
  const card = document.createElement("div");
  card.className = "adofix-draft-card";
  card.setAttribute(CARD_ID_ATTR, draft.id);

  const head = document.createElement("div");
  head.className = "adofix-draft-head";

  const chip = document.createElement("span");
  chip.className = "adofix-draft-chip";
  chip.textContent = "Draft";

  const loc = document.createElement("span");
  loc.className = "adofix-draft-loc";
  loc.textContent = locLabel(draft);

  head.append(chip, loc, actionsFor(card, draft));

  const content = document.createElement("div");
  content.className = "adofix-draft-card-content";
  content.textContent = draft.content;

  card.append(head, content);
  return card;
}

/** Inline cards, stacked view only. Monaco drafts are visible in the panel. */
function renderDraftCards(): void {
  if (!currentKey) return;
  const drafts = loadDrafts(currentKey);
  for (const card of safeQueryAll<HTMLElement>(`[${CARD_ID_ATTR}]`)) {
    if (!drafts.some((d) => d.id === card.getAttribute(CARD_ID_ATTR))) card.remove();
  }
  for (const draft of drafts) {
    if (safeQuery(`[${CARD_ID_ATTR}="${draft.id}"]`)) continue;
    if (draft.fileLevel) {
      // No row to anchor to — the card sits at the top of its file section.
      const section = safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection).find(
        (s) => sectionFilePath(s) === draft.filePath
      );
      if (!section) continue;
      const card = buildCard(draft);
      card.classList.add("adofix-file-draft");
      section.insertBefore(card, section.children[1] ?? null);
      continue;
    }
    const row = findRowFor(draft);
    if (!row) continue;
    const contentCell = safeQuery<HTMLElement>(DIFF_SELECTORS.lineContent, row);
    (contentCell ?? row).appendChild(buildCard(draft));
  }
}

// ---- view-zone cards (single-file Monaco view) ------------------------------
//
// Real Monaco view zones (features/pr/monaco.ts holds the instance-access
// recipe): the card renders inline below its drafted line, displaces later
// lines like ADO's own comment threads, and the diff editor auto-spaces the
// original pane so side-by-side alignment survives.

interface ZoneEntry {
  zone: ViewZone;
  zoneId: string;
  content: string;
  afterLine: number;
}

let zoneHost: MonacoEditor | null = null;
const zoneEntries = new Map<string, ZoneEntry>();
let zoneResizeObserver: ResizeObserver | null = null;

function zoneAnchor(draft: Draft): number {
  return draft.fileLevel ? 0 : (draft.endLine ?? draft.line);
}

function relayoutZones(): void {
  if (!zoneHost) return;
  const host = zoneHost;
  host.changeViewZones((acc) => {
    for (const entry of zoneEntries.values()) acc.layoutZone(entry.zoneId);
  });
  host.layout();
}

/** Inline edits swap the card body for a textarea; the zone follows along. */
function watchZoneCard(card: HTMLElement): void {
  if (typeof ResizeObserver === "undefined") return;
  zoneResizeObserver ??= new ResizeObserver((resizes) => {
    let changed = false;
    for (const resize of resizes) {
      const entry = [...zoneEntries.values()].find((e) => e.zone.domNode.contains(resize.target));
      if (!entry) continue;
      const height = Math.max((resize.target as HTMLElement).offsetHeight + 8, 34);
      if (Math.abs(height - entry.zone.heightInPx) < 2) continue;
      entry.zone.heightInPx = height;
      changed = true;
    }
    if (changed) relayoutZones();
  });
  zoneResizeObserver.observe(card);
}

function buildZoneNode(draft: Draft): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "adofix-zone-wrap";
  const card = buildCard(draft);
  card.classList.add("adofix-zone-card");
  wrap.appendChild(card);
  watchZoneCard(card);
  return wrap;
}

/** Off-DOM measurement at the editor's content width; Monaco needs a fixed
 * heightInPx per zone. */
function measureZoneHeight(node: HTMLElement, width: number): number {
  node.style.position = "absolute";
  node.style.visibility = "hidden";
  node.style.width = `${width}px`;
  document.body.appendChild(node);
  const card = node.firstElementChild as HTMLElement | null;
  const height = Math.max((card?.offsetHeight ?? node.offsetHeight) + 8, 34);
  node.remove();
  node.style.position = "";
  node.style.visibility = "";
  node.style.width = "";
  return height;
}

function renderMonacoZoneCards(): void {
  if (!safeQuery(DIFF_SELECTORS.monacoRoot)) return;
  const diffEditor = findDiffEditor();
  if (!diffEditor) return;
  const ed = diffEditor.getModifiedEditor();
  if (ed !== zoneHost) {
    // A file switch replaced the editor instance; old zones died with it.
    zoneEntries.clear();
    zoneHost = ed;
  }
  const path = currentFilePath();
  const drafts =
    currentKey && path
      ? loadDrafts(currentKey).filter((d) => d.filePath === path && d.side === "right")
      : [];
  const wanted = new Map(drafts.map((d) => [d.id, d] as const));
  let changed = false;
  ed.changeViewZones((acc) => {
    for (const [id, entry] of [...zoneEntries]) {
      const draft = wanted.get(id);
      const intact =
        entry.zone.domNode.isConnected && entry.zone.domNode.querySelector(`[${CARD_ID_ATTR}]`);
      if (draft && draft.content === entry.content && zoneAnchor(draft) === entry.afterLine && intact)
        continue;
      acc.removeZone(entry.zoneId);
      const card = entry.zone.domNode.firstElementChild;
      if (card) zoneResizeObserver?.unobserve(card);
      zoneEntries.delete(id);
      changed = true;
    }
    for (const draft of drafts) {
      if (zoneEntries.has(draft.id)) continue;
      const domNode = buildZoneNode(draft);
      const width = Math.max(200, (ed.getDomNode()?.clientWidth ?? 700) - 80);
      const zone: ViewZone = {
        afterLineNumber: zoneAnchor(draft),
        heightInPx: measureZoneHeight(domNode, width),
        domNode,
        suppressMouseDown: false,
      };
      const zoneId = acc.addZone(zone);
      zoneEntries.set(draft.id, {
        zone,
        zoneId,
        content: draft.content,
        afterLine: zone.afterLineNumber,
      });
      changed = true;
    }
  });
  // addZone alone leaves nodes display:none — the layout pass makes them real.
  if (changed) relayoutZones();
}

/**
 * Purple bold gutter numbers (+ dot) on drafted lines. Runs on every settle:
 * Monaco recreates overlays on scroll, and the marks ride along.
 */
function markMonacoDraftLines(): void {
  const overlays = safeQueryAll<HTMLElement>(DIFF_SELECTORS.monacoLineNumber);
  if (overlays.length === 0) return;
  const path = currentFilePath();
  const drafted = new Set<number>();
  if (currentKey && path) {
    for (const d of loadDrafts(currentKey)) {
      if (d.filePath !== path || d.side !== "right") continue;
      for (let line = d.line; line <= (d.endLine ?? d.line); line++) drafted.add(line);
    }
  }
  for (const overlay of overlays) {
    const line = lineFromOverlayText(overlay.textContent);
    overlay.classList.toggle("adofix-has-draft", line !== null && drafted.has(line));
  }
}

// ---- draft rows in the file tree --------------------------------------------
//
// ADO lists a file's comment THREADS as child tree rows, but those are
// server-side; local drafts get lookalike rows (structure cloned from the
// native .repos-file-explorer-tree-thread-item rows, verified live
// 2026-08-19). bolt's virtualized tree re-renders its own rows on scroll, so
// rows are keyed and checked in place on every settle — the no-op path makes
// no DOM writes (the settle observer would otherwise re-fire forever).
// TREE_SELECTORS.row excludes these rows so the shared path math never sees
// them.

const TREE_ROW_ATTR = "data-adofix-tree-draft";

function treeDraftLabel(draft: Draft): string {
  return `${locLabel(draft)} · ${draft.content}`;
}

function presentationCell(): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = "bolt-table-cell-compact bolt-table-cell bolt-list-cell";
  td.setAttribute("role", "presentation");
  return td;
}

function buildTreeDraftRow(draft: Draft, fileRow: HTMLElement): HTMLElement {
  const tr = document.createElement("tr");
  tr.className = "bolt-tree-row bolt-table-row bolt-list-row adofix-tree-draft";
  tr.setAttribute("role", "row");
  tr.setAttribute(TREE_ROW_ATTR, draft.id);
  tr.setAttribute("aria-level", String(Number(fileRow.getAttribute("aria-level") ?? "1") + 1));
  tr.setAttribute("data-adofix-label", treeDraftLabel(draft));
  tr.title = draft.content;

  const mid = document.createElement("td");
  mid.className = "bolt-table-cell bolt-list-cell";
  mid.setAttribute("role", "gridcell");
  const midContent = document.createElement("div");
  midContent.className = "bolt-table-cell-content flex-row flex-center";
  mid.appendChild(midContent);

  const cell = document.createElement("td");
  cell.className = "bolt-tree-cell bolt-table-cell bolt-list-cell";
  cell.setAttribute("role", "gridcell");
  const content = document.createElement("div");
  content.className = "bolt-table-cell-content flex-row flex-center adofix-tree-draft-item";
  // Native child rows start their content where the parent's NAME starts —
  // measured off the live row so any tree depth works.
  const name = safeQuery<HTMLElement>(TREE_SELECTORS.name, fileRow);
  const indent = name
    ? Math.max(0, name.getBoundingClientRect().left - fileRow.getBoundingClientRect().left)
    : 96;
  const spacer = document.createElement("span");
  spacer.style.cssText = `width:${Math.round(indent)}px;flex-shrink:0`;
  const icon = document.createElement("span");
  icon.className = "fabric-icon ms-Icon--Comment adofix-tree-draft-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("div");
  label.className = "flex-grow text-ellipsis adofix-tree-draft-text";
  label.textContent = treeDraftLabel(draft);
  content.append(spacer, icon, label);
  cell.appendChild(content);

  tr.append(presentationCell(), mid, cell, presentationCell());
  tr.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    void showDraft(draft);
  });
  return tr;
}

function renderTreeDraftRows(): void {
  const existing = safeQueryAll<HTMLElement>(".adofix-tree-draft");
  const drafts = currentKey ? loadDrafts(currentKey) : [];
  const expected: Array<{ draft: Draft; fileRow: HTMLElement }> = [];
  if (drafts.length > 0) {
    // mapTreeFiles iterates in rendered tree order; virtualized-away files
    // simply contribute nothing until they scroll back in.
    for (const [path, entry] of mapTreeFiles()) {
      for (const draft of drafts
        .filter((d) => d.filePath === path)
        .sort((a, b) => a.line - b.line))
        expected.push({ draft, fileRow: entry.row });
    }
  }
  const intact =
    existing.length === expected.length &&
    expected.every(({ draft, fileRow }, i) => {
      const row = existing[i]!;
      const prevOk =
        i > 0 && expected[i - 1]!.fileRow === fileRow
          ? row.previousElementSibling === existing[i - 1]
          : row.previousElementSibling === fileRow;
      return (
        row.getAttribute(TREE_ROW_ATTR) === draft.id &&
        prevOk &&
        row.getAttribute("data-adofix-label") === treeDraftLabel(draft)
      );
    });
  if (intact) return;
  for (const row of existing) row.remove();
  // Back-to-front so same-file drafts keep line order under fileRow.after().
  for (let i = expected.length - 1; i >= 0; i--) {
    const { draft, fileRow } = expected[i]!;
    fileRow.after(buildTreeDraftRow(draft, fileRow));
  }
}

// ---- "Show": navigate to a draft's location ---------------------------------

/**
 * Center the drafted line in the Monaco view and flash its zone card.
 * Left-side (removed-line) drafts land approximately — the gutter counts
 * modified lines, but the panes stay roughly aligned.
 */
function revealDraftLine(draft: Draft): void {
  renderMonacoZoneCards();
  renderTreeDraftRows();
  const ed = findDiffEditor()?.getModifiedEditor();
  if (!ed) return;
  ed.revealLineInCenter(draft.fileLevel ? 1 : draft.line);
  const card = safeQuery<HTMLElement>(`[${CARD_ID_ATTR}="${draft.id}"]`);
  if (card) flashOutline(card);
}

async function showDraft(draft: Draft): Promise<void> {
  const key = currentKey;
  if (!key) return;
  closePanel();
  if (safeQuery(DIFF_SELECTORS.monacoRoot)) {
    if (currentFilePath() === draft.filePath) {
      revealDraftLine(draft);
      return;
    }
    if (!(await clickTreeFileRow(key, draft.filePath))) {
      showToast(`Couldn't find ${splitPath(draft.filePath).base} in the file tree`);
      return;
    }
    await waitFor(() =>
      currentFilePath() === draft.filePath && findDiffEditor() ? true : null
    );
    revealDraftLine(draft);
    return;
  }
  // Stacked view: rows (and our card) only exist once the section scrolls
  // near the viewport — scroll there, then wait for the card to become real.
  const section = safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection).find(
    (s) => sectionFilePath(s) === draft.filePath
  );
  if (section) {
    section.scrollIntoView({ block: "start" });
    const card = await waitFor(() => {
      renderDraftCards();
      return safeQuery<HTMLElement>(`[${CARD_ID_ATTR}="${draft.id}"]`);
    }, 3000);
    if (card) {
      card.scrollIntoView({ block: "center" });
      flashOutline(card);
      return;
    }
  }
  // Section virtualized away — the single-file view can always host it.
  if (await clickTreeFileRow(key, draft.filePath)) {
    await waitFor(() =>
      currentFilePath() === draft.filePath && findDiffEditor() ? true : null
    );
    revealDraftLine(draft);
  } else {
    showToast(`Couldn't find ${splitPath(draft.filePath).base} in the file tree`);
  }
}

// ---- drafts panel + submit --------------------------------------------------

function deleteDraft(id: string): void {
  if (!currentKey) return;
  saveDrafts(
    currentKey,
    loadDrafts(currentKey).filter((d) => d.id !== id)
  );
  safeQuery(`[${CARD_ID_ATTR}="${id}"]`)?.remove();
  markMonacoDraftLines();
  renderMonacoZoneCards();
  renderTreeDraftRows();
  updateToolbar();
  renderPanel();
}

function disarmConfirm(): void {
  confirmArmed = false;
  if (confirmTimer !== undefined) clearTimeout(confirmTimer);
  confirmTimer = undefined;
}

function closePanel(): void {
  panelOpen = false;
  disarmConfirm();
  safeQuery(`[data-adofix="${FEATURE_ID}-panel"]`)?.remove();
}

function renderPanel(): void {
  safeQuery(`[data-adofix="${FEATURE_ID}-panel"]`)?.remove();
  if (!panelOpen || !currentKey) return;
  const drafts = loadDrafts(currentKey);
  if (drafts.length === 0) {
    closePanel();
    return;
  }

  const panel = document.createElement("div");
  panel.className = "adofix-drafts-panel adofix-surface";
  panel.setAttribute("data-adofix", `${FEATURE_ID}-panel`);
  panel.setAttribute("data-adofix-modal", "");

  const head = document.createElement("div");
  head.className = "adofix-drafts-panel-head";
  head.append("Drafts");
  const pill = document.createElement("span");
  pill.className = "adofix-count-pill";
  pill.textContent = String(drafts.length);
  const close = quietButton("✕", closePanel);
  close.classList.add("adofix-panel-close");
  close.title = "Close";
  head.append(pill, close);
  panel.appendChild(head);

  const body = document.createElement("div");
  body.className = "adofix-drafts-panel-body";
  for (const draft of drafts) {
    const item = document.createElement("div");
    item.className = "adofix-draft-item";

    const name = document.createElement("div");
    name.className = "adofix-draft-item-name";
    const { dir, base } = splitPath(draft.filePath);
    const file = document.createElement("span");
    file.className = "adofix-draft-file";
    file.textContent = base;
    const lines = document.createElement("span");
    lines.className = "adofix-draft-lines";
    lines.textContent = locLabel(draft);
    const actions = actionsFor(item, draft);
    actions.prepend(quietButton("Show", () => void showDraft(draft)));
    name.append(file, lines, actions);

    const dirEl = document.createElement("div");
    dirEl.className = "adofix-draft-dir";
    dirEl.textContent = dir || "/";
    dirEl.title = draft.filePath;

    const text = document.createElement("div");
    text.className = "adofix-draft-item-text";
    text.textContent = draft.content;

    item.append(name, dirEl, text);
    body.appendChild(item);
  }
  panel.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "adofix-drafts-panel-foot";
  const n = drafts.length;
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "adofix-draft-btn adofix-primary adofix-send";
  submit.textContent = confirmArmed
    ? `Click again to send ${n}`
    : `Send ${n} comment${n === 1 ? "" : "s"}`;
  submit.addEventListener("click", () => {
    if (!confirmArmed) {
      confirmArmed = true;
      confirmTimer = setTimeout(() => {
        disarmConfirm();
        renderPanel();
      }, 4000);
      renderPanel();
      return;
    }
    disarmConfirm();
    void submitAll();
  });
  foot.appendChild(submit);
  panel.appendChild(foot);

  document.body.appendChild(panel);
}

/**
 * The toolbar "Drafts · N" button moved into the pr-comments widget
 * (2026-08-02); these exports are its levers. A zero count closes the panel
 * the way the old button's disappearance used to.
 */
export function draftsCount(): number {
  return currentKey ? loadDrafts(currentKey).length : 0;
}

export function toggleDraftsPanel(): void {
  panelOpen = !panelOpen && draftsCount() > 0;
  renderPanel();
}

function updateToolbar(): void {
  if (draftsCount() === 0) closePanel();
}

/**
 * Flush drafts sequentially. Progress persists after every attempt, so an
 * interruption loses nothing and re-submitting never double-posts; failures
 * stay local.
 */
async function submitAll(): Promise<void> {
  if (!currentKey || !currentRef) return;
  const key = currentKey;
  const drafts = loadDrafts(key);
  const failed: Draft[] = [];
  let posted = 0;
  let lastError = "";

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const res = await createThread(currentRef, {
      content: draft.content,
      filePath: draft.filePath,
      line: draft.line,
      ...(draft.endLine !== undefined ? { endLine: draft.endLine } : {}),
      ...(draft.fileLevel ? { fileLevel: true } : {}),
      side: draft.side,
    });
    if (res.ok) {
      posted++;
      safeQuery(`[${CARD_ID_ATTR}="${draft.id}"]`)?.remove();
    } else {
      failed.push(draft);
      lastError = res.error.message;
      log(FEATURE_ID, `draft on ${draft.filePath}:${draft.line} failed`, res.error);
    }
    saveDrafts(key, [...failed, ...drafts.slice(i + 1)]);
  }

  renderDraftCards();
  markMonacoDraftLines();
  renderMonacoZoneCards();
  renderTreeDraftRows();
  updateToolbar();
  renderPanel();

  if (failed.length === 0) {
    showToast(`Sent ${posted} comment${posted === 1 ? "" : "s"} — reload to see the threads`);
  } else {
    showToast(`Sent ${posted}, kept ${failed.length} as drafts (${lastError})`, 5000);
  }
}

export const prDrafts: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  init(): void {
    installGestureTracking();
  },
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, DRAFTS_CSS);
    currentKey = draftKey(route);
    currentRef = currentKey ? prRefFromRoute(route) : null;
    if (!currentKey) {
      log(FEATURE_ID, "not a concrete PR route — inactive", route.path);
      return;
    }
    if (!safeQuery(DIFF_SELECTORS.filesView)) {
      log(FEATURE_ID, "files view not present (overview tab?) — waiting");
      return;
    }
    const adorned = adornComposers();
    const fileButtons = adornFileHeaders();
    renderDraftCards();
    markMonacoDraftLines();
    renderMonacoZoneCards();
    renderTreeDraftRows();
    updateToolbar();
    log(
      FEATURE_ID,
      `mode=${safeQuery(DIFF_SELECTORS.monacoLineNumber) ? "monaco" : "stacked"}` +
        `, composers adorned: ${adorned}, file buttons: ${fileButtons}` +
        `, drafts: ${loadDrafts(currentKey).length}`
    );
  },
};
