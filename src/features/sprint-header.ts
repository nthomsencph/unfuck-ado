import { scopeSelector, type Feature } from "../core/registry";
import type { Route } from "../core/router";
import {
  injectStyleOnce,
  stubHide,
  syncCommandProxies,
  type CommandProxySpec,
} from "../core/dom";
import { log } from "../core/log";
import { formatBacklogStatus, parseBacklogFilters, resolveTotal } from "./boards/status";
import { sprintScopeKey, sprintTab } from "./boards/paths";

/**
 * Sprints hub header compressed to two rows (user request 2026-08-18, the
 * Backlogs treatment transplanted):
 *  - "Create Query" removed; "New Work Item" (removed until 2026-11-02 — the
 *    only way to create an item here) and "Column Options" become icon
 *    proxies next to Filter (native ids differ per tab: taskboard uses
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
 * Scoped per tab via the registry page scope (data-adofix-sprint-header="<tab>"). Offsets measured
 * live 2026-08-18 with chrome-density active; the icon lift uses
 * position:relative top (a margin-top lift is partially absorbed by the
 * header's flex layout — measured -76px margin moving the bar only 13px).
 */
const FEATURE_ID = "sprint-header";

const SCOPE = scopeSelector(FEATURE_ID);
const tabScope = (tab: string): string => scopeSelector(FEATURE_ID, tab);
const STATUS_CLASS = "adofix-sprint-status";

/** Commands proxied next to Filter, per sprints tab (native ids differ). */
const PROXIES_BY_TAB: Record<string, readonly CommandProxySpec[]> = {
  taskboard: [
    ["__bolt-taskboard-new-work-item", "New work item"],
    ["__bolt-taskboard-column-options", "Column options"],
  ],
  backlog: [
    ["__bolt-new-work-item", "New work item"],
    ["__bolt-column-options", "Column options"],
  ],
};

const CSS = `
/* Stubs, not display:none — see backlog-toolbar (bolt evicts display:none
   commandbar items from the DOM on the _backlogs page; on _sprints it merely
   hides them, but the stub is safe in both worlds). */
${stubHide(`${SCOPE} #__bolt-taskboard-new-work-item,
${SCOPE} #__bolt-taskboard-column-options,
${SCOPE} #__bolt-new-work-item,
${SCOPE} #__bolt-column-options,
${SCOPE} #__bolt-create-query`)}
${SCOPE} #__bolt-tab-analytics,
${SCOPE} #__bolt-tab-capacity {
  display: none !important;
}
/* Title-row commandbar buttons pinned to the title's centerline (same
   bottom-parking fix as the backlogs title row). */
${SCOPE} .wit-sprints-header-row .bolt-header-commandbar-button-group {
  align-items: flex-start !important;
}
${SCOPE} .wit-sprints-header-row .bolt-header-command-item-button.bolt-expandable-button {
  margin-top: 0 !important;
}
/* The dates block and burndown mini-widget leave the header; their text
   lives on as the title-row status span. */
${SCOPE} .sprints-header-dates > .flex-row:has(.sprint-dates-button) {
  display: none !important;
}
${SCOPE} .sprints-tabbar-header .bolt-tabbar {
  background: transparent !important;
}
@media (min-width: 900px) {
  /* Icon commandbar onto the title row — Taskboard and Backlog only
     (Capacity keeps Add user/Save/Revert up there). */
  ${tabScope("taskboard")} .sprints-tabbar-header-commandbar.bolt-header-commandbar,
  ${tabScope("backlog")} .sprints-tabbar-header-commandbar.bolt-header-commandbar {
    position: relative;
    /* Centers the icons on the title row's centerline (live 2026-11-02).
       Independent of the title padding (chrome.css --adofix-title-pad):
       the lifted rows hang below the header, which grows with it —
       verified live at 20px and 30px. */
    top: -36px;
    z-index: 3;
  }
  /* Sprint/person pickers right-aligned on the TITLE row (user request
     2026-08-18), left of the lifted icons (310px right padding clears them).
     margin-top -38px collapses the pickers' old row for the content below;
     the remaining 32px up to the title line comes from relative top so the
     filter bar does not ride up over the tabs. Click-through except on the
     pickers themselves. */
  ${tabScope("taskboard")} .sprints-header-dates,
  ${tabScope("backlog")} .sprints-header-dates {
    margin-top: -38px !important;
    justify-content: flex-end;
    /* Clears the icon group: 360px on the Backlog tab; the taskboard's
       group also holds taskboard-columns' button (set below). Was 310
       before that button existed — the pickers overlapped, user 2026-08-18. */
    padding-right: 360px;
    position: relative;
    top: -32px;
    z-index: 4;
    pointer-events: none;
  }
  /* 400px: the New work item proxy (2026-11-02) widened the taskboard's
     group past 360px (pickers overlapped the icons by 4px, measured). */
  ${tabScope("taskboard")} .sprints-header-dates {
    padding-right: 400px;
  }

  /* The Backlog tab's tab row sits 2px lower than the taskboard's, so its
     lifts are 2px longer (centerlines measured equal live 2026-11-02). */
  ${tabScope("backlog")} .sprints-tabbar-header-commandbar.bolt-header-commandbar {
    top: -38px;
  }
  ${tabScope("backlog")} .sprints-header-dates {
    top: -34px;
  }
  /*
   * Filter bar inline with the tabs, Taskboard AND Backlog tabs (user
   * requests 2026-08-18). On the taskboard the bar
   * lives INSIDE .page-content, an overflow:auto scroll container — any
   * overlay lift (negative margin/relative top) above the container's top
   * edge gets CLIPPED, which is why the pickers' lift pattern cannot work
   * here. Instead the space above it collapses: the dates row pulls the
   * whole content block up 54px, but ONLY while a filter bar exists (:has),
   * so toggling the filter off never drags the board under the tabs. The
   * tab header spans the shared row — click-through except tabs/commandbar.
   */
  ${tabScope("taskboard")} .sprints-header-dates:has(~ * .vss-FilterBar) {
    margin-bottom: -54px !important;
  }
  ${tabScope("taskboard")} div.padding-vertical-16:has(> .vss-FilterBar) {
    padding: 2px 0 2px 330px !important;
  }
  /* Backlog tab, same treatment, own geometry (measured live 2026-08-18):
     its filter bar mounts in .page-content-top (16px top padding, NOT the
     taskboard's padding-vertical-16 wrapper), and trimming that to 2px
     supplies 14 of the 52px lift, so the dates row collapses only -38px. */
  ${tabScope("backlog")} .sprints-header-dates:has(~ * .vss-FilterBar) {
    margin-bottom: -38px !important;
  }
  ${tabScope("backlog")} .page-content-top:has(> .vss-FilterBar) {
    padding: 2px 0 0 330px !important;
  }
  /* The compact filter cluster parks at the row's right edge (user
     2026-08-18) — left-packed it floated mid-row next to the tabs. */
  ${tabScope("taskboard")} .vss-FilterBar--list,
  ${tabScope("backlog")} .vss-FilterBar--list {
    justify-content: flex-end;
  }
  ${tabScope("taskboard")} .sprints-tabbar-header,
  ${tabScope("backlog")} .sprints-tabbar-header {
    pointer-events: none;
  }
  ${tabScope("taskboard")} .sprints-tabbar-header [role="tab"],
  ${tabScope("taskboard")} .sprints-tabbar-header .bolt-header-commandbar,
  ${tabScope("backlog")} .sprints-tabbar-header [role="tab"],
  ${tabScope("backlog")} .sprints-tabbar-header .bolt-header-commandbar {
    pointer-events: auto;
  }
  /* The pickers/icons overlay the title row from a separate layer, so flex
     can't shrink the status text against them — reserve their width so the
     status ellipsizes instead of sliding underneath (user 2026-08-18). */
  ${tabScope("backlog")} .wit-sprints-header-row .bolt-header-title-row {
    padding-right: 620px;
  }
  /* +40px with the pickers' taskboard reserve above. */
  ${tabScope("taskboard")} .wit-sprints-header-row .bolt-header-title-row {
    padding-right: 660px;
  }
  /* Capacity keeps its title row for Add user/Save/Revert — the pickers go
     into the tab row's free middle instead (300px clears the tabs). */
  ${tabScope("capacity")} .sprints-header-dates {
    margin-top: -38px !important;
    padding-left: 300px;
    position: relative;
    z-index: 3;
    pointer-events: none;
  }
  ${SCOPE} .sprints-header-dates > * {
    pointer-events: auto;
  }
}
/* The dates read as status text; hover shows they are a button. */
.adofix-sprint-dates {
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}
.adofix-sprint-dates:hover {
  color: var(--fgColor-accent);
  text-decoration: underline;
}
.${STATUS_CLASS} {
  margin-left: 16px;
  font-size: var(--text-body-size-medium);
  color: var(--fgColor-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
  align-self: center;
}
`;

/** "/{org}/{project}/_sprints/{tab}/…" → the tab segment, or null. */
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
  let countText: string | null = null;
  if (shown !== null) {
    const total = resolveTotal(FEATURE_ID, sprintScopeKey(path), shown, filtered);
    countText = formatBacklogStatus(shown, total, filters);
  }

  const dates = document.querySelector(".sprint-dates-button")?.textContent?.trim() || null;
  const remaining =
    document.querySelector(".sprints-header-dates .text-right")?.textContent?.trim() || null;
  renderStatus(row, [countText, dates, remaining]);
}

/**
 * The status line: "Showing n items · <dates> · n work days remaining".
 * The dates part is a button that clicks ADO's own (hidden) dates button,
 * so the sprint's dates stay editable from the header (D67; the native
 * row left the header 2026-08-18 and took the only way in with it).
 * Rebuilt only when the text changes — this runs on every settle.
 */
function renderStatus(row: HTMLElement, [count, dates, remaining]: (string | null)[]): void {
  const key = [count, dates, remaining].join("\u0000");
  if (!count && !dates && !remaining) return;
  let host = row.querySelector<HTMLElement>(`:scope .${STATUS_CLASS}`);
  if (!host) {
    host = document.createElement("span");
    host.className = STATUS_CLASS;
    row.appendChild(host);
  }
  if (host.dataset["key"] === key) return;
  host.dataset["key"] = key;
  host.textContent = "";
  const parts: (string | Node)[] = [];
  if (count) parts.push(count);
  if (dates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "adofix-sprint-dates";
    btn.textContent = dates;
    btn.title = "Edit sprint dates";
    btn.addEventListener("click", () =>
      document.querySelector<HTMLElement>(".sprint-dates-button")?.click()
    );
    parts.push(btn);
  }
  if (remaining) parts.push(remaining);
  parts.forEach((part, i) => {
    if (i > 0) host.append(" \u00b7 ");
    host.append(part);
  });
}

function applyProxies(tab: string): void {
  const filter = document.getElementById("__bolt-filter");
  // Tab switches re-target the proxies; tabs without any (Capacity) drop them.
  if (filter && syncCommandProxies(filter, PROXIES_BY_TAB[tab] ?? []))
    log(FEATURE_ID, "command proxies injected", tab);
}

export const sprintHeader: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  scope: (route) => sprintTab(route.path) ?? false,
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const tab = sprintTab(route.path);
    if (!tab) return;
    applyStatus(tab, route.path);
    applyProxies(tab);
  },
};
