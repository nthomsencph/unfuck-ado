# GitHub makeover — stage 2: the global frame

**Date:** 2026-11-02
**Status:** approved direction (user, 2026-11-02); details are the
autonomous run's calls, logged in `docs/plans/design-decisions-frame.md`.
Builds on stage 1 (`2026-11-02-github-foundation-design.md`).

## Why

Stage 1 made every page GitHub-colored; the frame around every page — ADO's
top header and left rail — is still ADO in shape and icons. Stage 2 makes
that frame read as GitHub's.

## User decisions

- **Rail stays**, restyled GitHub-like (not replaced by a GitHub tab bar).
- **Sub-pages** (Boards → Work items/Boards/Backlogs/Sprints/Queries; Repos →
  Files/Commits/Pushes/Branches/Tags/Pull requests; …) open in a **GitHub-style
  dropdown menu** from the rail item, instead of ADO's flyout / inline list.
- **Search:** a GitHub-style "Type / to search" box in the header, opening
  ADO's own search; `/` focuses it (outside inputs, like every adofix
  hotkey). Replaces the 2026-08-18 rule that hid ADO's search entirely.
- **Release:** push + public release after the dark + light live check.

## Calls made autonomously (see decision log)

- **Header** (`.region-header` + `.region-header-menubar`): GitHub's app
  header material — `--header-bgColor`-family tokens if Primer ships them,
  otherwise `--bgColor-inset`; bottom hairline `--borderColor-default`.
  Height stays ADO's 48px (sticky offsets elsewhere depend on it).
- **Logo:** ADO's logo kept (no GitHub branding on ADO), rendered
  monochrome in `--fgColor-default`.
- **Breadcrumbs:** GitHub's "owner / repo" style — 14px, muted `/`
  separators, last crumb semibold, hover underline; repo selector caret as an
  octicon.
- **Header icon buttons** (settings, help, notifications, …): GitHub's
  bordered 32px icon buttons (`gh-btn` + icon-only variant), avatar round.
- **Rail:** 48px collapsed width kept; hub icons become Octicons (Overview
  `home`, Boards `project`, Repos `repo`, Pull requests `git-pull-request`,
  Pipelines `rocket`, Test Plans `beaker`, Artifacts `package`, Project
  settings `gear`, Create `plus`, expand toggle `sidebar-expand`/`-collapse`;
  sub-pages get matching octicons in the dropdown). Hover
  `--control-transparent-bgColor-hover`; selected item: GitHub ActionList
  selected look (`--control-transparent-bgColor-selected` + 4px
  `--borderColor-accent-emphasis` bar on the left edge, 6px radius inset).
  Contributed/extension icons without a mapping keep ADO's image.
- **Dropdown:** a `gh-menu` anchored to the rail item's right edge, listing
  the group's sub-pages (octicon + label, current page selected),
  keyboard-navigable via `core/popover`. Source of the links: ADO's own DOM
  (the inline list / ADO's flyout content) — no new REST, no hard-coded URL
  table. The inline sub-page list under the current group is hidden.
  Opening: click on the rail item's caret area / hover after a short delay,
  matching ADO's existing hover affordance; plain click on the item still
  navigates to the group's default page (ADO behavior).

## Non-goals

- No GitHub tab bar, no layout change of page content, no new REST calls.
- The org-level (non-project) pages and ADO's settings pages get only what
  the shared header/rail rules give them.

## Verification

- Unit tests for any pure logic (icon mapping, link extraction from ADO
  nodes, menu model).
- Live (dark, then light with the ADO theme switched and restored):
  header + rail on PR list, PR files, Kanban board, work item, repo files;
  each rail group's dropdown opens, lists the right sub-pages, navigates;
  `/` focuses search, Escape closes; search submits to ADO's search page.
- Side by side with GitHub's header (github.com/primer/react) — reads as the
  same product at a glance.
