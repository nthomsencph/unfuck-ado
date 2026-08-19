import type { Feature } from "../core/registry";
import { parseHubPath, type Route } from "../core/router";
import { ensureText, injectStyleOnce } from "../core/dom";
import { formatBacklogStatus, parseBacklogFilters, resolveTotal } from "./boards/status";
import { backlogScopeKey } from "./boards/paths";

/**
 * Status text in the Backlogs header row (user request 2026-08-18: it is hard
 * to keep track of what area/iteration the backlog is showing). Sits in the
 * title row, left-aligned after the team name, and reads e.g.
 *   Showing 176 items — filtered to State: Active, New +2 · Area: AI Platform
 * Data sources, both verified live 2026-08-18:
 *  - the grid is VIRTUALIZED (never count tbody rows) but the treegrid
 *    carries aria-rowcount; it includes the header row (data rows start at
 *    aria-rowindex 2, the last equals aria-rowcount), so items = count - 1.
 *    Collapsed subtrees are not rows — this is what the list can scroll to.
 *  - active filters live in the query string: `System.*` params (values
 *    comma-separated; Area/Iteration values are backslash paths) plus `text`
 *    for the keyword box. No filter param → dimension unfiltered.
 * The unfiltered total ("n of m") is CAPTURED FROM THE VIEW, not fetched:
 * whenever the backlog renders with no filters active, aria-rowcount is the
 * total, and it is stored per org/project/team/level (GM storage, survives
 * reloads); filtered visits then render "n of m" from the stored value.
 * REST was measured and rejected (2026-08-18): the team backlog endpoints
 * (Σ _apis/work/backlogs/{level}/workItems = 197) disagree with the
 * unfiltered view (255+) — the view includes Done items and off-area
 * parents the endpoints exclude, so a REST m would read absurd next to a
 * view-derived n. Trade-offs of capture: m lags until the user next clears
 * filters, and both n and m track the tree's EXPANSION state (collapsed
 * subtrees leave both counts; a stale m < n is suppressed rather than shown).
 */
const FEATURE_ID = "backlog-status";

const STATUS_CLASS = "adofix-backlog-status";

const CSS = `
.${STATUS_CLASS} {
  margin-left: 16px;
  font-size: 13px;
  color: var(--text-primary-color, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
  /* the title row is flex-baseline — a 13px baseline against the 16px title
     reads too low; center on the row's height instead */
  align-self: center;
}
`;

export const backlogStatus: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    if (parseHubPath(route.path).hub !== "_backlogs") return;
    const row = document.querySelector<HTMLElement>(
      ".wit-backlogs-header-row .bolt-header-title-row"
    );
    const rowcount = document
      .querySelector("table.backlog-tree")
      ?.getAttribute("aria-rowcount");
    if (!row || !rowcount) return;
    const shown = Number(rowcount) - 1; // aria-rowcount includes the header row
    if (!Number.isFinite(shown) || shown < 0) return;

    const filters = parseBacklogFilters(location.search);
    const filtered = filters.entries.length > 0 || filters.keyword !== null;
    const total = resolveTotal(FEATURE_ID, backlogScopeKey(route.path), shown, filtered);
    ensureText(row, STATUS_CLASS, formatBacklogStatus(shown, total, filters));
  },
};
