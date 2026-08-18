import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, makeCommandProxy } from "../core/dom";
import { log } from "../core/log";

/**
 * Backlogs header cleanup (user request 2026-08-18):
 *  - "New Work Item" removed outright;
 *  - "View as Board" and "Column Options" leave the big header commandbar and
 *    become icon-only buttons in the tab row, inline with View options /
 *    Filter / Settings.
 * The natives keep stable bolt ids (#__bolt-view-as-board etc.) and are
 * STUBBED, not display:none'd: bolt's commandbar overflow logic removes
 * display:none commands from the DOM entirely (they move into the ⋮ menu,
 * verified live 2026-08-18) and our proxies would lose their click targets.
 * Zero-width invisible keeps them mounted — the pr-actions split-button
 * pattern. Proxies resolve the native BY ID AT CLICK TIME because the header
 * re-renders (and View as Board's href tracks the backlog level).
 * Scoped to the _backlogs route via an <html> attribute: the same command
 * ids exist on other Boards-hub pages where nothing was requested.
 */
const FEATURE_ID = "backlog-toolbar";

const ATTR = "data-adofix-backlogs";
const NWI = "__bolt-new-work-item";
const VAB = "__bolt-view-as-board";
const OPTS = "__bolt-column-options";
const FILTER = "__bolt-filter";
const BTN_CLASS = "adofix-toolbar-btn";

const CSS = `
html[${ATTR}] #${NWI},
html[${ATTR}] #${VAB},
html[${ATTR}] #${OPTS} {
  width: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}
/* Backlog/Analytics tabs removed outright (user request 2026-08-18: Analytics
   is never used). Plain tabs container — display:none is safe here; only
   commandbar ITEMS get evicted from the DOM when display:none'd. */
html[${ATTR}] .backlogs-tabbar-tabs {
  display: none !important;
}
/* With the tabs gone, the tabbar's space-between has one child left — pin the
   icon group right and drop the row's own grey background (bolt-tabbar-grey)
   so the title row can show through when the row is lifted. */
html[${ATTR}] .backlogs-tabbar-header .bolt-tabbar {
  background: transparent !important;
  justify-content: flex-end !important;
}
/* The title row's own commandbar (the ⋮) parks its buttons at the BOTTOM of
   the 50px row (group is align-items:flex-end + a 2px wrapper margin), 14px
   below the title's centerline. Pin it to the top instead so ⋮ centers on
   the title text — the lifted icon row below aligns to the same line. */
html[${ATTR}] .wit-backlogs-header-row .bolt-header-commandbar-button-group {
  align-items: flex-start !important;
}
html[${ATTR}] .wit-backlogs-header-row .bolt-header-command-item-button.bolt-expandable-button {
  margin-top: 0 !important;
}
/*
 * The icon row lifted onto the title row, inline with the ⋮ menu (user
 * request 2026-08-18) — the PR Files toolbar-merge pattern: pure CSS, DOM
 * stays where React put it, container is click-through so the team-name
 * dropdown underneath stays clickable. -64px puts the icons on the title
 * text's centerline (with chrome-density's 6px header padding and the ⋮
 * alignment fix above; all four centers measured equal 2026-08-18); 44px
 * right padding clears the ⋮ button (34px + rhythm gap). Below 900px the
 * title and the icon group would collide, so the row stays put (tabs stay
 * hidden at every width).
 */
@media (min-width: 900px) {
  html[${ATTR}] .backlogs-tabbar-header {
    margin-top: -64px !important;
    background: transparent !important;
    pointer-events: none;
    position: relative;
    z-index: 3;
  }
  html[${ATTR}] .backlogs-tabbar-header .bolt-header-commandbar {
    pointer-events: auto;
  }
  html[${ATTR}] .backlogs-tabbar-header .bolt-tabbar {
    padding-right: 44px !important;
  }
  /* The lifted icon row overlays the title row from a separate layer —
     reserve its width so the status text ellipsizes instead of sliding
     underneath at narrow widths. */
  html[${ATTR}] .wit-backlogs-header-row .bolt-header-title-row {
    padding-right: 440px;
  }
}
/* Filter bar: compact row tight under the one-row header, cluster parked
   right (user 2026-08-18, the sprints treatment; no tab row exists here to
   merge into). Same .page-content-top mount as the sprint Backlog tab. */
html[${ATTR}] .page-content-top:has(> .vss-FilterBar) {
  padding: 2px 0 0 !important;
}
html[${ATTR}] .vss-FilterBar--list {
  justify-content: flex-end;
}
`;


export const backlogToolbar: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const onBacklogs = route.path.includes("_backlogs");
    document.documentElement.toggleAttribute(ATTR, onBacklogs);
    if (!onBacklogs) return;

    const filter = document.getElementById(FILTER);
    const row = filter?.parentElement;
    if (!filter || !row || row.querySelector(`.${BTN_CLASS}`)) return;

    // Order after insertion: … Filter | View as board | Column options | …
    const opts = makeCommandProxy(OPTS, "Column options");
    const board = makeCommandProxy(VAB, "View as board");
    if (opts) filter.insertAdjacentElement("afterend", opts);
    if (board) filter.insertAdjacentElement("afterend", board);
    if (opts || board) log(FEATURE_ID, "proxies injected");
  },
};
