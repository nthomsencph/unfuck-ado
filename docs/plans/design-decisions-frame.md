# Design decisions — GitHub makeover stage 2, global frame (autonomous run, 2026-11-02)

Decisions made on the user's behalf while building
`docs/specs/2026-11-02-github-frame-design.md`. **PROVISIONAL** entries first
in review.

## F1 — Spec written autonomously from four user answers
- **Context:** user chose: keep the rail (restyled), sub-pages in a
  GitHub-style dropdown from rail items, GitHub search box + `/`, release
  after live check. Everything else in the spec is my call.

## F2 — No GitHub logo
- **Decision:** ADO's logo stays (monochrome). Putting GitHub's mark on ADO
  would misrepresent whose product it is; the frame reads as GitHub through
  material, type and icons instead.

## F3 — Header keeps ADO's 48px height
- **Decision:** GitHub's header is 64px, but ADO's sticky page headers and
  scroll containers are positioned against 48px; changing it risks layout
  breakage across every hub for little visual gain.

## F4 — Dropdown links come from ADO's DOM
- **Decision:** no hard-coded hub URL table and no REST; the menu is built
  from ADO's own rendered sub-hub links, so contributed hubs and permission
  differences come along for free.

## F5 — Header material is `--bgColor-inset`, not Primer's `--header-*` tokens — **PROVISIONAL**
- **Context:** the spec said "`--header-bgColor`-family tokens if Primer
  ships them, otherwise `--bgColor-inset`". Primer 11.10 ships them, but
  they are the legacy always-dark header: in the LIGHT theme
  `--header-bgColor` is `#25292e` (dark) with `#ffffffb3` text.
- **Decision:** `--bgColor-inset` + a 1px `--borderColor-default` bottom
  hairline, which is what today's github.com AppHeader uses in both modes
  (the gh-5 reference). With `--header-*`, the light theme would get a dark
  bar whose ADO breadcrumbs/buttons paint in light-theme text colors.
- **Check in the light pass:** header reads as GitHub's light header.

## F6 — The rail shares the header's material — **PROVISIONAL**
- **Decision:** `.project-navigation` on `--bgColor-inset` with a 1px right
  hairline, so header + rail read as one L-shaped frame around the
  `--bgColor-default` page (GitHub has no rail; its sidebars sit on canvas
  with a hairline). Items: a 6px-radius plate inset 4px/6px inside ADO's
  48px rows (heights unchanged), hover `--control-transparent-bgColor-hover`,
  current group `-selected` + a 4px `--borderColor-accent-emphasis` bar on
  the rail's left edge. Icons 16px (GitHub's nav size), muted; current
  group's icon `--fgColor-default`.
- **Alternative:** rail on canvas (`--bgColor-default`). One-line change if
  the light pass prefers it.

## F7 — Dropdown opening: hover is passive, keyboard/caret take focus
- **Decision:** hovering a rail group opens its menu after 250ms and closes
  it 300ms after the pointer leaves both item and menu (ADO's own flyout was
  hover-driven, spec: "matching ADO's existing hover affordance"). A hover
  menu never takes focus (`takeFocus: false`) and never takes keys from a
  focused text field — moving the mouse over the rail while typing must not
  steal the caret. The caret button (right edge of the item, visible on
  hover) and ArrowRight on the focused item open it WITH focus on the
  current (else first) row; Escape returns focus to the item.
- **Core change:** `core/popover` gained `placement: "right-start"` and
  `takeFocus`; on close it now restores focus to the anchor only if focus
  was inside the menu. Existing popovers always hold focus while open, so
  their behavior is unchanged.
- The rail also listens to `mousemove` (a pointer resting on an item when
  the page settles never fires `mouseenter`; also the only event the live
  test harness synthesizes).

## F8 — Navigation clicks ADO's own link
- **Decision:** a menu row is a real `<a href>` (middle/modifier clicks open
  tabs natively), but a plain click clicks ADO's own link — the hidden
  inline list's, or the flyout row's — resolved by id at click time, so
  ADO's router navigates in-app (verified live: same document). When the
  flyout is gone (the pointer left the rail), the feature re-renders it by
  a synthetic hover on ADO's trigger first; if it never appears, a plain
  page load to the `href`.
- ADO's flyout is hidden with `visibility: hidden` + `pointer-events: none`,
  not `display: none`, so it keeps rendering its links (F4's source).

## F9 — Menu content
- **Decision:** a muted heading with the group name (the collapsed rail has
  no labels; the menu says where you are), then Octicon + label rows. The
  current page uses the NavList selected look (tint + accent bar, as on the
  rail) rather than ActionMenu's checkmark — it's navigation, not a choice.
  Sub-pages without an Octicon mapping (extensions, e.g. "Tags" by
  YodLabs) show ADO's own icon, cloned. Single-hub groups (Artifacts) get
  no dropdown or caret.

## F10 — Search restyles ADO's own box
- **Decision:** no adofix input — ADO's `.expandable-search-header` becomes
  GitHub's 272×32 "Type [/] to search" box (hint overlay, blank
  placeholder), keeping ADO's suggestions callout and its submit to
  `_search` (verified live). `/` focuses it (`github-frame.search`, like
  every adofix hotkey: outside inputs only); Escape blurs it. ADO's
  suggestions callout keeps ADO's own layout (550px, anchored under the
  box) — restyling it is out of scope.

## F11 — Icon choices — **PROVISIONAL** (taste)
- Rail: per spec. Header: My Work `tasklist`, Marketplace `apps`, Help
  `question`, User settings `gear` (same glyph as Project settings in the
  rail; ADO's own is a person-with-gear, which Octicons lacks). Breadcrumb
  repo selector: `repo` + `triangle-down`.
- Sub-pages: Summary `home`, Dashboards `graph`, Wiki `book`; Work items
  `issue-opened`, Boards `project`, Backlogs `list-unordered`, Sprints
  `iterations`, Queries `filter`, Delivery Plans `project-roadmap`,
  Analytics views `graph`; Files `file-code`, Commits `git-commit`, Pushes
  `repo-push`, Branches `git-branch`, Tags `tag`, Pull requests
  `git-pull-request`, Advanced Security `shield`; Pipelines `rocket`,
  Environments `server`, Releases `versions`, Library `database`, Task
  groups `stack`, Deployment groups `container`; Test plans `beaker`,
  Progress report `graph`, Parameters `sliders`, Configurations `tools`,
  Runs `play`, Exploratory sessions `telescope`.
- Mapping keys: rail groups and sub-pages by contribution id (from the
  element id); header and stand-alone rail items by Fluent glyph name —
  both locale-proof.

## F12 — Breadcrumb weight
- **Decision:** GitHub bolds only the "repo" in "owner / repo". When ADO's
  trail ends in a selector (repo, team), the selector is the repo and takes
  the semibold; otherwise the last crumb does. Every crumb is
  `--fgColor-default` (ADO painted them link-blue).

## Known gaps
- The expanded (labelled) rail was not checked live: toggling it writes a
  user preference (`verticalMenuExpanded`). The CSS is written for both.
- Real-pointer hover could not be exercised (the harness synthesizes only
  `mousemove`); the hover plate was checked via the open-menu state.

## F13 — Light pass (coordinator)
- ADO theme switched to Light, PR list header + rail checked (full-zoom
  screenshot), switched back to Dark (2026-11-02). Header/rail on
  `--bgColor-inset` with a hairline read as GitHub's light header — F5/F6
  confirmed; no change.
