import type { OcticonName } from "../../core/primer/icons";

/*
 * The global frame's DOM model: which Octicon stands in for which ADO icon,
 * and the sub-page links of a rail group as ADO itself renders them (spec
 * docs/specs/2026-11-02-github-frame-design.md, F4: no URL table, no REST).
 * Selectors verified live 2026-11-02 (dark) on the PR list page:
 *  - rail group: a.hub-group#__bolt-<contribution>-link inside
 *    .hub-group-container; the CURRENT group (.displayed) renders its
 *    sub-pages inline as [role=menu] > a.hub#__bolt-<contribution>-link
 *    (label in .navigation-text, current page .displayed);
 *  - every other group renders them only on hover, into ADO's flyout
 *    .bolt-callout#__bolt-menu-<group>-callout as
 *    a.bolt-menuitem-row[role=menuitem]#__bolt-<contribution> rows (a
 *    leading [role=separator] header row carries the group name).
 */

/** "__bolt-ms-vss-code-web-files-hub-link" → "ms-vss-code-web-files-hub". */
export function contributionId(elementId: string): string | null {
  if (!elementId.startsWith("__bolt-")) return null;
  const id = elementId.slice("__bolt-".length).replace(/-link$/, "");
  return id || null;
}

/** Rail hub groups (ADO draws them as contributed <img>s). */
export const GROUP_ICONS: Readonly<Record<string, OcticonName>> = {
  "ms-vss-web-home-hub-group": "home",
  "ms-vss-work-web-work-hub-group": "project",
  "ms-vss-code-web-code-hub-group": "repo",
  "ms-vss-build-web-build-release-hub-group": "rocket",
  "ms-vss-test-web-test-hub-group": "beaker",
  "ms-azure-artifacts-hub-group": "package",
};

/** Sub-pages in the dropdown, by contribution id (ids verified live 2026-11-02). */
export const SUBHUB_ICONS: Readonly<Record<string, OcticonName>> = {
  // Overview
  "ms-vss-tfs-web-project-overview-hub": "home",
  "ms-vss-dashboards-web-dashboards-new-experience-hub": "graph",
  "ms-vss-wiki-web-overview-hub": "book",
  // Boards
  "ms-vss-work-web-new-work-items-hub": "issue-opened",
  "ms-vss-work-web-new-boards-hub": "project",
  "ms-vss-work-web-new-backlogs-hub": "list-unordered",
  "ms-vss-work-web-new-sprints-hub": "iterations",
  "ms-vss-work-web-new-queries-hub": "filter",
  "ms-vss-work-web-delivery-plans-hub": "project-roadmap",
  "ms-vss-analytics-analytics-views-hub": "graph",
  // Repos
  "ms-vss-code-web-files-hub": "file-code",
  "ms-vss-code-web-commits-hub": "git-commit",
  "ms-vss-code-web-pushes-hub": "repo-push",
  "ms-vss-code-web-branches-hub": "git-branch",
  "ms-vss-code-web-tags-hub": "tag",
  "ms-vss-code-web-new-prs-hub": "git-pull-request",
  "ms-vss-advsec-alerts-hub": "shield",
  // Pipelines
  "ms-vss-build-web-pipelines-hub": "rocket",
  "ms-vss-environments-web-environments-hub": "server",
  "ms-vss-releaseManagement-web-hub-explorer-2": "versions",
  "ms-vss-distributed-task-hub-library": "database",
  "ms-vss-distributed-task-hub-task-groups": "stack",
  "ms-vss-releaseManagement-web-hub-machinegroup": "container",
  // Test Plans
  "ms-vss-test-web-testplans-hub-refresh": "beaker",
  "ms-vss-test-analytics-web-manualtest-analytics-hub": "graph",
  "ms-vss-testmanager-web-testmanager-parameters-hub": "sliders",
  "ms-vss-testmanager-web-testmanager-configurations-hub": "tools",
  "ms-vss-test-web-testruns-hub": "play",
  "ms-vss-test-web-exploratory-sessions-hub": "telescope",
};

/**
 * ADO's Fluent font glyphs (ms-Icon--<Name>) in the rail's stand-alone items
 * and the header, keyed by glyph name — locale-proof, unlike aria-labels.
 */
export const FABRIC_ICONS: Readonly<Record<string, OcticonName>> = {
  Add: "plus",
  Settings: "gear",
  DoubleChevronRight: "sidebar-expand",
  DoubleChevronLeft: "sidebar-collapse",
  CheckList: "tasklist",
  Shop: "apps",
  Unknown: "question",
  PlayerSettings: "gear",
  GitLogo: "repo",
  ChevronDownMed: "triangle-down",
  Search: "search",
};

/** The glyph name of an ms-Icon--<Name> element, or null. */
export function fabricName(el: Element): string | null {
  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith("ms-Icon--")) return cls.slice("ms-Icon--".length) || null;
  }
  return null;
}

export interface HubLink {
  /** The native element's id — re-resolved at click time. */
  elementId: string;
  label: string;
  href: string;
  /** The page the user is on (ADO's .displayed). */
  current: boolean;
  /** Mapped Octicon; null → the menu clones `nativeIcon`. */
  icon: OcticonName | null;
  nativeIcon: Element | null;
}

const LINK_SELECTOR = 'a.hub[href], a.bolt-menuitem-row[role="menuitem"][href]';

/**
 * The sub-page links under `source` — the current group's inline list or
 * one of ADO's flyout callouts. Header/separator rows and links without an
 * id or label are skipped.
 */
export function readHubLinks(source: ParentNode): HubLink[] {
  const links: HubLink[] = [];
  for (const a of Array.from(source.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR))) {
    const label = (a.querySelector(".navigation-text")?.textContent ?? a.textContent ?? "").trim();
    const href = a.getAttribute("href") ?? "";
    if (!a.id || !label || !href) continue;
    const cid = contributionId(a.id);
    links.push({
      elementId: a.id,
      label,
      href,
      current: a.classList.contains("displayed"),
      icon: (cid && SUBHUB_ICONS[cid]) || null,
      nativeIcon: a.querySelector('.contributed-icon, [class*="ms-Icon--"], img'),
    });
  }
  return links;
}
