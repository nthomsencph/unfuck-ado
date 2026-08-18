# ado-unfuck

A Violentmonkey userscript that unfucks the Azure DevOps web UI. Client-side
only, same-origin, no PAT, no background script.

## Install (one-time)

1. Install [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/)
   in Firefox if you don't have it yet.
2. Grant Violentmonkey access to local files (needed to install from a
   `file://` URL, and for **Track external edits** to watch the file later):
   open `about:addons` → **Violentmonkey** → **Permissions and data** →
   enable **"Access local files on your computer"**. Without this, step 5
   shows a help page instead of the install tab.
3. Build the script (from the repo root):

   ```sh
   pnpm install
   pnpm build        # emits dist/ado-unfuck.user.js
   ```

4. Print the install URL and copy it:

   ```sh
   echo "file://$(pwd)/dist/ado-unfuck.user.js"
   ```

5. Paste that URL into Firefox's address bar and hit Enter. Violentmonkey
   opens an installation tab showing the script source.
6. The install tab offers three checkboxes; set them like this:
   - **Close** — off. It closes the tab after install, and tracking (below)
     only lives while the tab is open.
   - **Edit** — off. The bundle is generated output; edits belong in `src/`
     and anything typed in Violentmonkey's editor is overwritten on the next
     build.
   - **Track external edits** — on if you develop (auto-reinstalls on every
     rebuild); irrelevant for install-and-forget.
7. Click **Confirm installation** and leave the tab open if you enabled
   tracking.

## Verify it works

1. Open any PR in ADO and go to the **Files** tab. You should see:
   - a **Hide resolved** button in the diff toolbar (next to Inline/Filter);
   - `j` / `k` jumping between changed files (click the page background
     first — hotkeys are intentionally dead while an input or the diff's
     comment editor has focus);
   - a visibly shorter PR header.
2. The Violentmonkey toolbar icon shows a badge count on ADO tabs.
3. If something looks off, open the ADO tab's devtools console, run
   `localStorage.setItem("adofix.debug", "1")`, reload, and look for
   `[adofix]` log lines.

## Update after changing the code

```sh
pnpm build
```

Then paste the same `file://` URL into the address bar again and click
**Confirm re-installation**. No version bump needed.

**Faster loop while developing:** keep `pnpm dev` (watch mode) running, and
tick **Track external edits** on the Violentmonkey installation tab — while
that tab stays open, every rebuild re-installs automatically; reload the ADO
tab to see it. Closing the installation tab stops the tracking (that's a
Violentmonkey limitation, not a bug here).

```sh
pnpm dev          # rebuild on change
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
```

## Disable / uninstall

Violentmonkey toolbar icon → the `ado-unfuck` toggle disables it per-browser;
the dashboard (gear icon) removes it. There is no server side and no stored
credentials — uninstalling removes everything except `GM_setValue` prefs,
which Violentmonkey deletes with the script.

## Features (Phase 1)

| Feature | What it does |
|---|---|
| `board-density` | Pure CSS: tighter cards, headers and swimlanes on Kanban boards. |
| `chrome-density` | Pure CSS: compresses ADO's header chrome (title rows, filter bar) across hubs — ~58px reclaimed on a sprint taskboard. Also themes the PR Overview: conversation cards (status, Description, comment threads) get page-surface background, heavier shadow and `--adofix-radius` corners with chrome divider lines removed, while non-comment feed entries ("pushed n commits") and the Reviewers/Tags/Work items sidebar sit flat against the page (tag-picker input outline removed). Reviewers render as one merged list (required first, per-row "Required"/"Optional" subtitle tags) instead of two headed groups. The discussion feed runs oldest-first with the composer at the bottom, GitHub-style (Overview feed only — the Updates tab's feed is virtualized and cannot be safely mirrored). Board cards (kanban `.boards-card` + sprint `.taskboard-card`, both `.wit-card`) get one material: `--adofix-card` surface, soft shadow, ADO's 1px grey content frame removed, 3px state flag, 20px vertical padding. Filter bars sit flat with the keyword box capped at 430px (natively it flex-grows across the whole bar). |
| `pr-keynav` | Keyboard navigation in the PR Files view (see hotkeys). |
| `pr-thread-filter` | Hides resolved **and closed** threads (plus ADO's collapsed thread sites), leaving a placeholder per thread — click it to reveal that one. In the diff it is a compact 💬 chip; on the Overview feed it is a full-width "💬 Resolved comment thread — click to show" row sized to align with the timeline rail icon. Persisted via `GM_setValue`. Toggled from the `pr-comments` widget (its own toolbar button retired 2026-08-02). |
| `workitem-state` | Hotkey opens a state picker for the current work item; PATCHes via REST. |

## Features (Phase 2, in progress)

| Feature | What it does |
|---|---|
| `pr-comments` | One **💬 n/m** button in the Files toolbar consolidating four scattered comment controls: the header's "n/m comments resolved" text (hidden, count shown on the button), the native **Filter** button (collapsed by CSS to an invisible stub; the menu's "Advanced filters…" clicks it by proxy — its callout anchors to the stub's position), pr-thread-filter's Hide-resolved toggle, and pr-drafts' panel access ("Drafts · N"). |
| `pr-actions` | Folds the header's "Set auto-complete" split button into the ⋮ More-actions menu. The split button collapses to an invisible stub (kept for proxy clicks and callout anchoring); opening ⋮ injects two native-cloned rows at the top: the button's current primary action (label read live — it tracks state, e.g. "Cancel auto-complete") and "More merge actions…", which opens ADO's own chevron menu (Complete / Mark as draft / Abandon). Bolt's single-callout policy closes the ⋮ menu automatically when the chevron menu opens. |
| `pr-checks` | All checks inline in the Overview status card. ADO's checks box shows only Build policies plus a "View n checks" link — failed optional checks ("Comments must be resolved", "Work items must be linked") are invisible until the panel opens. Fetches `_apis/policy/evaluations` (project GUID → `vstfs:///CodeReview/CodeReviewId/{guid}/{prId}` artifact) and renders the hidden evaluations as native-looking rows (ADO's own bolt-status icon geometry/palette) below the build rows, hiding the then-redundant "View n checks" link (Re-queue lives on the build row); failures sort first, each row tagged "· Required/Optional". Excludes policy types the card already shows (Build, reviewer counts, merge strategy). One fetch per PR per page load, success and failure both cached until reload. |
| `pr-reviewed` | Mirrors the file tree's **"Mark as reviewed"** checkbox into every stacked per-file header (hover the header row; stays visible once checked). Display state comes from the server's visit data provider (`ms.vss-code-web.pr-detail-visit-data-provider` — its `viewedState` keys are `1@HASH@/path`, and the 8-hex hash could not be reproduced client-side, so writes never forge keys). Toggling clicks ADO's real tree checkbox; when the row is virtualized away, a one-time sweep of the tree maps every path to its flat row index, the tree scrolls there, clicks, and scrolls back. |
| `pr-diff-totals` | Whole-PR **`-dels +adds`** next to "n changed files" in the Files toolbar — the number ADO computes per file but never sums. Data: iterations → changes (`compareTo=0`) → `filediffs` REST (batched **10 per call, a server cap**; 4 concurrent workers; deletes send `originalPath` only — they have no `item.path`). One fetch per PR per page load, success and failure both cached until reload. |
| `backlog-toolbar` | Backlogs page header cleanup: "New Work Item" removed; "View as Board" and "Column Options" become icon-only buttons in the tab row, inline with View options / Filter (icon-proxy buttons that click the stubbed natives by id at click time — the natives stay mounted because bolt's commandbar **removes** `display:none` commands from the DOM). Scoped to `_backlogs` routes via an `<html>` attribute since the same command ids exist on other Boards-hub pages. The Backlog/Analytics tab toggle is removed outright (Analytics unused), and the whole icon row lifts onto the title row inline with the ⋮ menu (PR-Files-toolbar-merge pattern: click-through container, -64px, ≥900px only — below that the title would collide with the icons and the row stays put). The title row's own commandbar natively parks the ⋮ 14px below the title's centerline (`align-items: flex-end` in a 50px row); it's pinned to the top so the ⋮, the lifted icons and the title text all share one centerline. |
| `backlog-grid` | Backlogs hierarchy grid fits the viewport: ADO's fixed-layout table carries absolute px `<col>` widths (h-scroll when they overflow; a `width:100%` filler col eats the slack when they underflow, so columns never grow). Rewrites col widths — Title takes all slack, data columns shrink proportionally when space is short (Title floors at 280px, data at half natural; beyond that scroll returns). Structural cols (≤80px or rem-width) untouched; external width changes (column drag, Column Options) are adopted as new naturals. Also flattens the grid pane (`.bolt-table-card` background + depth-8 shadow dropped). DOM-gated on `.backlogs-view table.backlog-tree`, so the sprint hub's Backlog tab gets the same treatment. |
| `backlog-status` | Orientation text in the Backlogs title row, after the team name: "Showing 176 of 255 items in area \"AI Platform\" · State: Active, New +2" (the area folds into the sentence; other filters trail as segments; primary text color, centered on the row). Count from the treegrid's `aria-rowcount` (the grid is virtualized — DOM rows can't be counted; the count includes the header row, so items = count − 1), filters parsed from the query string (`System.*` params plus `text` for the keyword box; path values shortened to their leaf). Filtered views read "Showing n of m items": m is captured from the view itself whenever it renders unfiltered (aria-rowcount, stored per org/project/team/level via `GM_setValue`) — REST was measured and rejected (Σ backlog-level endpoints gave 197 where the unfiltered view holds 255+: the view includes Done items and off-area parents the endpoints exclude). m lags until the next unfiltered visit; a stale m < n is suppressed. |
| `sprint-header` | Sprints hub header compressed to two rows (the Backlogs treatment transplanted): "New Work Item" and "Create Query" removed, "Column Options" proxied as an icon next to Filter (native ids differ per tab — `#__bolt-taskboard-*` on Taskboard, plain `#__bolt-*` on the sprint Backlog tab), Analytics and Capacity tabs hidden (the capacity page stays reachable by URL and keeps its Save/Revert row), icon commandbar lifted onto the title row (Taskboard/Backlog only — Capacity keeps Add user/Save/Revert there), sprint/person pickers right-aligned on the title row left of the icons (Capacity: into the tab row's middle instead — 300px left padding clears the tabs), burndown mini-widget and dates block dropped with the date range + days-remaining mirrored as title-row status text. The status text leads with the backlog-status count/filter sentence ("Showing 89 of 120 items in area … · State: … · 1 August - 31 August · 10 work days remaining"): Taskboard counts `.taskboard-card` (NOT virtualized, parent cards excluded), the Backlog tab uses the grid's `aria-rowcount`; the unfiltered total is captured per decoded path (tab+team+iteration) in GM storage, transient zero-card loading states never recorded; Capacity shows dates only. Per-tab scoping via `data-adofix-sprints="<tab>"` on `<html>`; ≥900px for the lifts. |
| `taskboard-columns` | Taskboard column chooser + multi-card rows (ADO offers neither). An adofix-owned icon button (accent dot when filtering) next to Filter opens a checklist of the board's state columns — unchecked columns disappear and the rest share the freed width; plus a "2-up cards" toggle that lets cards pack 2-up (or more) wherever a column is wide enough (single-file cards cap at 280px), card counts appended to every column header ("New (7)", live-updating), 8px vertical cell padding, and the assignment column capped at 180px with wrapping names. Preferences persist per org/project/team via `GM_setValue`, stored by state NAME so board reconfiguration can't hide the wrong column; the last visible column can't be hidden. Hiding is generated per-nth-child CSS; load-bearing details in the selector ledger. |
| `pr-drafts` | Batched review comments riding **ADO's own comment composer**. Each stacked per-file header also gets a **"Comment on file"** button for whole-file comments (natively buried in the file tree's ⋯ menu): it drives ADO's native chain — View → single-file view → tree menu → file-level composer — and the draft capture works there too, anchoring the thread to the file with no line positions: open a comment as usual (the native "Add comment" affordance on a diff line) and a purple **"Comment as draft"** button sits next to Cancel/Comment — it captures the text locally and closes the composer without posting, so ADO's markdown toolbar, @mentions and suggestions all work while drafting. For a line-range draft, select the lines in the diff first, then open the composer on a line inside the selection (Monaco: drag across lines, then open). Works in both diff renderers: the stacked "All changes" view (inline draft cards, edit-in-place) and the single-file Monaco view (purple gutter numbers on drafted lines). Drafts persist locally per PR (`GM_setValue`); the toolbar "Drafts: N" button opens a panel with edit/delete and a two-stage "Submit all" that posts via the threads REST API — partial failure keeps failed drafts local, progress persists after every attempt, nothing double-posts. Removed-line drafts only in the stacked view. |

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
`THREAD_SELECTORS` / `KEYNAV_SELECTORS` / `FILTER_SELECTORS` / `density.css`,
preferring `aria-label` / `role` / `data-*` / semantic class names — never
generated class hashes — and update the date in the comment.

## Architecture

Core modules are factories composed once in `main.ts` — no module-level
mutable state; tests construct fresh instances.

- `src/main.ts` — bootstrap: `createRouter()` + `createHotkeys()` +
  `createRegistry()`, registers features, wires the observer.
- `src/core/router.ts` — `createRouter()`: patches
  `pushState`/`replaceState` + `popstate` behind a single update path that
  owns change-detection and notification. The observer calls `recheck()` on
  every DOM settle, because a sandboxed userscript context may not see the
  page's own history calls.
- `src/core/observe.ts` — one debounced (100 ms) `MutationObserver` on `body`.
- `src/core/registry.ts` — the `Feature` contract: optional `init(ctx)` runs
  exactly once at registration (one-time setup, hotkeys via `ctx.hotkey` with
  auto-prefixed action ids and inherited areas); `apply(route)` is idempotent
  per-settle work (injected nodes marked `data-adofix="<feature-id>"`).
  `applyAll()` guards every feature — one broken feature never kills the rest.
- `src/core/api.ts` — typed same-origin REST wrappers, `api-version=7.1`,
  errors returned as values (Phase 2 needs partial-failure handling);
  `(org, project)` travels as a `ProjectRef`.
- `src/core/storage.ts` — the only caller of `GM_getValue`/`GM_setValue`;
  namespaced keys (`adofix.<feature>.<key>`) with a schema version envelope.
- `src/core/keys.ts` — `createHotkeys()`: single capture-phase keydown
  listener; ignores inputs/contenteditable and adofix modals; default keys
  live on registrations, user overrides overlay them.
