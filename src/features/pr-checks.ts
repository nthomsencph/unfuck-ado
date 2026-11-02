import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery } from "../core/dom";
import { log } from "../core/log";
import { octicon, type OcticonName } from "../core/primer";
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
  padding: 5px 16px 5px 18px; font-size: var(--text-body-size-medium);
}
.adofix-check-row .octicon { flex-shrink: 0; }
/* GitHub's checks list: icon colored by outcome, status text muted. */
.adofix-check-row[data-tone="success"] .octicon { color: var(--fgColor-success); }
.adofix-check-row[data-tone="danger"] .octicon { color: var(--fgColor-danger); }
.adofix-check-row[data-tone="attention"] .octicon { color: var(--fgColor-attention); }
.adofix-check-row[data-tone="muted"] .octicon { color: var(--fgColor-muted); }
.adofix-check-status { color: var(--fgColor-muted); font-size: var(--text-body-size-small); }
/* Once every check is inline the "View n checks" row is redundant (Re-queue
   lives on the build row itself). Class is added only after rows render.
   The hidden row also carried the box's bottom breathing room — restore it. */
.adofix-checks-inline > .status-details-container-row { display: none; }
.adofix-checks-inline { padding-bottom: 8px; }
`;

/**
 * GitHub's checks-list icons per evaluation status. Queued/running are
 * GitHub's pending dot; broken (or any unknown status) a muted dot — the
 * status text carries the meaning.
 */
const ICONS: Record<string, { name: OcticonName; tone: string }> = {
  approved: { name: "check-circle", tone: "success" },
  rejected: { name: "x-circle", tone: "danger" },
  queued: { name: "dot-fill", tone: "attention" },
  running: { name: "dot-fill", tone: "attention" },
};
const NEUTRAL_ICON = { name: "dot-fill", tone: "muted" } as const;

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
    const icon = ICONS[row.status] ?? NEUTRAL_ICON;
    el.dataset["tone"] = icon.tone;
    el.appendChild(octicon(icon.name));
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
