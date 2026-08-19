# ado-unfuck internals

The engineering ledger: per-feature implementation notes, the selector
verification status, and the architecture. **Updated with every change** —
when a feature's behavior, a selector, or the module layout moves, the
matching entry here moves with it. The user-facing overview lives in the
[README](../README.md).

## Features — boards, work items & chrome

| Feature | What it does |
|---|---|
| `board-density` | Pure CSS: tighter headers and swimlanes on Kanban boards, the card-shell margin (12px gap below every stacked card), and the board card MATERIAL (moved here from chrome-density 2026-08-19): kanban `.boards-card` + sprint `.taskboard-card` (both `.wit-card`) get `--adofix-card` surface, soft shadow, ADO's 1px grey content frame removed, 3px state flag, 20px vertical padding; canvas behind the board, `--adofix-lane` columns. |
| `chrome-density` | Pure CSS: compresses ADO's header chrome (title rows, filter bar) across hubs — ~58px reclaimed on a sprint taskboard. The top banner sits entirely on the canvas (`.region-header` AND its sibling `.region-header-menubar`, the top-right My Work/Marketplace/Help/avatar group, which natively paints its own #201f1e) with the site-wide search widget (`.expandable-search-header`) removed. Filter bars sit flat with the keyword box capped at 215px (natively it flex-grows across the whole bar) and the "Assigned to" / "Parent Work Item" filter items removed (aria-label prefix match, English-UI; an applied filter on a hidden item stays active — visible in the URL and status text). (The PR-Overview restructuring, work-item-form surfaces and board card material were carved out to `pr-overview`, `workitem-layout` and `board-density` on 2026-08-19 — this sheet is order-sensitive density chrome only.) |
| `pr-overview` | Pure CSS, PR Overview restructuring (carved out of chrome-density 2026-08-19): conversation cards (status, Description, comment threads) get page-surface background, heavier shadow and `--adofix-radius` corners with chrome divider lines removed, while non-comment feed entries ("pushed n commits") and the Reviewers/Tags/Work items sidebar sit flat against the page (tag-picker input outline removed). Reviewers render as one merged list (required first, per-row "Required"/"Optional" subtitle tags) instead of two headed groups. The discussion feed runs oldest-first with the composer at the bottom, GitHub-style (Overview feed only — the Updates tab's feed is virtualized and cannot be safely mirrored). |
| `pr-keynav` | Keyboard navigation in the PR Files view (see hotkeys). |
| `pr-thread-filter` | Hides resolved **and closed** threads (plus ADO's collapsed thread sites), leaving a placeholder per thread — click it to reveal that one. In the diff it is a compact 💬 chip; on the Overview feed it is a full-width "💬 Resolved comment thread — click to show" row sized to align with the timeline rail icon. Persisted via `GM_setValue`. Toggled from the `pr-comments` widget (its own toolbar button retired 2026-08-02). |
| `workitem-layout` | Work item form restructured GitHub-issue-style (dialog and full page): one readable main column (Description + Discussion) and a 320px right rail, capped at 1250px and centered — header rows and the State/Area subheader join the same column (the 10px type-deco stripe is dropped; the type icon + eyebrow already carry it). ADO's body is already a 3-track CSS grid with exactly three children, so the restructure is pure CSS — regrid to `minmax(0,1fr) 320px`, stack `.work-item-form-right`'s two field columns vertically, reassign grid areas. GH idioms: discussion mirrored oldest-first with the composer last (the PR-Overview column-reverse trick — the comment list is flat, not virtualized), the Description expands to its content in view mode (ADO caps the editor at 460px with an inner scrollbar; editing keeps the cap), comment cards on the card material, and rail noise removed (Deployment group, Development zero-state hint box). Second pass: Follow button, comment-count link, History/Links tabs and per-section Maximize toggles removed; every rail property renders as a `key: value` row (the label natively stacks above the control); State/Reason/Area/Iteration/Tags live in an adofix-owned "Details" group at the top of the rail with Created by/Created fetched via REST (cached per id). The native subheader controls are NOT moved — React destroys reparented nodes on any tab re-mount without re-creating them (verified live; fields gone until reload) — they become zero-size stubs (not `display:none`) and clicking an adofix row **teleports** the stub to the row's rect (inline `position:fixed`, invisible, `pointer-events:none`) and clicks it, so ADO's own edit callout opens anchored at the row; stub styles restore on the next mousedown outside the control/callout. Third pass: the Development and Implementation ("System Info" on bugs) groups are removed and Planning is absorbed — its fields join the Details KV list (group matched by header text, English-UI; the native group becomes a stub). Teleports render VISIBLE (the live control replaces the row while editing — fields without a callout, e.g. Story Points, are typed into directly); stubs hide via `visibility: hidden`, never `opacity: 0`, because ancestor opacity renders even fixed-position descendants invisible while visibility is overridable per-descendant. Fourth pass: teleports anchor on the VALUE column with the control's own label hidden (`.adofix-wi-teleport`), so the row geometry never shifts; Classification absorbs like Planning; the "Details" list header is gone; the whole tab strip hides (display:none tabs still take `.click()`) with Attachments proxied as a 📎 toggle in the header command bar and the "Updated by …" line read live into an Updated KV row. Sixth pass: the comment-count link is back, compacted to ADO's own comment icon + the bare integer (`.wif-comment-count-link-text` trimmed each pass). Fifth pass: the command bar (Save/↻/↶/⋮/📎) overlays the FIRST header row next to the dialog's Fullscreen/Close (only the row's direct `.work-item-header-command-bar` child — the class appears twice, nested, and absoluting both collapses the outer to 4px; row 3 must NOT be positioned or it becomes the containing block); State is promoted out of its stub column to the header, left of the assignee (absolute against `.work-item-form-page`, top/left measured per pass from the assignee row's rect — fixed offsets drift when rows reflow — with a resize listener re-placing it); Effort absorbs into the KV list; the Description (text-matched — Repro Steps keeps its header) and Discussion section headers are gone (the 1px divider lives ON the header); comments sit flat with the card color moved onto the composer's text field; Related Work hides when it has no links (`.compact-links-list a`). The form's surface rules (shell/fields/editor to the canvas, composer text field as the card, the `--background-color` token override for the sanitizer) also live here since 2026-08-19 (carved out of chrome-density). |
| `card-comments` | Comment counts on board cards (sprint taskboard + kanban, every `.wit-card` with a numeric id in `.font-weight-semibold.selectable-text`): a "💬 n" chip right-aligned on the id line, only when n > 0. Counts via REST `_apis/wit/workitems?ids=…&fields=System.CommentCount` (200-id batches), cached per session; failed chunks retry on a later settle, chips re-render after React re-mounts. |
| `workitem-state` | Hotkey opens a state picker for the current work item; PATCHes via REST. |

## Features — pull requests

| Feature | What it does |
|---|---|
| `pr-comments` | One comment-icon **n/m** button (ADO's fluent `ms-Icon--Comment` glyph) in the Files toolbar consolidating four scattered comment controls: the header's "n/m comments resolved" text (hidden, count shown on the button), the native **Filter** button (collapsed by CSS to an invisible stub; the menu's "Advanced filters…" clicks it by proxy — its callout anchors to the stub's position), pr-thread-filter's Hide-resolved toggle, and pr-drafts' panel access ("Drafts · N"). While local drafts exist the button label appends "· k" so drafts stay visible without opening the menu. |
| `pr-actions` | Folds the header's "Set auto-complete" split button into the ⋮ More-actions menu. The split button collapses to an invisible stub (kept for proxy clicks and callout anchoring); opening ⋮ injects two native-cloned rows at the top: the button's current primary action (label read live — it tracks state, e.g. "Cancel auto-complete") and "More merge actions…", which opens ADO's own chevron menu (Complete / Mark as draft / Abandon). Bolt's single-callout policy closes the ⋮ menu automatically when the chevron menu opens. |
| `pr-checks` | All checks inline in the Overview status card. ADO's checks box shows only Build policies plus a "View n checks" link — failed optional checks ("Comments must be resolved", "Work items must be linked") are invisible until the panel opens. Fetches `_apis/policy/evaluations` (project GUID → `vstfs:///CodeReview/CodeReviewId/{guid}/{prId}` artifact) and renders the hidden evaluations as native-looking rows (ADO's own bolt-status icon geometry/palette) below the build rows, hiding the then-redundant "View n checks" link (Re-queue lives on the build row); failures sort first, each row tagged "· Required/Optional". Excludes policy types the card already shows (Build, reviewer counts, merge strategy). One fetch per PR per page load, success and failure both cached until reload. |
| `pr-reviewed` | Mirrors the file tree's **"Mark as reviewed"** checkbox into every stacked per-file header as a labeled "Reviewed" checkbox (revealed on header hover; stays visible once checked, and always visible while a pr-review-flow review is on). Checking it collapses the file's card via ADO's own `.bolt-card-expand-button`; unchecking reopens it. Display state comes from the server's visit data provider (`ms.vss-code-web.pr-detail-visit-data-provider` — its `viewedState` keys are `1@HASH@/path`, and the 8-hex hash could not be reproduced client-side, so writes never forge keys). Toggling clicks ADO's real tree checkbox; when the row is virtualized away, a one-time sweep of the tree maps every path to its flat row index, the tree scrolls there, clicks, and scrolls back. |
| `pr-diff-totals` | Whole-PR **`-dels +adds`** next to "n changed files" in the Files toolbar — the number ADO computes per file but never sums. Data: iterations → changes (`compareTo=0`) → `filediffs` REST (batched **10 per call, a server cap**; 4 concurrent workers; deletes send `originalPath` only — they have no `item.path`). One fetch per PR per page load, success and failure both cached until reload. |
| `backlog-toolbar` | Backlogs page header cleanup: "New Work Item" removed; "View as Board" and "Column Options" become icon-only buttons in the tab row, inline with View options / Filter (icon-proxy buttons that click the stubbed natives by id at click time — the natives stay mounted because bolt's commandbar **removes** `display:none` commands from the DOM). Scoped to `_backlogs` routes via an `<html>` attribute since the same command ids exist on other Boards-hub pages. The Backlog/Analytics tab toggle is removed outright (Analytics unused), and the whole icon row lifts onto the title row inline with the ⋮ menu (PR-Files-toolbar-merge pattern: click-through container, -64px, ≥900px only — below that the title would collide with the icons and the row stays put). The title row's own commandbar natively parks the ⋮ 14px below the title's centerline (`align-items: flex-end` in a 50px row); it's pinned to the top so the ⋮, the lifted icons and the title text all share one centerline. The filter bar (`.page-content-top` mount, like the sprint Backlog tab) becomes a compact right-aligned row tight under the header. |
| `backlog-grid` | Backlogs hierarchy grid fits the viewport: ADO's fixed-layout table carries absolute px `<col>` widths (h-scroll when they overflow; a `width:100%` filler col eats the slack when they underflow, so columns never grow). Rewrites col widths — Title takes all slack, data columns shrink proportionally when space is short (Title floors at 280px, data at half natural; beyond that scroll returns). Structural cols (≤80px or rem-width) untouched; external width changes (column drag, Column Options) are adopted as new naturals. Also flattens the grid pane (`.bolt-table-card` background + depth-8 shadow dropped). DOM-gated on `.backlogs-view table.backlog-tree`, so the sprint hub's Backlog tab gets the same treatment. |
| `backlog-status` | Orientation text in the Backlogs title row, after the team name: "Showing 176 of 255 items in area \"AI Platform\" · State: Active, New +2" (the area folds into the sentence; other filters trail as segments; primary text color, centered on the row). Count from the treegrid's `aria-rowcount` (the grid is virtualized — DOM rows can't be counted; the count includes the header row, so items = count − 1), filters parsed from the query string (`System.*` params plus `text` for the keyword box; path values shortened to their leaf). Filtered views read "Showing n of m items": m is captured from the view itself whenever it renders unfiltered (aria-rowcount, stored per org/project/team/level via `GM_setValue`) — REST was measured and rejected (Σ backlog-level endpoints gave 197 where the unfiltered view holds 255+: the view includes Done items and off-area parents the endpoints exclude). m lags until the next unfiltered visit; a stale m < n is suppressed. |
| `sprint-header` | Sprints hub header compressed to two rows (the Backlogs treatment transplanted): "New Work Item" and "Create Query" removed, "Column Options" proxied as an icon next to Filter (native ids differ per tab — `#__bolt-taskboard-*` on Taskboard, plain `#__bolt-*` on the sprint Backlog tab), Analytics and Capacity tabs hidden (the capacity page stays reachable by URL and keeps its Save/Revert row), icon commandbar lifted onto the title row (Taskboard/Backlog only — Capacity keeps Add user/Save/Revert there), sprint/person pickers right-aligned on the title row left of the icons (Capacity: into the tab row's middle instead — 300px left padding clears the tabs), burndown mini-widget and dates block dropped with the date range + days-remaining mirrored as title-row status text, and the inline filter cluster right-aligned in the shared tab row (Taskboard and Backlog tabs; the Backlog tab's bar mounts in `.page-content-top`, not the taskboard's `padding-vertical-16` wrapper, so it collapses -38px against the taskboard's -54). The status text leads with the backlog-status count/filter sentence ("Showing 89 of 120 items in area … · State: … · 1 August - 31 August · 10 work days remaining"): Taskboard counts `.taskboard-card` (NOT virtualized, parent cards excluded), the Backlog tab uses the grid's `aria-rowcount`; the unfiltered total is captured per decoded path (tab+team+iteration) in GM storage, transient zero-card loading states never recorded; Capacity shows dates only. Per-tab scoping via `data-adofix-sprints="<tab>"` on `<html>`; ≥900px for the lifts. |
| `taskboard-columns` | Taskboard column chooser + multi-card rows (ADO offers neither). An adofix-owned icon button (accent dot when filtering) next to Filter opens a checklist of the board's state columns — unchecked columns disappear and the rest share the freed width; plus a "2-up cards" toggle that lets cards pack 2-up (or more) wherever a column is wide enough (single-file cards cap at 240px), card counts appended to every column header ("New (7)", live-updating), 8px vertical cell padding, the assignment column capped at 180px with wrapping names, assignee names centered on the chevron line (ADO's `margin-top-8` bottom-parks them), and collapsed assignee rows (`td.taskboard-collapsed-row`, natively ADO-grey) sitting flat on the canvas. Preferences persist per org/project/team via `GM_setValue`, stored by state NAME so board reconfiguration can't hide the wrong column; the last visible column can't be hidden. Hiding is generated per-nth-child CSS; load-bearing details in the selector ledger. |
| `pr-drafts` | Batched review comments riding **ADO's own comment composer**. Each stacked per-file header also gets a comment-icon button (fluent `ms-Icon--CommentAdd`) for whole-file comments (natively buried in the file tree's ⋯ menu): it drives ADO's native chain — View → single-file view → tree menu → file-level composer — and the draft capture works there too, anchoring the thread to the file with no line positions: open a comment as usual (the native "Add comment" affordance on a diff line) and a purple **"Comment as draft"** button sits next to Cancel/Comment — it captures the text locally and closes the composer without posting, so ADO's markdown toolbar, @mentions and suggestions all work while drafting. For a line-range draft, select the lines in the diff first, then open the composer on a line inside the selection (Monaco: drag across lines, then open). Works in both diff renderers: the stacked "All changes" view (inline draft cards, edit-in-place) and the single-file Monaco view (purple gutter numbers on drafted lines, plus real Monaco **view-zone cards** below each drafted line — the diff editor's instance is fished out of React internals in `features/pr/monaco.ts`, and zones displace later lines like native threads, auto-spacing the original pane). Each draft also gets a lookalike child row in the file tree under its file (cloned from ADO's native thread rows; clicking it runs Show) — `TREE_SELECTORS.row` excludes these so the shared windowed-path math never sees them. Drafts persist locally per PR (`GM_setValue`); the toolbar "Drafts: N" button opens a panel with show/edit/delete (**Show** navigates to the draft — scrolls the stacked view to its card, or SPA-switches to the file via a virtualized-tree sweep-click and centers the line through the Monaco instance) and a two-stage "Submit all" that posts via the threads REST API — partial failure keeps failed drafts local, progress persists after every attempt, nothing double-posts. Removed-line drafts only in the stacked view. |

| `pr-review-flow` | GitHub-style review flow riding ADO's built-in per-file reviewed state. A **Review** button in the PR header (before Approve, all tabs) starts a per-PR review: lands on the Files tab and jumps to the first unreviewed file; its label tracks state (Review → "Reviewing · n/m" → "Reviewed ✓"). While reviewing, the Files toolbar shows an "n/m files reviewed" counter (click → next unreviewed; ADO's native `.pr-header-viewed-files` text is hidden meanwhile) and, in the single-file view, a "✓ Reviewed · next" action that clicks ADO's real tree checkbox for the open file and advances. Tree order and navigation come from the shared virtualized-tree index (`pr/reviewed-tree`); n comes from the shared viewed-state slot (`pr/reviewed-data`); m is parsed from the toolbar's "n changed files" text and remembered per PR. |

### Hotkeys

Active outside of inputs/editors only. Each default key travels with its
feature's registration (`ctx.hotkey(...)` in the feature's `init()`); user
overrides go through `Hotkeys.setBindings()` and enumeration through
`Hotkeys.list()` — the two hooks Phase 3's remapping UI needs.

| Key | Action | Where |
|---|---|---|
| `j` / `k` | next / previous changed file | PR **Files tab** (elsewhere they toast a reminder) |
| `n` / `p` | next / previous comment thread | PR |
| `u` | next **unresolved** thread | PR |
| `t` | toggle the file tree pane | PR |
| `s` | change work item state | work item form, boards |

## Selector verification status

Selectors were **verified against a live dev.azure.com instance on
2026-08-01** (PR Files view, PR Overview, Kanban board). Each constant carries
its verification date; everything still fails soft (logs and returns; never
throws). Key live findings baked into the code:

- PR Files diff is **virtualized**: file sections (`.repos-summary-header`)
  and comment sites render only near the viewport. Keyboard nav operates on
  what is currently in the DOM.
- A comment site in the diff is a `.repos-editor-discussion-host` holding
  either a collapsed expand-button or an expanded `.repos-discussion-thread`.
  Thread status lives on `button[aria-label^='State button']`
  ("State button Resolved mode"), with the footer Resolve/Reactivate button as
  fallback. Collapsed sites expose **no status** in the DOM.
- `.repos-collapsed-comment` is a decoy — an aria-hidden per-line placeholder
  (hundreds per diff). Never anchor on it.
- The reply input inside an expanded thread carries a `threadId-<id>` class —
  the DOM→REST bridge for Phase 2. The threads REST API reports statuses as
  `fixed`/`wontFix`/`closed`, not the UI's "Resolved".
- ADO's comment composer: **unsaved** threads get negative ids
  (`threadId--1`, `--2`, … per composer opened), and every composer input has
  an invisible auto-size twin with the extra class
  `bolt-textfield-auto-adjust-hidden` — write probes against the twin silently
  do nothing. In the stacked view the composer renders as its own
  `.repos-diff-contents-row` directly after the commented line; in Monaco it
  is a view zone that displaces later lines. Cancel with text typed does
  **not** prompt to discard.
- **Monaco instance access (verified live 2026-08-19)**: `window.monaco`
  exposes no editor registry, but the diff-editor instance hangs off React
  internals — `.monaco-diff-editor`'s parent element's
  `__reactInternalInstance$` fiber, a few `return` hops up, in a stateNode
  property (duck-typed `getModifiedEditor`; see `features/pr/monaco.ts`).
  Synthetic wheel/keyboard events and `pushState`+popstate do NOTHING to
  ADO's Monaco or router — `revealLineInCenter()` and tree-row `.click()`
  are the only working scroll/navigation levers. View zones render only
  after `layoutZone()` + `layout()`, resize by mutating the retained
  descriptor's `heightInPx`, and need a `z-index` on the domNode to receive
  clicks. A fresh composer view zone measures ~700px above the viewport for
  its first seconds — capture refuses to anchor a lineless composer more
  than 300px above line 1 (`monacoAnchorLine`).
- **Review-flow anchors (verified live 2026-08-19)**: the header Approve
  split-button sits in `.repos-pr-header-vote-button` (our Review button
  inserts before it); `a.bolt-tab[href*="_a=files"]` SPA-navigates on
  synthetic click; ADO's own progress text is `.pr-header-viewed-files`
  in the header secondary title row and only exists at n ≥ 1; the stacked
  view scrolls inside `.repos-changes-viewer`; the changed-files total is
  a toolbar span reading "n changed files".
- **No CSRF header is needed for writes**: a same-origin PATCH with only the
  session cookie passes ADO's auth layer (verified via a 404-probe on a
  nonexistent work item id). `writeHeaders()` in `src/core/api.ts` stays as
  the single hook should that ever change.

- PR Overview cards (verified live 2026-08-14): `.shadow-padding` is the
  Overview content column and exists **only** on the Overview tab (the Files
  view has none), so `.shadow-padding .bolt-card` themes the status card,
  Description and every timeline card without touching the tuned diff cards.
  Dividers are `.separator-line-bottom`/`-top` border colors plus
  `.repos-discussion-comment` (reply separators) and `.bolt-table-cell`
  border-tops (commit-list rows); the nested "Merged PR …" and checks boxes
  are `.status-details-container` with 1px outline borders. In the stacked
  diff, side-by-side panes are `.repos-summary-diff-container` (one
  horizontal scroll container per side; the diff body is a CSS TABLE —
  `.repos-diff-contents-row` is `table-row`, so cell widths are column-locked
  by the table algorithm and only the discussion HOST inside the cell can be
  resized; comments are pinned there via `position: sticky` + container-query
  width). The checks box is the
  `.status-details-container` whose table is `.preview-check-list` (the
  merged-commit box's table is `.repos-commits-table`); the "View n checks"
  row is its `.status-details-container-row` child — pr-checks inserts
  before it. In file-anchored
  comment cards the code preview is fenced by `.comment-file-header`
  (border-bottom) and `.comment-file-diff-container` (border-top); the blue
  `.diff-comment` underline marks the commented span and is functional.
  Markdown-authored borders in comment bodies (`<hr>`, tables) carry no
  bolt-* classes and are left alone. The right sidebar is `.repos-overview-right-pane`; its sections
  are its direct children (Reviewers and Tags are `.flex-column`s, Work items
  is an extension region), plain transparent columns (kept flat; the Tags
  input outline is `.bolt-tag-picker`'s border). Non-comment feed entries are
  `.bolt-timeline-cell .bolt-table-card` — the merge-status card is a
  `.bolt-table-card` outside any timeline cell, which is what separates them.
  The discussion feed is `.activity-feed-list.can-add-comments > .relative`
  (single-cell `.bolt-timeline-row`s; NOT virtualized — end spacers stay 0px
  under scroll). The Updates tab reuses `.activity-feed-list` **without**
  `.can-add-comments` and IS virtualized (748px end spacer) — visual
  reversal breaks it; the class difference is the guard.
  Inside Reviewers: `.pr-required-reviewers-section` /
  `.pr-optional-reviewers-section`, each holding a group header
  (`.body-s.secondary-text.font-weight-semibold`), reviewer rows
  (`.repos-reviewer` — name column `.flex-column` with an optional
  `.body-s.secondary-text` status line) and an empty-state well
  (`.repos-pr-no-items-well`).

- Backlogs page (verified live 2026-08-18, Epics backlog): header commands
  keep stable bolt ids (`#__bolt-new-work-item`, `#__bolt-view-as-board` — an
  `<a>` whose href tracks the backlog level — `#__bolt-column-options`,
  `#__bolt-filter` in the tab row). **`display:none` on a commandbar item
  makes bolt remove it from the DOM entirely** (moved into the ⋮ overflow
  menu; sticky until reload) — stub with zero width instead. The grid is
  `table.backlog-tree.bolt-table` (fixed layout, inline `width:100%`) inside
  `.bolt-table-container` inside `.bolt-table-card` inside `.backlogs-view`;
  `<col>`s hold inline px widths (the "More actions" col is `2.625rem`, the
  flex filler is `width: 100%`), one `<col>` per `<th>`, and the flex column
  is found by `<th>` text `"Title"` (English-UI assumption). The settle
  observer is childList-only, so splitter drags / window resizes need the
  feature's own ResizeObserver on `.bolt-table-container`. Header rows: the
  title row is `.wit-backlogs-header-row` (team dropdown left, commandbar
  with the stubbed buttons + ⋮ right); the tab row below is
  `.backlogs-tabbar-header` holding `.bolt-tabbar` (class `bolt-tabbar-grey`
  paints its own opaque background — kill it when lifting) with
  `.backlogs-tabbar-tabs` (Backlog/Analytics, plain tabs — display:none safe)
  left and the icon commandbar (level selector, view options,
  `#__bolt-filter`, settings, fullscreen) right. The backlog grid IS
  virtualized (42 mounted rows, ~5000px spacer on a 176-item backlog) —
  counts come from the treegrid's `aria-rowcount`, which includes the header
  row (data rows run aria-rowindex 2..count). Filter state round-trips
  through the query string: `System.State`, `System.AreaPath`, … (comma-
  separated values, backslash paths) and `text` for the keyword box.

- Sprints hub (verified live 2026-08-18, all three tabs): title row is
  `.wit-sprints-header-row`, tab row `.sprints-tabbar-header` with tabs
  `#__bolt-tab-taskboard/backlog/capacity/analytics` in `.sprints-tabbar-tabs`
  and icons in `.sprints-tabbar-header-commandbar`; the pickers/dates row is
  `.sprints-header-dates` (left cluster = pickers; right cluster =
  `:has(.sprint-dates-button)` holding the dates button, a `span.text-right`
  "n work days remaining" and the burndown `.widget-host.embedded-View`,
  which renders a white box while loading). Title-row command ids are
  PER-TAB: `#__bolt-taskboard-new-work-item`/`-column-options` on Taskboard;
  plain `#__bolt-new-work-item`/`-column-options` plus `#__bolt-create-query`
  on the Backlog tab; `#__bolt-add-user`/`-save`/`-revert` on Capacity (left
  alone). On _sprints, display:none does NOT evict commandbar items into the
  ⋮ (unlike _backlogs) — the ⋮ menu holds only "Email…". A margin-top lift
  on the tabbar commandbar is partially absorbed by the header flex layout
  (-76px moved it 13px); position:relative top lifts 1:1. The taskboard grid
  is a fixed-layout table (`table:has(td.taskboard-expanded-cell)`): 11 state
  `<col>`s at inline `9.09091%` (204px) plus a 220px parent col and two
  `0%` border cols, with an inline `min-width: 2464px` on the table that
  must be zeroed before hidden columns free width; fixed layout treats `0%`
  cols as auto (they'd grab a full share) — pin them to 4px. Cells:
  `td.taskboard-parent-cell` / `td.taskboard-expanded-cell`, one per state,
  1:1 with `<th>`s (borders at both ends); spacer rows have a single cell so
  nth-child hiding never touches them. Cards (`.taskboard-card`, NOT
  virtualized — 89/89 mounted at every scroll position) sit in a
  `div.flex-row.flex-wrap` inside the cell; they only pack 2-up after
  `min-width: 0` (min-width:auto = flex min-content forces 1-per-row).
  CROSS-BROWSER (diagnosed live in the user's Firefox 153, 2026-08-18): in
  this fixed-layout table Firefox ignores `width:auto` (v0.15.0) and
  `calc()` (v0.15.1) on `<col>` elements — plain percentages and pixels
  resolve fine; Chrome resolves everything. The only safe cross-engine way
  to size ADO table columns is inline PIXEL widths written by JS. And when
  writing them, compare against the col's style ATTRIBUTE, never its
  rendered width — ADO's 9.09% tracks can render within 1px of the target,
  silently leaving the percentages in place (v0.15.2). Fit policy
  (two-regime, thresholds from live user feedback): fill the pane exactly
  while the equal share is ≥ 150px (the card flex basis); below that render
  native 204px columns with a reduced h-scroll (table min-width set to the
  exact computed sum, not 0) — never sub-150 slivers, never scroll when a
  usable fill exists. And the one that bit LAST (both engines, masked in
  every Chrome proto because those only hid TRAILING columns):
  `display:none` table cells make every later cell in the row SHIFT LEFT —
  cells map to column tracks by rendered order, not index — so track widths
  must be laid out COMPACTLY (shares first, zeros at the end), never zeroed
  at the hidden columns' original positions (hiding middle columns bunched
  the shifted header labels into the zeroed tracks and left dead space).
  The parent/assignment column (track 2) auto-sizes to the longest name —
  capped at 180px with names allowed to wrap (`.identity-view` un-nowrapped).
  Overlay-lift limit: the filter bar lives inside `.page-content`
  (overflow:auto) — content lifted above a scroll container's top edge gets
  CLIPPED, so it cannot use the pickers' negative-margin lift; instead the
  dates row collapses the space above it (margin-bottom -54px, conditional
  on `:has(~ * .vss-FilterBar)` so the board never rides up under the tabs
  when the filter is toggled off).

- Work item form (verified live 2026-08-18, opened as `workitem=` dialog on
  a backlog): root `.work-item-form-dialog`, body `.work-item-form-page`,
  strip `.work-item-form-subheader`, tabs `.wif-tabbar`. Four native greys:
  #201f1e (page + every flat field/editor), #252423 (subheader/tabbar),
  #323130 (dialog shell + `.discussion-new-comment` composer), #292827
  (`.deployments-zero-data`, `.links-control-zero-state`). GOTCHA: the
  description editor's surface cannot be painted directly — ADO's dark-theme
  sanitizer rule (`.work-item-form-section-dark-theme-override .html-editor
  [style]:not(a):not(pre):not(…)`) repaints every inline-styled descendant
  `var(--background-color) !important` at ~(0,5,2) specificity, and the
  rooster editor div carries `style="user-select: text"`. Winning the
  specificity war is futile; redefine `--background-color` on
  `.html-editor` instead and ADO's own rule paints our color.
  Body layout: `.work-item-grid` (classes carry `first-column-wide
  right-column-count-2 section-count-4`) is a CSS grid, natively
  `852px 410px 410px` gap 16, with exactly three children — 
  `.work-item-form-first-section` (1/1), `.work-item-form-discussion` (2/1)
  and `.work-item-form-right.other-form-sections` (a flex-row of two
  `.work-item-form-section` columns spanning rows 1-2). Discussion content
  (`.work-item-form-collapsible-section-content`) is flat and NOT
  virtualized: `.discussion-new-comment` composer first, then
  `.comment-item.displayed-comment` per comment, newest first. The
  Description caps via `.rooster-wrapper` max-height 500px +
  `.rooster-editor` 460px (inner scrollbar). TRAPS: `.work-item-form-right`
  carries flex-row classes but COMPUTES `display: grid` from ADO's CSS —
  flex-direction is silently ignored and its sections sit in fixed grid
  tracks (~870px even when empty); `.work-item-grid` also fixes its row
  heights, boxing the description into a scrolling track; and setting
  `overflow-x: hidden` with visible-y COMPUTES overflow-y to auto,
  creating scrollboxes wherever height is constrained.

- Work item cards (verified live 2026-08-18, kanban + sprint taskboard):
  every card is `.wit-card` (`.taskboard-card` on sprints, `.boards-card` on
  kanban) = `.card-flag` (the work-item-type stripe: 4px wide, full height,
  color as inline `background-color`) + `.card-content`. The grey frame
  around cards is NOT a border on the card — `.card-content` carries a
  1px `#605e5c` border on top/right/bottom (the flag covers the left);
  hunting `.wit-card` border/outline/box-shadow finds nothing. The filter
  bar keyword box is `.vss-FilterBar--item-keyword-container` and natively
  flex-grows across the whole bar (~867px on the sprints taskboard).

Remaining unverified (inert if wrong): swimlane header rules in `density.css`
(`grep -rn "TODO(selector)" src/`). Footer-text status fallback assumes an
English ADO UI.

After an ADO UI update breaks something: re-verify the constants in
`THREAD_SELECTORS` / `KEYNAV_SELECTORS` / `density.css`,
preferring `aria-label` / `role` / `data-*` / semantic class names — never
generated class hashes — and update the date in the comment.

## Architecture

Core modules are factories composed once in `main.ts`; tests construct fresh
instances. (Feature files DO hold module-level session state — fetch caches,
wiring flags — that lasts the page lifetime by design.)

- `src/main.ts` — bootstrap: injects the base token/surface sheet, then
  `createRouter()` + `createHotkeys()` + `createRegistry()`, registers
  features, wires the observer.
- `src/core/router.ts` — `createRouter()`: patches
  `pushState`/`replaceState` + `popstate` behind a single update path that
  owns change-detection and notification. The observer calls `recheck()` on
  every DOM settle, because a sandboxed userscript context may not see the
  page's own history calls.
- `src/core/observe.ts` — one debounced (100 ms) `MutationObserver` on `body`.
- `src/core/registry.ts` — the `Feature` contract: optional `init(ctx)` runs
  exactly once at registration (one-time setup, hotkeys via `ctx.hotkey` with
  auto-prefixed action ids and inherited areas); `apply(route)` is idempotent
  per-settle work — each feature guards re-entry by querying for its own
  injected nodes (`data-adofix` marks adofix stylesheets and singletons).
  `applyAll()` guards every feature — one broken feature never kills the rest.
- `src/core/dom.ts` — `injectStyleOnce`/`setStyle` (self-healing re-append
  when ADO's lazy-loaded sheets land after ours), the base token +
  `.adofix-surface` sheet (`injectBaseStyle`), `stubHide` (the zero-size
  visibility-hidden stub recipe), `makeToolbarButton`/`makeCommandProxy`,
  `ensureText`, `safeQuery`, `showToast`.
- `src/core/api.ts` — typed same-origin REST wrappers, `api-version=7.1`,
  errors returned as values (Phase 2 needs partial-failure handling);
  `(org, project)` travels as a `ProjectRef`; `projectBase` is the one
  builder of project-scoped paths (legacy visualstudio.com-safe).
- `src/core/fetch-cache.ts` — the fetch-once/latch-failure state machine
  every REST feature caches through (the v0.6.0 request-flood guard);
  failure policy per cache: latch (default) or retry.
- `src/core/popover.ts` — the shared light-dismiss menu (outside-mousedown,
  Escape, arrow roving, `data-adofix-modal` hotkey suspension) with
  `menuItem`/`menuStatus`/`menuDivider` building blocks.
- `src/core/storage.ts` — the only caller of `GM_getValue`/`GM_setValue`;
  namespaced keys (`adofix.<feature>.<key>`) with a schema version envelope.
- `src/core/keys.ts` — `createHotkeys()`: single capture-phase keydown
  listener; ignores inputs/contenteditable and adofix modals; default keys
  live on the registrations.
- Shared feature modules mirror `src/features/pr/`:
  `src/features/boards/` (filter parsing, status formatting, unfiltered-total
  memory, boards-hub path/scope helpers) and `src/features/workitem/`
  (English-UI label matches + string transforms in `fields.ts`, the
  teleport-edit machinery in `teleport.ts`) — all with colocated tests.

