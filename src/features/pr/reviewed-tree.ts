import { safeQuery, safeQueryAll } from "../../core/dom";

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
  row: "tr.bolt-tree-row",
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
