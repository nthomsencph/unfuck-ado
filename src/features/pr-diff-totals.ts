import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery } from "../core/dom";
import { log } from "../core/log";
import {
  fetchDiffTotals,
  formatLineCount,
  scopedTotals,
  type DiffTotals,
} from "./pr/diff-totals-api";
import { prRefFromRoute, refKey } from "./pr/threads-api";
import { createFetchCache } from "../core/fetch-cache";

/**
 * Whole-PR "-dels +adds" next to the toolbar's "n changed files" label —
 * the number ADO computes per file but never sums. Totals are for ALL
 * changes (compareTo base), independent of the iteration dropdown.
 */
const FEATURE_ID = "pr-diff-totals";

/**
 * The rhythm row wrapping the "n changed files" span (verified live
 * 2026-08-02) — appending there inherits the row's 8px gap. chrome.css turns
 * the toolbar's .flex-grow into display:contents, which does not affect
 * descendant selectors.
 */
const LABEL_ROW_SELECTOR =
  ".repos-compare-toolbar .flex-column > span.flex-row.rhythm-horizontal-8";

const CSS = `
.adofix-diff-totals { white-space: nowrap; display: inline-flex; gap: 6px; }
`;

// One fetch per PR per page lifetime: totals only move on a new iteration,
// and a reload is cheap enough to be the refresh gesture. Failures latch —
// see core/fetch-cache.ts for the v0.6.0 flood lesson.
const totalsByPr = createFetchCache<string, DiffTotals>();

/**
 * The tree scopes the view to a folder (or single file) via the `path` query
 * param — ADO's "n changed files" label scopes with it, so our totals must
 * too (whole-PR numbers next to a scoped count read as the folder's).
 */
function currentScope(): string | null {
  return new URLSearchParams(location.search).get("path");
}

function render(totals: DiffTotals): void {
  const row = safeQuery<HTMLElement>(LABEL_ROW_SELECTOR);
  if (!row) return;
  let el = row.querySelector<HTMLElement>(".adofix-diff-totals");
  if (!el) {
    el = document.createElement("span");
    el.className = "adofix-diff-totals body-m";
    const removed = document.createElement("span");
    removed.className = "repos-compare-removed-lines";
    const added = document.createElement("span");
    added.className = "repos-compare-added-lines";
    el.append(removed, added);
    row.appendChild(el);
  }
  const scope = currentScope();
  const sums = scopedTotals(totals.files, scope);
  el.title = scope
    ? `Lines removed / added under ${scope} (ado-unfuck)`
    : "Lines removed / added across all changes (ado-unfuck)";
  const [removed, added] = el.children as unknown as [HTMLElement, HTMLElement];
  removed.textContent = `-${formatLineCount(sums.dels)}`;
  added.textContent = `+${formatLineCount(sums.adds)}`;
}

export const prDiffTotals: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    if (!ref) return;
    if (!safeQuery(LABEL_ROW_SELECTOR)) return; // Files tab not up yet
    const key = refKey(ref);
    const cached = totalsByPr.get(key);
    if (cached) {
      render(cached);
      return;
    }
    if (totalsByPr.begin([key]).length === 0) return;
    void fetchDiffTotals(ref).then((res) => {
      if (!res.ok) {
        // Passive feature: log once and stand down until the next reload.
        totalsByPr.fail([key]);
        log(FEATURE_ID, "fetch failed — not retrying this page load", res.error);
        return;
      }
      totalsByPr.settle(key, res.value);
      const overall = scopedTotals(res.value.files, null);
      log(
        FEATURE_ID,
        `totals for ${key}: -${overall.dels} +${overall.adds} over ${res.value.files.length} files`
      );
      render(res.value);
    });
  },
};
