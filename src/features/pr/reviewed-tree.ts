import { safeQuery, safeQueryAll } from "../../core/dom";
import { log } from "../../core/log";

/**
 * The PR file tree's "Mark as reviewed" checkboxes (all verified live
 * 2026-08-02). ADO puts one on every tree row, revealed on hover; its
 * aria-checked carries the reviewed state. The tree IS virtualized (bolt
 * list: ~31 rendered rows + spacer rows, aria-rowcount 515 on the 425-file
 * PR) — an early full-render observation was a transient. Anything needing
 * the whole tree must sweep-scroll it.
 */
export const TREE_SELECTORS = {
  table: ".repos-changes-explorer-tree",
  /** The tree pane's scroll wrapper (also hosts the repo header row). */
  scroller: ".repos-changes-explorer-splitter .vss-Splitter--pane-fixed > .absolute-fill",
  /**
   * pr-drafts injects lookalike draft rows (.adofix-tree-draft) after file
   * rows; they carry no data-row-index, so letting them through would break
   * buildWindowedPaths' contiguity check for everything below them.
   */
  row: "tr.bolt-tree-row:not(.adofix-tree-draft)",
  /**
   * The name span inside a row's tree cell. Change-type pills ("+" on added
   * files) are sibling .bolt-pill DIVs — matching span.text-ellipsis skips
   * them (the pill's inner text-ellipsis is a DIV).
   */
  name: ".bolt-tree-cell span.text-ellipsis",
  /** ADO's own reviewed checkbox on the row. */
  checkbox: '.bolt-checkbox[role="checkbox"]',
  /** File rows are the ones whose expand button is .invisible; folders keep a real one. */
  fileMarker: ".bolt-tree-expand-button.invisible",
};

export interface TreeRowLike {
  /** aria-level, 1-based; the repo header above the table is not a row. */
  level: number;
  /** Display name — a compressed folder chain renders as one row ("a/b/c"). */
  name: string;
}

/**
 * Repo paths for tree rows in flat-list order. Stack-based: a row at level L
 * replaces the stack from depth L on. Compressed folder chains need no
 * special casing — the whole "a/b/c" text is one path segment that joins
 * correctly. Rows MUST be gapless and in order (depth-first guarantees every
 * ancestor precedes its descendants).
 */
export function buildTreePaths(rows: TreeRowLike[]): string[] {
  const stack: string[] = [];
  return rows.map((row) => {
    stack.length = Math.min(stack.length, Math.max(0, row.level - 1));
    stack.push(row.name);
    return `/${stack.join("/")}`;
  });
}

export interface RenderedTreeRow extends TreeRowLike {
  /** data-row-index — 0-based position in the virtual flat list. */
  index: number;
  isFile: boolean;
  row: HTMLElement;
}

/** The currently rendered (non-virtualized-away) tree rows. */
export function readRenderedRows(root: ParentNode = document): RenderedTreeRow[] {
  return safeQueryAll<HTMLElement>(TREE_SELECTORS.row, root).map((row) => ({
    index: Number(row.getAttribute("data-row-index") ?? "-1"),
    level: Number(row.getAttribute("aria-level") ?? "1"),
    name: (safeQuery(TREE_SELECTORS.name, row)?.textContent ?? "").trim(),
    isFile: safeQuery(TREE_SELECTORS.fileMarker, row) !== null,
    row,
  }));
}

/**
 * Like buildTreePaths, but for a possibly PARTIAL window of the virtual
 * list: a row's path is only computable when its whole ancestor chain was
 * walked. After an index gap (rows virtualized away) — or when the window
 * does not start at the tree top — paths stay null until a level-1 row
 * re-anchors the stack. Wrong-but-plausible paths would silently attach
 * reviewed state to the wrong file; null is the honest answer.
 */
export function buildWindowedPaths(rows: Array<TreeRowLike & { index: number }>): Array<string | null> {
  const stack: string[] = [];
  let valid = false;
  let prevIndex = Number.NEGATIVE_INFINITY;
  return rows.map((row) => {
    const contiguous = row.index === prevIndex + 1 || row.index === 0;
    prevIndex = row.index;
    if (!contiguous && row.level !== 1) {
      valid = false;
      return null;
    }
    if (row.level === 1) valid = true;
    else if (!valid || row.level - 1 > stack.length) {
      valid = false;
      return null;
    }
    stack.length = row.level - 1;
    stack.push(row.name);
    return `/${stack.join("/")}`;
  });
}

export interface TreeFileEntry {
  row: HTMLElement;
  checkbox: HTMLElement | null;
  reviewed: boolean;
}

/** Map rendered file rows whose paths are provable to their tree entries.
 * Callers needing files outside the rendered window use pr-reviewed's sweep. */
export function mapTreeFiles(root: ParentNode = document): Map<string, TreeFileEntry> {
  const rendered = readRenderedRows(root).sort((a, b) => a.index - b.index);
  const paths = buildWindowedPaths(rendered);
  const map = new Map<string, TreeFileEntry>();
  rendered.forEach((r, i) => {
    const path = paths[i];
    if (!r.isFile || path == null) return;
    const checkbox = safeQuery<HTMLElement>(TREE_SELECTORS.checkbox, r.row);
    map.set(path, {
      row: r.row,
      checkbox,
      reviewed: checkbox?.getAttribute("aria-checked") === "true",
    });
  });
  return map;
}

// ---- virtualized-tree index + row/checkbox clicks ---------------------------
// Moved here from pr-reviewed (2026-08-19) so pr-review-flow can share the
// per-PR index cache and the scroll-until-rendered machinery.

function treeScroller(): HTMLElement | null {
  return safeQuery<HTMLElement>(TREE_SELECTORS.scroller);
}

function treeRowCount(): number {
  return Number(safeQuery(TREE_SELECTORS.table)?.getAttribute("aria-rowcount") ?? "0");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Estimated scroller offset of a flat-list row, derived from a rendered row. */
function offsetForIndex(scroller: HTMLElement, index: number): number {
  const rendered = readRenderedRows();
  const sample = rendered[0];
  if (!sample || sample.index < 0) return index * 35;
  const sampleTop =
    sample.row.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
  const second = rendered.find((r) => r.index > sample.index);
  const rowHeight = second
    ? Math.abs(
        (second.row.getBoundingClientRect().top - sample.row.getBoundingClientRect().top) /
          (second.index - sample.index)
      )
    : 35;
  return sampleTop + (index - sample.index) * rowHeight;
}

/**
 * Scroll the tree top-to-bottom once, collecting (index, level, name, isFile)
 * for every row, and build the full path→index map. ~500 rows in ~31-row
 * windows is under twenty steps; the scroll position is restored afterwards.
 */
async function sweepTreeIndex(): Promise<{ rowCount: number; byPath: Map<string, number> } | null> {
  const scroller = treeScroller();
  const rowCount = treeRowCount();
  if (!scroller || rowCount === 0) return null;
  const savedTop = scroller.scrollTop;
  const collected = new Map<number, { level: number; name: string; isFile: boolean }>();
  try {
    for (let guard = 0; guard < 100; guard++) {
      for (const r of readRenderedRows()) {
        if (r.index >= 0) collected.set(r.index, { level: r.level, name: r.name, isFile: r.isFile });
      }
      let firstMissing = -1;
      for (let i = 0; i < rowCount; i++) {
        if (!collected.has(i)) {
          firstMissing = i;
          break;
        }
      }
      if (firstMissing < 0) break;
      scroller.scrollTop = Math.max(0, offsetForIndex(scroller, firstMissing) - 40);
      await delay(90);
      if (!collected.has(firstMissing) && guard > 4) {
        // No progress near the end (rowcount may include a trailing spacer);
        // accept what we have if the tail is all that is missing.
        const missingCount = rowCount - collected.size;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5 && missingCount < 5) {
          break;
        }
      }
    }
  } finally {
    scroller.scrollTop = savedTop;
  }
  // Only the contiguous prefix from row 0 is provably parented; a mid-list
  // gap (sweep aborted by the guard) would mis-parent everything after it.
  const ordered = [...collected.entries()].sort((a, b) => a[0] - b[0]);
  let contiguous = 0;
  while (contiguous < ordered.length && ordered[contiguous]![0] === contiguous) contiguous++;
  const prefix = ordered.slice(0, contiguous);
  const paths = buildTreePaths(prefix.map(([, r]) => r));
  const byPath = new Map<string, number>();
  prefix.forEach(([index, r], i) => {
    if (r.isFile) byPath.set(paths[i]!, index);
  });
  log("pr/reviewed-tree", `tree sweep: ${prefix.length}/${rowCount} rows mapped, ${byPath.size} files`);
  return { rowCount, byPath };
}

export interface TreeIndex {
  key: string;
  rowCount: number;
  byPath: Map<string, number>;
}

let treeIndex: TreeIndex | null = null;

/**
 * Sweep once per PR; expanding/collapsing folders renumbers the flat list,
 * so rowCount is the cheap staleness signal on top of the PR key.
 */
export async function getTreeIndex(key: string): Promise<TreeIndex | null> {
  if (treeIndex && treeIndex.key === key && treeIndex.rowCount === treeRowCount()) return treeIndex;
  const swept = await sweepTreeIndex();
  treeIndex = swept ? { key, rowCount: swept.rowCount, byPath: swept.byPath } : null;
  return treeIndex;
}

/** Files in tree order (sweeps the virtualized tree once per PR). */
export async function orderedFilePaths(key: string): Promise<string[] | null> {
  const index = await getTreeIndex(key);
  if (!index) return null;
  return [...index.byPath.entries()].sort((a, b) => a[1] - b[1]).map(([path]) => path);
}

interface EnsuredRow {
  row: HTMLElement;
  /** Put the tree back where it was — for clicks that shouldn't keep it here. */
  restore: () => void;
}

/** Scroll the virtualized tree until path's row renders. */
async function ensureTreeRow(key: string, path: string): Promise<EnsuredRow | null> {
  const direct = mapTreeFiles().get(path);
  if (direct) return { row: direct.row, restore: () => {} };
  const scroller = treeScroller();
  const index = (await getTreeIndex(key))?.byPath.get(path);
  if (!scroller || index === undefined) return null;
  const savedTop = scroller.scrollTop;
  scroller.scrollTop = Math.max(0, offsetForIndex(scroller, index) - scroller.clientHeight / 2);
  for (let tries = 0; tries < 20; tries++) {
    await delay(80);
    const row = safeQueryAll<HTMLElement>(TREE_SELECTORS.row).find(
      (r) => r.getAttribute("data-row-index") === String(index)
    );
    if (row)
      return {
        row,
        restore: () => {
          scroller.scrollTop = savedTop;
        },
      };
  }
  scroller.scrollTop = savedTop;
  return null;
}

/** Click ADO's reviewed checkbox for path; the tree scrolls back afterwards. */
export async function clickTreeCheckbox(key: string, path: string): Promise<boolean> {
  const ensured = await ensureTreeRow(key, path);
  if (!ensured) return false;
  const checkbox = safeQuery<HTMLElement>(TREE_SELECTORS.checkbox, ensured.row);
  if (!checkbox) {
    ensured.restore();
    return false;
  }
  checkbox.click();
  await delay(120); // let ADO fire its persistence call before we scroll away
  ensured.restore();
  return true;
}

/** Click the file's row itself — SPA-navigates to its single-file view
 * (verified live 2026-08-19). Navigation re-scrolls the tree; no restore. */
export async function clickTreeFileRow(key: string, path: string): Promise<boolean> {
  const ensured = await ensureTreeRow(key, path);
  if (!ensured) return false;
  ensured.row.click();
  return true;
}
