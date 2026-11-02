import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery } from "../core/dom";
import { log } from "../core/log";
import { octicon, octiconMask, type OcticonName } from "../core/primer";
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
 * The checks box is the .status-details-container holding the "View n
 * checks" row (.status-details-container-row). It holds a
 * .preview-check-list table only when the PR has build policies — without
 * them the box is just the link (PR 7339, live 2026-11-02), and anchoring
 * on the table left those PRs with the link alone. The "Merged PR …"
 * commit box is a sibling container holding .repos-commits-table instead.
 */
const CHECK_BOX_SELECTOR =
  ".repos-pr-details-page .shadow-padding .status-details-container:has(> .status-details-container-row):not(:has(.repos-commits-table))";

/**
 * Native ADO status drawings in the merge-status card (svg.bolt-status:
 * the big summary icons, the build-policy rows, "No merge conflicts")
 * repainted as the same filled octicons our rows use, so every check in
 * the card shows one success and one failure glyph (user request
 * 2026-11-02, GitHub's check-circle-fill / x-circle-fill). The svgs are
 * React-owned, so the octicon is a CSS mask over the svg box and its own
 * circle/path children are hidden — nothing is added to the DOM. Scope:
 * the Overview column outside the activity feed (timeline vote icons and
 * the reviewer list keep ADO's drawings).
 */
const NATIVE_STATUS =
  ".repos-pr-details-page .shadow-padding .bolt-card svg.bolt-status:not(.bolt-timeline-cell *)";

let cssText: string | undefined;
const css = (): string => `
${NATIVE_STATUS}:is(.success, .failed) > * { display: none; }
${NATIVE_STATUS}.success {
  background-color: var(--fgColor-success);
  -webkit-mask: ${octiconMask("check-circle-fill", 24)} center / contain no-repeat;
  mask: ${octiconMask("check-circle-fill", 24)} center / contain no-repeat;
}
${NATIVE_STATUS}.failed {
  background-color: var(--fgColor-danger);
  -webkit-mask: ${octiconMask("x-circle-fill", 24)} center / contain no-repeat;
  mask: ${octiconMask("x-circle-fill", 24)} center / contain no-repeat;
}
/* The 16px row icons use the 16px drawings (octicons are tuned per size). */
${NATIVE_STATUS}.success:not(.margin-4) {
  -webkit-mask-image: ${octiconMask("check-circle-fill")};
  mask-image: ${octiconMask("check-circle-fill")};
}
${NATIVE_STATUS}.failed:not(.margin-4) {
  -webkit-mask-image: ${octiconMask("x-circle-fill")};
  mask-image: ${octiconMask("x-circle-fill")};
}
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
  approved: { name: "check-circle-fill", tone: "success" },
  rejected: { name: "x-circle-fill", tone: "danger" },
  queued: { name: "dot-fill", tone: "attention" },
  running: { name: "dot-fill", tone: "attention" },
};
const NEUTRAL_ICON = { name: "dot-fill", tone: "muted" } as const;

// Latching (the default) is load-bearing here: see core/fetch-cache.ts.
const rowsByPr = createFetchCache<string, CheckRow[]>();

function render(rows: CheckRow[]): void {
  const container = safeQuery<HTMLElement>(CHECK_BOX_SELECTOR);
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
    injectStyleOnce(FEATURE_ID, (cssText ??= css()));
    const ref = prRefFromRoute(route);
    if (!ref) return;
    if (!safeQuery(CHECK_BOX_SELECTOR)) return; // Overview checks box not up
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
