import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery, safeQueryAll, showToast } from "../core/dom";
import { log } from "../core/log";
import { DRAFT_SELECTORS, sectionFilePath } from "./pr-drafts";
import { prRefFromRoute, refKey, type PrRef } from "./pr/threads-api";
import { patchViewed, viewedState } from "./pr/reviewed-data";
import {
  buildTreePaths,
  mapTreeFiles,
  readRenderedRows,
  TREE_SELECTORS,
} from "./pr/reviewed-tree";

/**
 * Mirrors the file tree's "Mark as reviewed" checkbox into every stacked
 * per-file header. Two mechanisms, because the tree is virtualized and the
 * reviewed hash is uncrackable client-side (see pr/reviewed-data.ts):
 * - DISPLAY reads the server's viewed-paths set (one POST per PR page load),
 *   overridden by live aria-checked wherever the tree row happens to be
 *   rendered.
 * - TOGGLE clicks ADO's real tree checkbox. If the row is virtualized away,
 *   the tree is sweep-scrolled once to map every path to its flat-list row
 *   index, then scrolled to the target row, clicked, and scrolled back.
 */
const FEATURE_ID = "pr-reviewed";

/*
 * Native material on purpose: this mirrors an ADO-owned state, so it wears
 * ADO's checkbox blue (--communication-background), not the adofix accent.
 * Revealed on header-row hover like the tree's own, and stays visible once
 * checked. ADO palette vars are R,G,B triplets — hence rgba(var(...)).
 */
const CSS = `
.adofix-reviewed {
  width: 16px; height: 16px; box-sizing: border-box; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(var(--palette-neutral-20, 200, 198, 196), 1);
  border-radius: 2px; cursor: pointer; padding: 0; margin-right: 10px;
  background: transparent; font-size: 11px; line-height: 1; color: transparent;
  opacity: 0; transition: opacity 0.12s;
}
.repos-summary-header > .flex-row:hover .adofix-reviewed,
.adofix-reviewed:focus-visible,
.adofix-reviewed[aria-checked="true"] { opacity: 1; }
.adofix-reviewed:hover { border-color: var(--communication-background, #0078d4); }
.adofix-reviewed[aria-checked="true"] {
  background: var(--communication-background, #0078d4);
  border-color: var(--communication-background, #0078d4);
  color: #fff;
}
.adofix-reviewed.adofix-busy { cursor: progress; opacity: 0.6; }
`;

// Display state comes from the shared live slot in pr/reviewed-data.

let currentRef: PrRef | null = null;
let treeKey: string | null = null;

// ---- virtualized-tree sweep (toggle support for unrendered rows) ------------

interface TreeIndexCache {
  rowCount: number;
  byPath: Map<string, number>;
}

let treeIndexCache: TreeIndexCache | null = null;
let toggleBusy = false;

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
async function sweepTreeIndex(): Promise<TreeIndexCache | null> {
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
  log(FEATURE_ID, `tree sweep: ${prefix.length}/${rowCount} rows mapped, ${byPath.size} files`);
  return { rowCount, byPath };
}

async function getTreeIndex(): Promise<TreeIndexCache | null> {
  // Expanding/collapsing folders renumbers the flat list — rowCount is the
  // cheap staleness signal.
  if (treeIndexCache && treeIndexCache.rowCount === treeRowCount()) return treeIndexCache;
  treeIndexCache = await sweepTreeIndex();
  return treeIndexCache;
}

/** Scroll the virtualized tree until the target row exists, then click its checkbox. */
async function clickTreeCheckbox(path: string): Promise<boolean> {
  const direct = mapTreeFiles().get(path);
  if (direct?.checkbox) {
    direct.checkbox.click();
    return true;
  }
  const scroller = treeScroller();
  const index = (await getTreeIndex())?.byPath.get(path);
  if (!scroller || index === undefined) return false;
  const savedTop = scroller.scrollTop;
  try {
    scroller.scrollTop = Math.max(0, offsetForIndex(scroller, index) - scroller.clientHeight / 2);
    for (let tries = 0; tries < 20; tries++) {
      await delay(80);
      const row = safeQueryAll<HTMLElement>(TREE_SELECTORS.row).find(
        (r) => r.getAttribute("data-row-index") === String(index)
      );
      const checkbox = row ? safeQuery<HTMLElement>(TREE_SELECTORS.checkbox, row) : null;
      if (checkbox) {
        checkbox.click();
        await delay(120); // let ADO fire its persistence call before we scroll away
        return true;
      }
    }
    return false;
  } finally {
    scroller.scrollTop = savedTop;
  }
}

// ---- header checkboxes ------------------------------------------------------

function syncBox(box: HTMLElement, reviewed: boolean): void {
  box.setAttribute("aria-checked", String(reviewed));
  box.title = reviewed
    ? "Reviewed — click to unmark (synced with the file tree)"
    : "Mark file as reviewed (synced with the file tree)";
}

async function toggleReviewed(section: HTMLElement, box: HTMLElement): Promise<void> {
  if (toggleBusy) return;
  const path = sectionFilePath(section);
  if (!path) return;
  toggleBusy = true;
  box.classList.add("adofix-busy");
  try {
    const wasReviewed = box.getAttribute("aria-checked") === "true";
    const clicked = await clickTreeCheckbox(path);
    if (!clicked) {
      showToast("Couldn't reach this file's tree row to mark it reviewed");
      return;
    }
    syncBox(box, !wasReviewed); // optimistic; the settle re-apply confirms
    // Patch the shared set so settle re-applies don't flicker the box back
    // while the refetch is in flight, then resync with the server.
    if (currentRef) patchViewed(currentRef, path, !wasReviewed);
  } finally {
    box.classList.remove("adofix-busy");
    toggleBusy = false;
  }
}

export const prReviewed: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    if (!ref) return;
    const key = refKey(ref);
    if (key !== treeKey) {
      treeKey = key;
      treeIndexCache = null;
    }
    currentRef = ref;
    const sections = safeQueryAll<HTMLElement>(DRAFT_SELECTORS.fileSection);
    if (sections.length === 0) return;
    const viewed = viewedState(ref, () => this.apply(route));
    const rendered = mapTreeFiles();
    let adorned = 0;
    for (const section of sections) {
      const host = safeQuery<HTMLElement>(".justify-end", section);
      const path = sectionFilePath(section);
      if (!host || !path) continue;
      let box = host.querySelector<HTMLButtonElement>(".adofix-reviewed");
      if (!box) {
        box = document.createElement("button");
        box.type = "button";
        box.className = "adofix-reviewed";
        box.textContent = "✓";
        box.setAttribute("role", "checkbox");
        const ownBox = box;
        box.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          void toggleReviewed(section, ownBox);
        });
        host.insertBefore(box, host.firstChild);
        adorned++;
      }
      // Rendered tree rows are live truth; the fetched set covers the rest.
      const live = rendered.get(path);
      syncBox(box, live ? live.reviewed : (viewed?.has(path) ?? false));
    }
    if (adorned > 0) log(FEATURE_ID, `header checkboxes adorned: ${adorned}`);
  },
};
