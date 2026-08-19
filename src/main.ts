import { injectBaseStyle } from "./core/dom";
import { createRouter } from "./core/router";
import { createHotkeys } from "./core/keys";
import { createRegistry } from "./core/registry";
import { startObserver } from "./core/observe";
import { info, log } from "./core/log";
import { backlogGrid } from "./features/backlog-grid";
import { backlogStatus } from "./features/backlog-status";
import { backlogToolbar } from "./features/backlog-toolbar";
import { boardDensity } from "./features/board-density";
import { cardComments } from "./features/card-comments";
import { chromeDensity } from "./features/chrome-density";
import { prActions } from "./features/pr-actions";
import { prChecks } from "./features/pr-checks";
import { prComments } from "./features/pr-comments";
import { prDiffTotals } from "./features/pr-diff-totals";
import { prDrafts } from "./features/pr-drafts";
import { prKeynav } from "./features/pr-keynav";
import { prOverview } from "./features/pr-overview";
import { prReviewed } from "./features/pr-reviewed";
import { prThreadFilter } from "./features/pr-thread-filter";
import { sprintHeader } from "./features/sprint-header";
import { taskboardColumns } from "./features/taskboard-columns";
import { workitemLayout } from "./features/workitem-layout";
import { workitemState } from "./features/workitem-state";

declare global {
  interface Window {
    __adofix?: boolean;
  }
}

(function bootstrap(): void {
  if (window.__adofix) return;
  window.__adofix = true;

  // Tokens + .adofix-surface before any feature sheet, so feature rules win
  // equal-specificity ties against the recipe.
  injectBaseStyle();

  const router = createRouter();
  const hotkeys = createHotkeys(() => router.current());
  const registry = createRegistry(hotkeys, () => router.current());

  registry.register(boardDensity);
  registry.register(chromeDensity);
  registry.register(workitemLayout);
  registry.register(cardComments);
  registry.register(backlogToolbar);
  registry.register(backlogGrid);
  registry.register(backlogStatus);
  registry.register(sprintHeader);
  registry.register(taskboardColumns);
  registry.register(prKeynav);
  registry.register(prOverview);
  registry.register(prThreadFilter);
  registry.register(prDrafts);
  // After prDrafts: both adorn header .justify-end via insertBefore(firstChild),
  // so later registration puts the reviewed checkbox left of "Comment on file".
  registry.register(prReviewed);
  registry.register(prDiffTotals);
  registry.register(prComments);
  registry.register(prChecks);
  registry.register(prActions);
  registry.register(workitemState);

  hotkeys.install();
  router.onChange((route) => {
    log("router", route.area, route.path);
    registry.applyAll(route);
  });
  // DOM settle: recheck() catches SPA navigations the history patch missed
  // (sandboxed userscript contexts) and notifies onChange — which applies.
  // A settle without a route change still needs a plain re-apply.
  startObserver(() => {
    if (!router.recheck()) registry.applyAll(router.current());
  });
  // Dispatches the initial route through onChange.
  router.start();

  // The one always-on line: proves which build is running (stale-install
  // debugging). Detail logging: localStorage.setItem("adofix.debug", "1").
  info(
    `ado-unfuck v${__ADOFIX_VERSION__} active`,
    "— features: board-density, chrome-density, workitem-layout, card-comments, backlog-toolbar, backlog-grid, backlog-status, sprint-header, taskboard-columns, pr-keynav, pr-overview, pr-thread-filter, pr-drafts, pr-reviewed, pr-diff-totals, pr-comments, pr-checks, pr-actions, workitem-state"
  );
})();
