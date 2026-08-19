import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";
import { observeResize } from "../core/observe";

/**
 * Backlogs hierarchy grid (user request 2026-08-18):
 *  - the pane holding the hierarchy goes flat on the page (it is chrome, not
 *    a conversation — design language: conversations = cards, chrome = flat);
 *  - columns fit the viewport. ADO renders the backlog as a fixed-layout
 *    table whose <col>s carry absolute pixel widths plus a width:100% filler
 *    col; when the pixels overflow the container you get horizontal scroll,
 *    and when they underflow the FILLER absorbs the slack, so columns never
 *    grow either. We rewrite the col widths: Title takes all slack; when
 *    space is short the data columns shrink proportionally instead of
 *    scrolling (Title floors at 280px, data columns at half their natural
 *    width — beyond that, scroll returns).
 * The grid component is shared with the sprint hub's Backlog tab
 * (.backlogs-view is present on both), so the treatment is DOM-gated, not
 * route-gated.
 */
const FEATURE_ID = "backlog-grid";

const TITLE_MIN = 280;
const SCALE_FLOOR = 0.5;
/** Cols at or below this are structural (borders 8, expand 70, Order 60). */
const FIXED_MAX = 80;

const CSS = `
.backlogs-view,
.backlogs-view .bolt-table-card {
  background: transparent !important;
  box-shadow: none !important;
}
`;

export type ColKind = "fixed" | "data" | "title" | "filler";

export interface ColSpec {
  kind: ColKind;
  /** Natural width in px (ADO's own; ignored for filler). */
  width: number;
}

/**
 * Pure fit: returns the new width per column (same order), or null when the
 * input is not fittable (no/ambiguous title column, no room to measure).
 */
export function fitColumns(specs: ColSpec[], containerWidth: number): number[] | null {
  if (containerWidth <= 0) return null;
  if (specs.filter((s) => s.kind === "title").length !== 1) return null;

  const fixedSum = specs.reduce((a, s) => (s.kind === "fixed" ? a + s.width : a), 0);
  const dataSum = specs.reduce((a, s) => (s.kind === "data" ? a + s.width : a), 0);

  const slack = containerWidth - fixedSum - dataSum;
  let scale = 1;
  if (slack < TITLE_MIN && dataSum > 0) {
    scale = Math.max(SCALE_FLOOR, Math.min(1, (dataSum - (TITLE_MIN - slack)) / dataSum));
  }

  const widths = specs.map((s) => {
    if (s.kind === "fixed") return s.width;
    if (s.kind === "filler") return 0;
    if (s.kind === "data") return Math.floor(s.width * scale);
    return 0; // title: filled in below with the exact remainder
  });
  const used = widths.reduce((a, w) => a + w, 0);
  const titleIdx = specs.findIndex((s) => s.kind === "title");
  widths[titleIdx] = Math.max(TITLE_MIN, containerWidth - used);
  return widths;
}

/**
 * Natural-width memory per <col>. ADO owns these elements: when a col's
 * current width differs from what WE last wrote, that is ADO (or the user via
 * a drag/Column Options) changing it — adopt it as the new natural width.
 * Without this the fit would ratchet: our own shrunken output would become
 * the next run's "natural" and columns could never grow back.
 */
const colMemory = new WeakMap<HTMLTableColElement, { natural: number; written: number }>();

function naturalWidth(col: HTMLTableColElement): number {
  const cur = col.getBoundingClientRect().width;
  const mem = colMemory.get(col);
  if (!mem) return cur;
  if (Math.abs(cur - mem.written) > 1.5) return cur; // external change wins
  return mem.natural;
}

function classify(col: HTMLTableColElement, isTitle: boolean): ColSpec {
  const style = col.getAttribute("style") ?? "";
  if (style.includes("100%")) return { kind: "filler", width: 0 };
  if (isTitle) return { kind: "title", width: naturalWidth(col) };
  const width = naturalWidth(col);
  if (style.includes("rem") || width <= FIXED_MAX) return { kind: "fixed", width };
  return { kind: "data", width };
}

function fitTable(table: HTMLTableElement): void {
  const container = table.closest<HTMLElement>(".bolt-table-container");
  if (!container) return;
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"));
  const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("th"));
  if (cols.length === 0 || cols.length !== ths.length) return;

  // English-UI assumption, consistent repo-wide: the flex column is "Title".
  const titleIdx = ths.findIndex((t) => (t.textContent ?? "").trim() === "Title");
  if (titleIdx < 0) return;

  const specs = cols.map((c, i) => classify(c, i === titleIdx));
  const widths = fitColumns(specs, container.clientWidth);
  if (!widths) return;

  cols.forEach((col, i) => {
    const spec = specs[i]!;
    if (spec.kind === "fixed") return; // ADO's own width, leave the style alone
    const target = widths[i]!;
    const current = col.getBoundingClientRect().width;
    if (Math.abs(current - target) > 1) col.style.width = `${target}px`;
    colMemory.set(col, { natural: spec.width, written: target });
  });

  // The settle observer is childList-only: splitter drags and window resizes
  // never reach it. A ResizeObserver on the scroll container covers both.
  observeResize(FEATURE_ID, container, () => {
    const t = container.querySelector<HTMLTableElement>("table.backlog-tree");
    if (t) fitTable(t);
  });
}

export const backlogGrid: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  apply(): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const table = document.querySelector<HTMLTableElement>(".backlogs-view table.backlog-tree");
    if (table) fitTable(table);
  },
};
