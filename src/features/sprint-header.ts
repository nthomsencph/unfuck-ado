import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, makeCommandProxy } from "../core/dom";
import { log } from "../core/log";
import { getValue, setValue } from "../core/storage";
import { formatBacklogStatus, parseBacklogFilters } from "./backlog-status";

/**
 * Sprints hub header compressed to two rows (user request 2026-08-18, the
 * Backlogs treatment transplanted):
 *  - "New Work Item" and "Create Query" removed, "Column Options" becomes an
 *    icon proxy next to Filter (native ids differ per tab: taskboard uses
 *    #__bolt-taskboard-*, the sprint Backlog tab reuses the plain
 *    #__bolt-new-work-item/#__bolt-column-options ids);
 *  - the Analytics and Capacity tabs hidden (never used; the capacity page
 *    itself stays reachable by URL and keeps its Save/Revert title row);
 *  - the icon commandbar lifts onto the title row — but only on the
 *    Taskboard and Backlog tabs: Capacity keeps Add user/Save/Revert in the
 *    title row and lifting the icons would collide with them;
 *  - the sprint/person pickers lift into the tab row's free middle;
 *  - the burndown mini-widget and the dates block leave the header; the date
 *    range and days-remaining reappear as status text in the title row
 *    (mirrored from the hidden elements, which stay in the DOM and re-render
 *    when the sprint changes).
 * Scoped per tab via data-adofix-sprints="<tab>" on <html>. Offsets measured
 * live 2026-08-18 with chrome-density active; the icon lift uses
 * position:relative top (a margin-top lift is partially absorbed by the
 * header's flex layout — measured -76px margin moving the bar only 13px).
 */
const FEATURE_ID = "sprint-header";

const ATTR = "data-adofix-sprints";
const STATUS_CLASS = "adofix-sprint-status";
const BTN_CLASS = "adofix-toolbar-btn";

/** Column Options native id per sprints tab. */
const COLUMN_OPTIONS_BY_TAB: Record<string, string> = {
  taskboard: "__bolt-taskboard-column-options",
  backlog: "__bolt-column-options",
};

const CSS = `
/* Stubs, not display:none — see backlog-toolbar (bolt evicts display:none
   commandbar items from the DOM on the _backlogs page; on _sprints it merely
   hides them, but the stub is safe in both worlds). */
html[${ATTR}] #__bolt-taskboard-new-work-item,
html[${ATTR}] #__bolt-taskboard-column-options,
html[${ATTR}] #__bolt-new-work-item,
html[${ATTR}] #__bolt-column-options,
html[${ATTR}] #__bolt-create-query {
  width: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}
html[${ATTR}] #__bolt-tab-analytics,
html[${ATTR}] #__bolt-tab-capacity {
  display: none !important;
}
/* Title-row commandbar buttons pinned to the title's centerline (same
   bottom-parking fix as the backlogs title row). */
html[${ATTR}] .wit-sprints-header-row .bolt-header-commandbar-button-group {
  align-items: flex-start !important;
}
html[${ATTR}] .wit-sprints-header-row .bolt-header-command-item-button.bolt-expandable-button {
  margin-top: 0 !important;
}
/* The dates block and burndown mini-widget leave the header; their text
   lives on as the title-row status span. */
html[${ATTR}] .sprints-header-dates > .flex-row:has(.sprint-dates-button) {
  display: none !important;
}
html[${ATTR}] .sprints-tabbar-header .bolt-tabbar {
  background: transparent !important;
}
@media (min-width: 900px) {
  /* Icon commandbar onto the title row — Taskboard and Backlog only
     (Capacity keeps Add user/Save/Revert up there). */
  html[${ATTR}="taskboard"] .sprints-tabbar-header-commandbar.bolt-header-commandbar,
  html[${ATTR}="backlog"] .sprints-tabbar-header-commandbar.bolt-header-commandbar {
    position: relative;
    top: -52px;
    z-index: 3;
  }
  /* Sprint/person pickers right-aligned on the TITLE row (user request
     2026-08-18), left of the lifted icons (310px right padding clears them).
     margin-top -38px collapses the pickers' old row for the content below;
     the remaining 48px up to the title line comes from relative top so the
     filter bar does not ride up over the tabs. Click-through except on the
     pickers themselves. */
  html[${ATTR}="taskboard"] .sprints-header-dates,
  html[${ATTR}="backlog"] .sprints-header-dates {
    margin-top: -38px !important;
    justify-content: flex-end;
    /* 360px clears the icon group incl. taskboard-columns' button (was 310
       before that button existed — the pickers overlapped, user 2026-08-18) */
    padding-right: 360px;
    position: relative;
    top: -48px;
    z-index: 4;
    pointer-events: none;
  }
  /*
   * Filter bar inline with the tabs (user request 2026-08-18). The bar
   * lives INSIDE .page-content, an overflow:auto scroll container — any
   * overlay lift (negative margin/relative top) above the container's top
   * edge gets CLIPPED, which is why the pickers' lift pattern cannot work
   * here. Instead the space above it collapses: the dates row pulls the
   * whole content block up 54px, but ONLY while a filter bar exists (:has),
   * so toggling the filter off never drags the board under the tabs. The
   * tab header spans the shared row — click-through except tabs/commandbar.
   */
  html[${ATTR}="taskboard"] .sprints-header-dates:has(~ * .vss-FilterBar) {
    margin-bottom: -54px !important;
  }
  html[${ATTR}="taskboard"] div.padding-vertical-16:has(> .vss-FilterBar) {
    padding: 2px 0 2px 330px !important;
  }
  html[${ATTR}="taskboard"] .sprints-tabbar-header {
    pointer-events: none;
  }
  html[${ATTR}="taskboard"] .sprints-tabbar-header [role="tab"],
  html[${ATTR}="taskboard"] .sprints-tabbar-header .bolt-header-commandbar {
    pointer-events: auto;
  }
  /* The pickers/icons overlay the title row from a separate layer, so flex
     can't shrink the status text against them — reserve their width so the
     status ellipsizes instead of sliding underneath (user 2026-08-18). */
  html[${ATTR}="taskboard"] .wit-sprints-header-row .bolt-header-title-row,
  html[${ATTR}="backlog"] .wit-sprints-header-row .bolt-header-title-row {
    padding-right: 620px;
  }
  /* Capacity keeps its title row for Add user/Save/Revert — the pickers go
     into the tab row's free middle instead (300px clears the tabs). */
  html[${ATTR}="capacity"] .sprints-header-dates {
    margin-top: -38px !important;
    padding-left: 300px;
    position: relative;
    z-index: 3;
    pointer-events: none;
  }
  html[${ATTR}] .sprints-header-dates > * {
    pointer-events: auto;
  }
}
.${STATUS_CLASS} {
  margin-left: 16px;
  font-size: 13px;
  color: var(--text-primary-color, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
  align-self: center;
}
`;

/** "/{org}/{project}/_sprints/{tab}/…" → the tab segment, or null. */
export function sprintTab(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const hub = segments.indexOf("_sprints");
  if (hub < 0) return null;
  const tab = segments[hub + 1];
  return tab ? tab.toLowerCase() : null;
}

/**
 * Storage scope for the unfiltered total: the decoded path — it carries
 * org/project/tab/team/iteration, so each tab of each sprint remembers its
 * own total (taskboard counts tasks, backlog counts tree rows).
 */
export function sprintScopeKey(path: string): string | null {
  if (sprintTab(path) === null) return null;
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
}

/**
 * Items currently visible per tab. Taskboard: .taskboard-card count —
 * verified NOT virtualized (89 cards mounted at every scroll position,
 * 2026-08-18); parent/story cards are not .taskboard-card, so this counts
 * tasks. Backlog tab: same aria-rowcount source as backlog-status (the grid
 * IS virtualized; the count includes the header row). Capacity: no items.
 */
function shownCount(tab: string): number | null {
  if (tab === "backlog") {
    const rc = document.querySelector("table.backlog-tree")?.getAttribute("aria-rowcount");
    if (!rc) return null;
    const n = Number(rc) - 1;
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (tab === "taskboard") {
    if (!document.querySelector(".taskboard-expanded-cell")) return null;
    return document.querySelectorAll(".taskboard-card").length;
  }
  return null;
}

function applyStatus(tab: string, path: string): void {
  const row = document.querySelector<HTMLElement>(".wit-sprints-header-row .bolt-header-title-row");
  if (!row) return;

  const filters = parseBacklogFilters(location.search);
  const filtered = filters.entries.length > 0 || filters.keyword !== null;
  const shown = shownCount(tab);
  const scope = sprintScopeKey(path);
  let countText: string | null = null;
  if (shown !== null) {
    let total: number | null = null;
    if (scope && !filtered) {
      // Unfiltered view: this IS the total. Guard against the transient
      // zero-card state while the board is still loading.
      if (shown > 0 && getValue<number | null>(FEATURE_ID, scope, null) !== shown) {
        setValue(FEATURE_ID, scope, shown);
      }
    } else if (scope) {
      total = getValue<number | null>(FEATURE_ID, scope, null);
    }
    countText = formatBacklogStatus(shown, total, filters);
  }

  const dates = document.querySelector(".sprint-dates-button")?.textContent?.trim();
  const remaining = document
    .querySelector(".sprints-header-dates .text-right")
    ?.textContent?.trim();
  const text = [countText, dates, remaining].filter(Boolean).join(" · ");
  if (!text) return;
  let span = row.querySelector<HTMLElement>(`.${STATUS_CLASS}`);
  if (!span) {
    span = document.createElement("span");
    span.className = STATUS_CLASS;
    row.appendChild(span);
  }
  if (span.textContent !== text) span.textContent = text;
}

function applyProxy(tab: string): void {
  const nativeId = COLUMN_OPTIONS_BY_TAB[tab];
  const filter = document.getElementById("__bolt-filter");
  const bar = filter?.parentElement;
  if (!filter || !bar) return;
  const existing = bar.querySelector<HTMLElement>(`.${BTN_CLASS}`);
  // Tab switches re-target the proxy: replace one pointing at the wrong (or
  // a vanished) native, drop it on tabs with no Column Options at all.
  if (existing) {
    if (nativeId && existing.dataset["native"] === nativeId && document.getElementById(nativeId)) {
      return;
    }
    existing.remove();
  }
  if (!nativeId) return;
  const proxy = makeCommandProxy(nativeId, "Column options");
  if (proxy) {
    filter.insertAdjacentElement("afterend", proxy);
    log(FEATURE_ID, "column-options proxy injected", tab);
  }
}

export const sprintHeader: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const tab = sprintTab(route.path);
    if (!tab) {
      document.documentElement.removeAttribute(ATTR);
      return;
    }
    document.documentElement.setAttribute(ATTR, tab);
    applyStatus(tab, route.path);
    applyProxy(tab);
  },
};
