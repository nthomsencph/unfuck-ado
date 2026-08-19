import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery } from "../core/dom";
import { log } from "../core/log";
import {
  fetchPolicyEvaluations,
  selectInlineChecks,
  statusText,
  type CheckRow,
} from "./pr/checks-api";
import { prRefFromRoute, refKey } from "./pr/threads-api";
import { createFetchCache } from "../core/fetch-cache";

/**
 * All checks inline in the PR Overview status card. ADO's checks box shows
 * only Build policies plus a "View n checks" link — a failed optional check
 * ("Comments must be resolved", "Work items must be linked") is invisible
 * until the panel is opened. This renders the hidden evaluations as rows
 * below the native ones and hides the then-redundant "View n checks" link
 * (Re-queue lives on the build row itself, so nothing is lost).
 */
const FEATURE_ID = "pr-checks";

/**
 * The checks box is the .status-details-container holding the
 * .preview-check-list table (verified live 2026-08-17 on PR 6970); the
 * "Merged PR …" commit box is a sibling container whose table is
 * .repos-commits-table instead.
 */
const CHECK_LIST_SELECTOR =
  ".repos-pr-details-page .shadow-padding .status-details-container > .preview-check-list";

const CSS = `
.adofix-check-row {
  display: flex; align-items: center; gap: 8px;
  /* 18px left puts our icon pixel-identical to the native row's (measured
     live 2026-08-17); with the 8px gap the labels line up like ADO's. */
  padding: 5px 16px 5px 18px; font-size: 14px;
}
.adofix-check-row svg { flex-shrink: 0; }
.adofix-check-status { color: var(--text-secondary-color, #a19f9d); }
/* Once every check is inline the "View n checks" row is redundant (Re-queue
   lives on the build row itself). Class is added only after rows render.
   The hidden row also carried the box's bottom breathing room — restore it. */
.adofix-checks-inline > .status-details-container-row { display: none; }
.adofix-checks-inline { padding-bottom: 8px; }
`;

/**
 * ADO's own bolt-status geometry and palette, copied verbatim from the live
 * DOM (2026-08-17) so our rows are indistinguishable from native ones.
 */
const ICONS: Record<string, string> = {
  approved:
    '<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="16" fill="#55a362"></circle>' +
    '<path fill="#fff" d="M12.799 20.83l-.005-.003L9.94 17.97a1.5 1.5 0 1 1 2.121-2.12l1.8 1.798 6.209-6.21a1.5 1.5 0 1 1 2.12 2.122l-7.264 7.264-.005.006a1.5 1.5 0 0 1-2.121 0z"></path></svg>',
  rejected:
    '<svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true">' +
    '<circle cx="6" cy="6" r="6" fill="#cd4a45"></circle>' +
    '<path fill="#fff" d="M3.64 3.64a.75.75 0 0 1 1.06 0l1.294 1.294L7.288 3.64a.75.75 0 0 1 1.06 1.06L7.056 5.994l1.292 1.292a.75.75 0 0 1-1.06 1.06l-1.295-1.29-1.291 1.291a.75.75 0 1 1-1.06-1.06l1.292-1.293L3.64 4.7a.75.75 0 0 1 0-1.06z"></path></svg>',
};
// Queued/running/broken have no sampled geometry — a neutral dot; the status
// text carries the meaning.
const NEUTRAL_ICON =
  '<svg width="16" height="16" viewBox="0 0 12 12" aria-hidden="true">' +
  '<circle cx="6" cy="6" r="6" fill="#8a8886"></circle></svg>';

// Latching (the default) is load-bearing here: see core/fetch-cache.ts.
const rowsByPr = createFetchCache<string, CheckRow[]>();

function render(rows: CheckRow[]): void {
  const table = safeQuery<HTMLElement>(CHECK_LIST_SELECTOR);
  if (!table) return;
  const container = table.parentElement;
  if (!container) return;
  // React may rebuild the card between settles; re-render only when our rows
  // are missing.
  if (container.querySelector(".adofix-check-row")) return;
  // Insert between the native check rows and the "View n checks" row.
  const viewRow = container.querySelector(":scope > .status-details-container-row");
  for (const row of rows) {
    const el = document.createElement("div");
    el.className = "adofix-check-row";
    el.innerHTML = ICONS[row.status] ?? NEUTRAL_ICON;
    const name = document.createElement("span");
    name.textContent = row.label;
    const status = document.createElement("span");
    status.className = "adofix-check-status body-s";
    status.textContent = `${statusText(row.status)} · ${row.required ? "Required" : "Optional"}`;
    el.append(name, status);
    container.insertBefore(el, viewRow);
  }
  if (rows.length > 0) container.classList.add("adofix-checks-inline");
}

export const prChecks: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    if (!ref) return;
    if (!safeQuery(CHECK_LIST_SELECTOR)) return; // Overview checks box not up
    const key = refKey(ref);
    const cached = rowsByPr.get(key);
    if (cached) {
      render(cached);
      return;
    }
    if (rowsByPr.begin([key]).length === 0) return;
    void fetchPolicyEvaluations(ref).then((res) => {
      if (!res.ok) {
        rowsByPr.fail([key]);
        log(FEATURE_ID, "fetch failed — not retrying this page load", res.error);
        return;
      }
      const rows = selectInlineChecks(res.value);
      rowsByPr.settle(key, rows);
      log(FEATURE_ID, `${rows.length} hidden check(s) for ${key}`);
      render(rows);
    });
  },
};
