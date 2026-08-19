import type { Feature } from "../core/registry";
import { parseHubPath, type Route } from "../core/router";
import { injectStyleOnce } from "../core/dom";
import { getValue, setValue } from "../core/storage";

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

/** System.<field> → display label; anything unknown shows its bare name. */
const FIELD_LABELS: Record<string, string> = {
  State: "State",
  AreaPath: "Area",
  IterationPath: "Iteration",
  WorkItemType: "Type",
  AssignedTo: "Assigned to",
  Tags: "Tags",
};

export interface BacklogFilters {
  entries: Array<{ label: string; values: string[] }>;
  keyword: string | null;
}

export function parseBacklogFilters(search: string): BacklogFilters {
  const params = new URLSearchParams(search);
  const entries: BacklogFilters["entries"] = [];
  let keyword: string | null = null;
  for (const [key, value] of params) {
    if (key === "text") {
      keyword = value || null;
      continue;
    }
    if (!key.startsWith("System.")) continue;
    const field = key.slice("System.".length);
    const values = value
      .split(",")
      .map((v) => v.split("\\").pop() ?? v)
      .filter((v) => v.length > 0);
    entries.push({ label: FIELD_LABELS[field] ?? field, values });
  }
  return { entries, keyword };
}

/** "/{org}/{project}/_backlogs/backlog/{team}/{level}" → storage scope key. */
export function backlogScopeKey(path: string): string | null {
  const { org, project, hub, rest } = parseHubPath(path);
  if (hub !== "_backlogs" || rest[0] !== "backlog") return null;
  const team = rest[1];
  const level = rest[2];
  if (!org || !project || !team || !level) return null;
  return `${org}/${project}/${team}/${level}`;
}

/** "A", "B" for the first two values, then a " +n" tail. */
function valueList(values: string[], quote: boolean): string {
  const shown = values.slice(0, 2).map((v) => (quote ? `"${v}"` : v));
  const rest = values.length > 2 ? ` +${values.length - 2}` : "";
  return shown.join(", ") + rest;
}

export function formatBacklogStatus(
  shown: number,
  total: number | null,
  filters: BacklogFilters
): string {
  const filtered = filters.entries.length > 0 || filters.keyword !== null;
  const ofTotal = filtered && total !== null && total >= shown ? ` of ${total}` : "";
  let text = `Showing ${shown}${ofTotal} ${shown === 1 && ofTotal === "" ? "item" : "items"}`;
  // Area reads as part of the sentence (the user's main orientation signal);
  // every other filter trails as "Label: values" segments.
  const area = filters.entries.find((e) => e.label === "Area");
  if (area) {
    text += ` in ${area.values.length === 1 ? "area" : "areas"} ${valueList(area.values, true)}`;
  }
  const parts = filters.entries
    .filter((e) => e !== area)
    .map(({ label, values }) => `${label}: ${valueList(values, false)}`);
  if (filters.keyword) parts.push(`"${filters.keyword}"`);
  return parts.length > 0 ? `${text} · ${parts.join(" · ")}` : text;
}

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
    const scope = backlogScopeKey(route.path);
    let total: number | null = null;
    if (scope && !filtered) {
      // Unfiltered view: this IS the total — remember it for this scope.
      if (getValue<number | null>(FEATURE_ID, scope, null) !== shown) {
        setValue(FEATURE_ID, scope, shown);
      }
    } else if (scope) {
      total = getValue<number | null>(FEATURE_ID, scope, null);
    }

    let span = row.querySelector<HTMLElement>(`.${STATUS_CLASS}`);
    if (!span) {
      span = document.createElement("span");
      span.className = STATUS_CLASS;
      row.appendChild(span);
    }
    const text = formatBacklogStatus(shown, total, filters);
    if (span.textContent !== text) span.textContent = text;
  },
};
