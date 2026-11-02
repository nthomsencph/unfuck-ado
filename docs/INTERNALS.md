# ado-unfuck internals

The engineering ledger: per-feature implementation notes, the selector
verification status, and the architecture. **Updated with every change** —
when a feature's behavior, a selector, or the module layout moves, the
matching entry here moves with it. The user-facing overview lives in the
[README](../README.md).

## Features — boards, work items & chrome

| Feature | What it does |
|---|---|
| `board-density` | CSS (plus one settle loop, below): tighter headers and swimlanes on Kanban boards, the card-shell margin (12px gap below every stacked card), and the board card MATERIAL (moved here from chrome-density 2026-08-19): kanban `.boards-card` + sprint `.taskboard-card` (both `.wit-card`) are GitHub Projects cards since stage 1 (2026-11-02) — flat `--bgColor-default` fill, 6px corners, no border and no shadow (borderless pass 2026-11-02, `docs/plans/design-decisions-borderless.md` B4: the 1px border is kept as transparent width, geometry unchanged) — with ADO's inner 1px grey content frame removed, 3px state flag, 20px vertical padding; kanban columns are `--bgColor-muted` boxes with the same corners, so cards read as darker/lighter slabs sunk into them. The canvas behind them is the Primer bridge's (the canvas < lane < card layering is retired). Board card-style rules (Board settings → Styles, e.g. Priority = 1 → red) paint the card inline and mark `.card-content` `.light`/`.dark`, which makes ADO turn the text black/white for the RULE color; our surface wins, so that text follows the surface (`--fgColor-default`, `.label-*-secondary` labels `--fgColor-muted`), and each settle copies the inline color into `--adofix-card-rule` so the card shows a 14% `color-mix` tint of it (B13, verified live 2026-11-02 on Priority 1 taskboard cards). |
| `chrome-density` | Pure CSS: compresses ADO's header chrome (title rows, filter bar) across hubs — ~58px reclaimed on a sprint taskboard. Page-title rows (`.bolt-header` except tab strips) get 20px top padding since 2026-11-02 — one knob, `--adofix-title-pad`, which a page can override on its scope (6px from Aug; the user wanted GitHub's air back above PR titles and sprint/backlog headers); in-page section headers (`.no-padding`, e.g. the PR sidebar) keep 6px. The top banner loses its drop shadow. (The site-wide search widget `.expandable-search-header` was hidden here 2026-08-18 → 2026-11-02; `github-frame` now restyles it as GitHub's search box.) Header and rail canvas pins here are overridden by `github-frame`'s frame material (higher specificity). Page, banner, nav-rail and sticky-header canvas colors are no longer set here — the near-black overrides were removed in stage 1 and the Primer bridge colors them through ADO's own variables. Filter bars sit flat with the keyword box capped at 215px (natively it flex-grows across the whole bar) and the "Assigned to" / "Parent Work Item" filter items removed (aria-label prefix match, English-UI; an applied filter on a hidden item stays active — visible in the URL and status text). (The PR-Overview restructuring, work-item-form surfaces and board card material were carved out to `pr-overview`, `workitem-layout` and `board-density` on 2026-08-19 — this sheet is order-sensitive density chrome only.) |
| `github-frame` | GitHub makeover stage 2 (spec `docs/specs/2026-11-02-github-frame-design.md`, decisions `docs/plans/design-decisions-frame.md` F1–F11): ADO's header and left rail as GitHub's frame. **Header** (`.project-header` row = `.region-header` + `.region-header-menubar`): `--bgColor-inset` material, no bottom hairline since the borderless pass (B5; height stays 48px, F3); ADO's logo kept but monochrome — its own image URL becomes a CSS `mask` painted `--fgColor-default` (F2); breadcrumbs as GitHub's "owner / repo" — 14px `--fgColor-default` links, hover underline, muted `/`, last crumb semibold, or, when the trail ends in a selector (repo, team), the selector semibold instead; the menubar's icon buttons (My Work, Marketplace, Help, User settings) as GitHub's 32px squares, filled `--button-default-bgColor-rest` rather than bordered (B5), avatar round. **Icons**: Octicons replace ADO's glyphs in pure CSS (v0.62.5): CSS generated from the hubs.ts tables hides each mapped host's own glyph/img and paints the Octicon as a `currentColor` mask on its `::after`. The sheet is in place before ADO first renders the rail, so the Octicon shows in ADO's first frame. The earlier JS `<svg>` injection landed ~0.7s after the rail appeared, because the settle debounce keeps restarting during ADO's first render, and ADO's icons blinked on every reload (measured 2026-11-02); rail groups mapped by contribution id, stand-alone rail items and header buttons by Fluent glyph name (`ms-Icon--<Name>`, locale-proof) — tables in `src/features/frame/hubs.ts`; unmapped contributed icons stay ADO's. **Rail** (F6): `--bgColor-inset`, no right hairline and transparent group separators (B5); NavList states — a 6px-radius plate inset 4px/6px, `--control-transparent-bgColor-hover` on hover, `-selected` + a 4px `--borderColor-accent-emphasis` bar on the left edge for the current group (ADO's tinted container and 3px bar removed). The current group's inline sub-page list is hidden. **Sub-page dropdown** (F4, F7–F9): a `gh-menu` via `core/popover` (new `placement: "right-start"`), anchored beside the rail item, headed by the group name, one Octicon + label row per sub-page, the current page selected (NavList bar). Links come from ADO's DOM only: the current group's (hidden) inline list, or ADO's own hover flyout `#__bolt-menu-<group>-callout`, which stays mounted but `visibility: hidden` — the feature hovers ADO's trigger synthetically when the flyout isn't there yet. Clicking an item clicks ADO's own link, resolved by id at click time (re-rendering the flyout if needed), so ADO's router navigates in-app; modifier/middle clicks follow the real `href`. Opens on hover after 250ms (passive: `takeFocus: false` — a text field keeps focus and its keys) and closes 300ms after the pointer leaves item and menu; the caret button at the item's right edge or ArrowRight on the item opens it with focus on the current/first row (arrow roving, Escape returns focus to the item). Single-hub groups (Artifacts) get no dropdown. **Search** (F10): ADO's own `.expandable-search-header` (hidden 2026-08-18 → 2026-11-02) restyled as GitHub's 272×32 box (borderless: `--bgColor-neutral-muted` fill, focus outline kept, B6) with a "Type [/] to search" hint (an `aria-hidden` overlay; the input's placeholder is a blank space so `:placeholder-shown` hides the hint once typed in); ADO keeps its suggestions callout and submit (→ `_search`). `/` focuses it (`github-frame.search`), Escape blurs it. |
| `pr-overview` | Pure CSS, PR Overview restructuring (carved out of chrome-density 2026-08-19): conversation cards (status, Description, comment threads) get GitHub's Box look by CSS (D41), borderless since 2026-11-02 (B1): `--bgColor-muted` surface on the canvas, 6px corners, no border, no shadow, chrome divider lines removed; the nested checks/merge-commit boxes lose their fill (transparent since 2026-11-02, rows sit straight on the card) and a file-anchored thread's path header becomes a Box-header one tint up (`--bgColor-neutral-muted`, no bottom edge), while non-comment feed entries ("pushed n commits") and the Reviewers/Tags/Work items sidebar sit flat against the page (tag-picker input outline removed). Linked work item titles wrap instead of ellipsizing (`table.linked-wit-pr-details`, verified on PR 7288). PR header (2026-11-02): page-title padding from chrome-density above the title, 8px between title and the "proposes to merge" line, 16px before the tabs; the reviewer avatars + vote badges sit on that line right after the target branch — ADO's empty `.flex-grow` spacer between the two `.pr-secondary-title-row` groups is hidden, no node moves. Reviewers render as one merged list (required first, per-row "Required"/"Optional" subtitle tags) instead of two headed groups. The discussion feed runs oldest-first with the composer at the bottom, GitHub-style (Overview feed only — the Updates tab's feed is virtualized and cannot be safely mirrored). |
| `pr-keynav` | Keyboard navigation in the PR Files view (see hotkeys). |
| `pr-thread-filter` | Hides resolved **and closed** threads (plus ADO's collapsed thread sites), leaving a placeholder per thread — click it to reveal that one. In the diff it is a compact secondary `gh-Label` with the comment-discussion octicon; on the Overview feed it is a full-width muted "Resolved comment thread — click to show" row sized to align with the timeline rail icon. Persisted via `GM_setValue`. Toggled from the `pr-comments` widget (its own toolbar button retired 2026-08-02). |
| `workitem-layout` | Work item form restructured GitHub-issue-style (dialog and full page): one readable main column (Description + Discussion) and a 320px right rail, capped at 1250px and centered — header rows and the State/Area subheader join the same column (the 10px type-deco stripe is dropped; the type icon + eyebrow already carry it). ADO's body is already a 3-track CSS grid with exactly three children, so the restructure is pure CSS — regrid to `minmax(0,1fr) 320px`, stack `.work-item-form-right`'s two field columns vertically, reassign grid areas. GH idioms: discussion mirrored oldest-first with the composer last (the PR-Overview column-reverse trick — the comment list is flat, not virtualized), the Description expands to its content in view mode (ADO caps the editor at 460px with an inner scrollbar; editing keeps the cap), comments as GitHub comment boxes, and rail noise removed (Deployment group, Development zero-state hint box). Second pass: Links tab and per-section Maximize toggles removed (Follow and History were too until v0.63.1, D67: Follow is back as an icon-only button — its label is visually hidden, it stays the accessible name — and History is a header icon proxy next to Attachments; the title reserves 460px for the command bar, 530px in the dialog); every rail property renders as a `key: value` row (the label natively stacks above the control); State/Reason/Area/Iteration/Tags live in an adofix-owned "Details" group at the top of the rail with Created by/Created fetched via REST (cached per id). The native subheader controls are NOT moved — React destroys reparented nodes on any tab re-mount without re-creating them (verified live; fields gone until reload) — they become zero-size stubs (not `display:none`) and clicking an adofix row **teleports** the stub to the row's rect (inline `position:fixed`, invisible, `pointer-events:none`) and clicks it, so ADO's own edit callout opens anchored at the row; stub styles restore on the next mousedown outside the control/callout. Third pass: the Implementation ("System Info" on bugs) group is removed (Development was too until v0.63.1, D67) and Planning is absorbed — its fields join the Details KV list (group matched by header text, English-UI; the native group becomes a stub). Teleports render VISIBLE (the live control replaces the row while editing — fields without a callout, e.g. Story Points, are typed into directly); stubs hide via `visibility: hidden`, never `opacity: 0`, because ancestor opacity renders even fixed-position descendants invisible while visibility is overridable per-descendant. Fourth pass: teleports anchor on the VALUE column with the control's own label hidden (`.adofix-wi-teleport`), so the row geometry never shifts; Classification absorbs like Planning; the "Details" list header is gone; the whole tab strip hides (display:none tabs still take `.click()`) with Attachments proxied as a paperclip-octicon toggle (`gh-btn-invisible` + `gh-Counter`) in the header command bar and the "Updated by …" line read live into an Updated KV row. Sixth pass: the comment-count link is back, compacted to ADO's own comment icon + the bare integer (`.wif-comment-count-link-text` trimmed each pass). Fifth pass: the command bar (Save/↻/↶/⋮/paperclip) overlays the FIRST header row next to the dialog's Fullscreen/Close (only the row's direct `.work-item-header-command-bar` child — the class appears twice, nested, and absoluting both collapses the outer to 4px; row 3 must NOT be positioned or it becomes the containing block); State is promoted out of its stub column to the header, left of the assignee (absolute against `.work-item-form-page`, top/left measured per pass from the assignee row's rect — fixed offsets drift when rows reflow — with a resize listener re-placing it); Effort absorbs into the KV list; the Description (text-matched — Repro Steps keeps its header) and Discussion section headers are gone (the 1px divider lives ON the header); comments are 6px boxes on the canvas (gh-Box look by CSS, 16px timeline gap; borderless `--bgColor-muted` surfaces since 2026-11-02, B1) and the composer's text field is the box, not the composer (`--bgColor-neutral-muted` field fill, B6); Related Work always shows (it hid without links until v0.63.1 — its `+` was then unreachable, D67). Header and comments pass (v0.64.0, D68): the command bar (and the dialog's Fullscreen/Close) sit on the eyebrow row ("TASK 36642"), tops measured from that row, with ⋮ kept last (`keepMoreActionsLast`); the title row has no reserve, no ID (a bare text node, hidden by font-size 0 — the eyebrow carries it) and 16px of air above; the title is an adofix view (`ensureWrappingTitle`: wrapping text, click/focus hands over to ADO's input, which stays mounted but visually hidden while not edited); State and the assignee are sized to their text (`fitToText`: canvas-measured, other content summed from the input's ancestor siblings so the set width never feeds back; custom properties on `.work-item-form-page`); the assignee row is one centered flex line; the description header hides for "Description" and this org's "Beskrivelse"; Development and Related Work are both link sections (`groupAction` "links": "Add link" becomes the header "+"); linked items' titles and details wrap; comments use the shared `core/comment.ts` look (also on PR threads), the comment toolbar overlaying the right-aligned date and taking its place on hover. Second pass (v0.64.1): 12px between title and metadata row; the description editor is uncapped in edit mode too (the 460px cap made it shrink on focus) with no focus ring; its first line sits on the first Details row (HTML editor: first block's 14px top margin removed; markdown preview: 8px top padding); Tags get 16px above; the header command buttons get the transparent hover/press tints; the comment count is muted and hidden at 0 (`adofix-wi-count-zero`); linked items read "type heading / icon + title / state · updated" (avatar coin and number hidden, state reordered first, empty detail spans hidden). Third pass (v0.64.2): rail sections 24px apart (group margin only — ADO's 16px rail row gap is off, it also spaced the zero-height section of absorbed stubs, which must stay rendered for the teleport); 10px between "Tags" and its pills; the header is no longer pinned — `.work-item-form-expanded-section-container` stops being a scroll container, so the page (already one) scrolls header and content together. Fourth pass (v0.64.3): body fields never scroll on their own — markdown fields' 420px box cap and the edit textarea's 210px cap are lifted (ADO's auto-grow mirror then sizes it to the text), the HTML editor is height:auto; and markdown fields are click-to-edit (`clickToEditMarkdown`): their only way into edit mode is the "Edit <field>" button in the section header, which the hidden description header had made unreachable — a click on the rendered text (not on a link, not with a selection) presses it. Stage 1 (2026-11-02): GitHub's issue header (32px regular title; the 1px rule below the header block went transparent in the borderless pass, B2), rail groups as GitHub sidebar sections (12px semibold muted headings, 16px + 16px of space between groups — the muted rule is transparent since B2; main-column section headers lose ADO's underline too; KV rows keep their 32px min-height for the teleport), tags as ADO's own `bolt-pill themed-standard` pills since v0.64.0 (the boards' look; `gh-Label--secondary` before), and Related Work's add-link `+` drawn as the `plus` octicon through a CSS mask (`octiconMask` — the button is React-owned, so no `<svg>` child). The form's surface rules (shell/fields/editor to `--bgColor-default`, composer text field boxed, the `--background-color` token override for the sanitizer) also live here since 2026-08-19 (carved out of chrome-density). |
| `card-comments` | Comment counts on board cards (sprint taskboard + kanban, every `.wit-card` with a numeric id in `.font-weight-semibold.selectable-text`): a muted comment-octicon + `gh-Counter` chip (GitHub Projects' card indicator) right-aligned on the id line, only when n > 0. The chip is the id line's last flex item (`margin-left: auto`, -2px block margins so the 20px Counter doesn't grow the 16px line) — not absolutely positioned: Kanban titles share the id line and ran under an absolute chip (2026-11-02); now they wrap beside it. The ⋮ menu is absolute and reserves nothing. Counts via REST `_apis/wit/workitems?ids=…&fields=System.CommentCount` (200-id batches), cached per session; failed chunks retry on a later settle, chips re-render after React re-mounts. |
| `workitem-state` | Hotkey opens a state picker (a `gh-menu`) for the current work item; PATCHes via REST. Each state carries a `dot-fill` octicon colored by ADO's `stateCategory` in GitHub Projects' status colors (Proposed success, InProgress attention, Resolved accent, Completed done, else muted); the current state gets a leading check and `menuitemradio` + `aria-checked`. |

## Features — pull requests

| Feature | What it does |
|---|---|
| `pr-comments` | One small `gh-btn` **n/m** button (comment octicon) in the Files toolbar consolidating four scattered comment controls: the header's "n/m comments resolved" text (hidden, count shown on the button), the native **Filter** button (collapsed by CSS to an invisible stub; the menu's "Advanced filters…" clicks it by proxy — its callout anchors to the stub's position), pr-thread-filter's Hide-resolved toggle, and pr-drafts' panel access ("Drafts · N"). While local drafts exist the button shows their count in a `gh-Counter` so drafts stay visible without opening the menu. The menu itself is core's popover (`gh-menu`). |
| `pr-actions` | Folds the header's "Set auto-complete" split button into the ⋮ More-actions menu. The split button collapses to an invisible stub (kept for proxy clicks and callout anchoring); opening ⋮ injects two native-cloned rows at the top: the button's current primary action (label read live — it tracks state, e.g. "Cancel auto-complete") and "More merge actions…", which opens ADO's own chevron menu (Complete / Mark as draft / Abandon). Bolt's single-callout policy closes the ⋮ menu automatically when the chevron menu opens. |
| `pr-checks` | All checks inline in the Overview status card. ADO's checks box shows only Build policies plus a "View n checks" link — failed optional checks ("Comments must be resolved", "Work items must be linked") are invisible until the panel opens. Fetches `_apis/policy/evaluations` (project GUID → `vstfs:///CodeReview/CodeReviewId/{guid}/{prId}` artifact) and renders the hidden evaluations as rows with GitHub's check octicons below the build rows (approved `check-circle-fill` success, rejected `x-circle-fill` danger, queued/running `dot-fill` attention, else `dot-fill` muted — colored via `data-tone` on `.adofix-check-row`). ADO's own `svg.bolt-status.success/.failed` drawings in the merge-status card (summary icons, build-policy rows, "No merge conflicts") are repainted as the same filled octicons by a CSS mask (`octiconMask`, children hidden — React-owned svgs get no new nodes; timeline and reviewer icons untouched), so every check shows one success and one failure glyph (2026-11-02). The box is found by its "View n checks" row (`.status-details-container:has(> .status-details-container-row)`, minus the merge-commit box): PRs without build policies have no `.preview-check-list` table at all (PR 7339), and anchoring on the table left them with the bare link, hiding the then-redundant "View n checks" link (Re-queue lives on the build row); failures sort first, each row tagged "· Required/Optional". Excludes policy types the card already shows (Build, reviewer counts, merge strategy). One fetch per PR per page load, success and failure both cached until reload. |
| `pr-reviewed` | Mirrors the file tree's **"Mark as reviewed"** checkbox into every stacked per-file header as GitHub's "Viewed"-style toggle: a `gh-btn-sm` labeled "Reviewed" holding a 16px checkbox drawn with `--control-checked-*` tokens and a check octicon, `--bgColor-accent-muted` when checked (revealed on header hover; stays visible once checked, and always visible while a pr-review-flow review is on). Checking it collapses the file's card via ADO's own `.bolt-card-expand-button`; unchecking reopens it. Display state comes from the server's visit data provider (`ms.vss-code-web.pr-detail-visit-data-provider` — its `viewedState` keys are `1@HASH@/path`, and the 8-hex hash could not be reproduced client-side, so writes never forge keys). Toggling clicks ADO's real tree checkbox; when the row is virtualized away, a one-time sweep of the tree maps every path to its flat row index, the tree scrolls there, clicks, and scrolls back. |
| `pr-diff-totals` | Whole-PR diffstat next to "n changed files" in the Files toolbar — the number ADO computes per file but never sums. GitHub order and glyphs since stage 1: green `+adds` before red `−dels` (U+2212; flex `order` — the DOM keeps removed-then-added because `render()` indexes the children), semibold. Data: iterations → changes (`compareTo=0`) → `filediffs` REST (batched **10 per call, a server cap**; 4 concurrent workers; deletes send `originalPath` only — they have no `item.path`). One fetch per PR per page load, success and failure both cached until reload. |
| `backlog-toolbar` | Backlogs page header cleanup: "New Work Item" (removed outright until v0.63.0, D67), "View as Board" and "Column Options" become icon-only buttons in the tab row, inline with View options / Filter (icon-proxy buttons that click the stubbed natives by id at click time — the natives stay mounted because bolt's commandbar **removes** `display:none` commands from the DOM). Scoped to `_backlogs` routes via an `<html>` attribute since the same command ids exist on other Boards-hub pages. The Backlog/Analytics tab toggle is removed outright (Analytics unused), and the whole icon row lifts onto the title row inline with the ⋮ menu (PR-Files-toolbar-merge pattern: click-through container, -50px since the 20px page-title padding (2026-11-02; was -64px), ≥900px only — below that the title would collide with the icons and the row stays put). The title row's own commandbar natively parks the ⋮ 14px below the title's centerline (`align-items: flex-end` in a 50px row); it's pinned to the top so the ⋮, the lifted icons and the title text all share one centerline. The filter bar (`.page-content-top` mount, like the sprint Backlog tab) becomes a compact right-aligned row tight under the header. |
| `backlog-grid` | Backlogs hierarchy grid fits the viewport: ADO's fixed-layout table carries absolute px `<col>` widths (h-scroll when they overflow; a `width:100%` filler col eats the slack when they underflow, so columns never grow). Rewrites col widths — Title takes all slack, data columns shrink proportionally when space is short (Title floors at 280px, data at half natural; beyond that scroll returns). Structural cols (≤80px or rem-width) untouched; external width changes (column drag, Column Options) are adopted as new naturals. Also flattens the grid pane (`.bolt-table-card` background + depth-8 shadow dropped). DOM-gated on `.backlogs-view table.backlog-tree`, so the sprint hub's Backlog tab gets the same treatment. |
| `backlog-status` | Orientation text in the Backlogs title row, after the team name: "Showing 176 of 255 items in area \"AI Platform\" · State: Active, New +2" (the area folds into the sentence; other filters trail as segments; `--fgColor-muted` at 14px since stage 1 — GitHub's meta-beside-title, D63 provisional — centered on the row). Count from the treegrid's `aria-rowcount` (the grid is virtualized — DOM rows can't be counted; the count includes the header row, so items = count − 1), filters parsed from the query string (`System.*` params plus `text` for the keyword box; path values shortened to their leaf). Filtered views read "Showing n of m items": m is captured from the view itself whenever it renders unfiltered (aria-rowcount, stored per org/project/team/level via `GM_setValue`) — REST was measured and rejected (Σ backlog-level endpoints gave 197 where the unfiltered view holds 255+: the view includes Done items and off-area parents the endpoints exclude). m lags until the next unfiltered visit; a stale m < n is suppressed. |
| `sprint-header` | Sprints hub header compressed to two rows (the Backlogs treatment transplanted): "Create Query" removed; "New Work Item" (D67, v0.63.0) and "Column Options" proxied as icons next to Filter through the shared `syncCommandProxies` (core/dom) (native ids differ per tab — `#__bolt-taskboard-*` on Taskboard, plain `#__bolt-*` on the sprint Backlog tab), Analytics and Capacity tabs hidden (the capacity page stays reachable by URL and keeps its Save/Revert row), icon commandbar lifted onto the title row (Taskboard/Backlog only — Capacity keeps Add user/Save/Revert there), sprint/person pickers right-aligned on the title row left of the icons (Capacity: into the tab row's middle instead — 300px left padding clears the tabs), burndown mini-widget and dates block dropped with the date range + days-remaining mirrored as title-row status text (since v0.63.3 the date range is a button that clicks the hidden native `.sprint-dates-button`, opening ADO's Edit iteration dialog — D67), and the inline filter cluster right-aligned in the shared tab row (Taskboard and Backlog tabs; the Backlog tab's bar mounts in `.page-content-top`, not the taskboard's `padding-vertical-16` wrapper, so it collapses -38px against the taskboard's -54). The status text leads with the backlog-status count/filter sentence ("Showing 89 of 120 items in area … · State: … · 1 August - 31 August · 10 work days remaining"): Taskboard counts `.taskboard-card` (NOT virtualized, parent cards excluded), the Backlog tab uses the grid's `aria-rowcount`; the unfiltered total is captured per decoded path (tab+team+iteration) in GM storage, transient zero-card loading states never recorded; Capacity shows dates only. Per-tab scoping via `data-adofix-sprint-header="<tab>"` (registry page scope) on `<html>`; ≥900px for the lifts. |
| `taskboard-columns` | Taskboard column chooser + multi-card rows (ADO offers neither). An adofix-owned icon button (`columns` octicon, `gh-btn-invisible`; accent dot when filtering) next to Filter opens a checklist of the board's state columns — unchecked columns disappear and the rest share the freed width; plus a "2-up cards" toggle that lets cards pack 2-up (or more) wherever a column is wide enough (single-file cards cap at 240px), card counts appended to every column header as a `gh-Counter` (live-updating; `headerName()` strips it only as a suffix), state cells drawn as GitHub Projects column boxes (`--bgColor-muted`, 6px corners inside 4px transparent gutters on all four sides, no outline since the borderless pass — D61, B4), 8px vertical cell padding, the assignment column capped at 180px with wrapping names, assignee names centered on the chevron line (ADO's `margin-top-8` bottom-parks them), and collapsed assignee rows (`td.taskboard-collapsed-row`, natively ADO-grey) sitting flat on the canvas. Preferences persist per org/project/team via `GM_setValue`, stored by state NAME so board reconfiguration can't hide the wrong column; the last visible column can't be hidden. Hiding is generated per-nth-child CSS; load-bearing details in the selector ledger. |
| `pr-drafts` | Batched review comments riding **ADO's own comment composer**. Each stacked per-file header also gets an invisible small comment-octicon button for whole-file comments (natively buried in the file tree's ⋯ menu): it drives ADO's native chain — View → single-file view → tree menu → file-level composer — and the draft capture works there too, anchoring the thread to the file with no line positions: open a comment as usual (the native "Add comment" affordance on a diff line) and a green `gh-btn-primary` **"Comment as draft"** button (GitHub's "Start a review") sits next to Cancel/Comment — it captures the text locally and closes the composer without posting, so ADO's markdown toolbar, @mentions and suggestions all work while drafting. For a line-range draft, select the lines in the diff first, then open the composer on a line inside the selection (Monaco: drag across lines, then open). Works in both diff renderers: the stacked "All changes" view (inline draft cards, edit-in-place) and the single-file Monaco view (`--fgColor-attention` gutter numbers with a dot on drafted lines, plus real Monaco **view-zone cards** below each drafted line — the diff editor's instance is fished out of React internals in `features/pr/monaco.ts`, and zones displace later lines like native threads, auto-spacing the original pane). Each draft also gets a lookalike child row in the file tree under its file (cloned from ADO's native thread rows; clicking it runs Show) — `TREE_SELECTORS.row` excludes these so the shared windowed-path math never sees them. Drafts look like GitHub's pending review comments: flat `gh-Box` cards with a `gh-Label--attention` "Draft" chip, and every draft marker (tree icon, gutter) in `--fgColor-attention`. Drafts persist locally per PR (`GM_setValue`); the pr-comments widget's Drafts entry opens a panel styled as GitHub's "Finish your review" overlay (`gh-Counter` count, invisible `x` close, right-aligned `gh-btn-primary` submit) with show/edit/delete (**Show** navigates to the draft — scrolls the stacked view to its card, or SPA-switches to the file via a virtualized-tree sweep-click and centers the line through the Monaco instance) and a two-stage "Submit all" that posts via the threads REST API — partial failure keeps failed drafts local, progress persists after every attempt, nothing double-posts. Removed-line drafts only in the stacked view. |

| `pr-review-flow` | GitHub-style review flow riding ADO's built-in per-file reviewed state. **Reviewer-gated**: the UI renders only when the signed-in user (via `_apis/connectionData`, cached per page) matches a non-container entry in the PR's `reviewers[]` (group/team membership alone does not match — known limit). The button is GitHub's green `gh-btn-primary` while there is something to do and a default `gh-btn` once done or voted (no caret — it opens no menu); ✓/✕ in its labels render as check/x octicons (`setIconLabel`). After a vote the button turns quiet with the vote label (10 "Approved ✓", 5 "Approved · suggestions", -5 "Waiting for author", -10 "Rejected ✕"); the latest iteration id is stored per PR when a vote (change) is first seen, and when newer iterations land the button flips back to primary **"Re-review · k new"** (k = files from `iterations/{latest}/changes?compareTo={votedIteration}`) — clicking it runs the review loop over just those files ("j/k re-reviewed" counter, done-list persisted per PR; finishing or re-voting re-baselines). The snapshot (reviewers + latest iteration) refetches on settle at most every 30s, plus a forced refetch ~2.5s after any native vote-button click. A **Review** button in the PR header (before Approve, all tabs) starts a per-PR review: lands on the Files tab and jumps to the first unreviewed file; its label tracks state (Review → "Reviewing · n/m" → "Reviewed ✓"). While reviewing, the Files toolbar shows an "n/m files reviewed" counter (click → next unreviewed; ADO's native `.pr-header-viewed-files` text is hidden meanwhile) and, in the single-file view, a "✓ Reviewed · next" action that clicks ADO's real tree checkbox for the open file and advances. Tree order and navigation come from the shared virtualized-tree index (`pr/reviewed-tree`); n comes from the shared viewed-state slot (`pr/reviewed-data`); m is parsed from the toolbar's "n changed files" text and remembered per PR. Once you have approved (vote 10 or 5) the button carries `data-vote` and ADO's Approve main button + divider hide by CSS; the chevron stays as a plain icon button so the vote can still be changed or reset (2026-11-02). |

| `pr-list` | Pure CSS restyle of the PR list page (`…/_git/<repo>/pullrequests`), GitHub-flavored: the list card is GitHub's PR-list Box by CSS (D41), borderless since 2026-11-02 (B2): the card is transparent with 6px corners and no border/shadow (also the Mine tab's two section cards), each row's cells are a `--bgColor-muted` tile and the cells' top (show-lines) and bottom borders take the canvas color and are widened to 4px each (2026-11-02, was 1px), so rows sit 8px apart with the canvas between them; cell content padding is 18px top and bottom (was 9px), the author coin centered vertically; labels keep 12px from the title (Draft → tag group 8px) and the meta line sits 6px below the title line; each row's meta line ends in a diffstat "+adds / −dels · n changed files" (`list-diffstat.ts`: pr-diff-totals' data path per visible row, 2 PRs at a time, cached in userscript storage by `prId@latest source commit` with the 600 newest kept — a revisit costs one iterations GET per row; appended inside the meta span, repaired by the settle re-apply); new activity (`.bolt-list-row-marked`: changes since you last opened the PR) shows as GitHub's 8px accent unread dot in the author cell's gutter instead of ADO's 2px left edge, with every author coin shifted 12px right to clear it (the cell clips overflow, so the dot can't sit in the spacer cell); the Active/Completed/Abandoned tabs carry `gh-Counter` totals (unfiltered, per repo, once per page load) from `countPrs` — a parallel k-ary search over `$top=1&$skip=n` probes, since ADO has no PR count endpoint (≈6 rounds for thousands; verified 53/268/93 against a full paged count 2026-11-02); hover layers `--control-transparent-bgColor-hover` over the tile, the filter bar sits flat, the new-activity edge is `--borderColor-accent-emphasis`, the 32px author coin shrinks to 20px centered on the title line, and every `.bolt-pill` takes `gh-Label` geometry (20px, full radius, 12px medium) — filled, not outlined (B7): the repo-tag pills take `--bgColor-neutral-muted`, and the natively outlined state pills (Draft/Declined/Required) keep ADO's semantic text color with the outline swapped for a 15% `color-mix` wash of that color (core `ado.css`). The meta line and updated column are `--fgColor-muted`, with the "n new push/comments" notice line in `--fgColor-accent`. Selectors are list-page-only (`.repos-pr-list`, `.repos-pr-section-card`, `.repos-pr-listing-filterbar`), so the sheet is inert on PR detail routes. A `nodeValue`-only text sweep (list routes: `route.id === null`) rewrites each row's meta line "{Display Name} request !{id} into {branch}" → "!{id} · {FirstName} · into {branch}" — the meta span is discrete text nodes (verified live 2026-08-20), unknown shapes (localized UI, ADO update) are left alone, and the registry's settle re-apply repairs React re-renders. Header consolidated to ONE bar (tabs left; keyword + filter items right-packed; native filter toggle; New PR button) — the title text hides (breadcrumb carries it), and the tab bar + filter wrapper lift onto the title row as click-through overlays (pointer-events none on containers, auto on interactive children; z-index 4 out-stacks the header's flex-item z-index 3; the filter lift is ≥1400px — below that it stays a second row). The **Mine view is retired**: its tab hides and Mine/bare-URL landings auto-click the Active tab (`#__bolt-tab-active`; bolt tab ids are stable). Because the header rules target generic bolt chrome, they're gated on a `data-adofix-pr-list` (registry page scope) `<html>` attribute and the feature registers areas `*` so the attribute clears on every navigation (backlog-toolbar precedent). The Mine view's replacement was an accent wash on authored/reviewing rows; stage 1 retired the wash (GitHub's list has no equivalent) but kept the **"mine" tagging** as the hook for a stage-3 GitHub-style signal (D8/D40, provisional): rows get `data-adofix-mine="author"|"reviewer"` and, since v0.63.2 (D67), an accent `gh-Label` "Author" / "Reviewer" right after the title — identity from `pr/reviewer-api`'s connectionData slot, per-PR `createdBy`/`reviewers[]` from `pullrequests?searchCriteria.status=active` (`pr/list-api`, individual undeclined reviewer entries only), one fetch per repo per page load with success and failure both cached until reload (pr-checks precedent); the active-only fetch means Completed/Abandoned rows never match. |

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
| `/` | focus the header search box (Escape leaves it) | everywhere |

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
- **connectionData needs a -preview api-version** (bit us 2026-08-19):
  `_apis/connectionData?api-version=7.1` is a 400 — the resource is
  preview-only, so the identity fetch must pin `7.1-preview.1` (200).
  apiFetch's auto-appended default made the reviewer gate silently hide the
  Review button for everyone. The reviewer-entry ids in `reviewers[]` DO
  equal connectionData's authenticatedUser.id (verified across 4 live PRs).
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

- PR list page (verified live 2026-08-20, `…/_git/<repo>/pullrequests`):
  rows are `a.bolt-table-row[href*="/pullrequest/"]` in
  `table.repos-pr-list.bolt-table-show-lines` inside
  `.repos-pr-section-card.bolt-card` (the Mine tab renders one card per
  section, same row DOM). The new-activity marker is a **2px border-left on
  the row's first `td.bolt-table-spacer-cell`** (rgb(82,143,217)) — not on
  the row, not a pseudo-element. The author coin is the only `.size32` coin
  (reviewer coins are `size24`); title line sits at top 11px / height 17.5px
  in a 56px row, so a 20px coin centers on it via `align-items: flex-start`
  + 10px top margin. State pills (Draft/Declined/Required) are natively
  `outlined` with semantic colors (`repos-pr-list-draft-pill` etc.); repo
  tags are filled `standard` pills. The updated cell's "Updated " prefix is
  a bare text node in a classless div around `span.text-ellipsis > time.bolt-time-item`
  (muting target: the div via `:has()`); rows with news use a
  `.repos-pr-list-updates.flex-column` cell whose first line is
  `.font-weight-semibold` (the "n new push/comments" notice). The meta line
  span is discrete text nodes: `[name][" request !"][id][" into "][icon
  span][monospaced-xs branch span]`. Filter bar:
  `.repos-pr-listing-filterbar.depth-8`. Header stack (all flex children of
  `.bolt-page`): `.bolt-header` 59px (title area + commandbar with the New
  PR button) → `.bolt-tabbar` 48px (tabs + a commandbar holding the filter
  toggle; tab ids `#__bolt-tab-mine/-active/-completed/-abandoned`) → filter
  wrapper `.page-content-left.page-content-right.page-content-top` 67px
  (present only while toggled on; its `.vss-FilterBar--list` holds the
  keyword item, three 230–270px dropdown items and `--right-items` = the
  clear X) → `.page-content` with the card. **The header is a flex item
  with `z-index: 3`** — overlays lifted onto it need z-index 4+, and
  z-index works on flex items at position:static. Hiding
  `.bolt-header-title-area` collapses the commandbar to the LEFT (the title
  area was its flex-grow spacer) — restore with margin-left:auto.

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

- **Borderless pass — verified live 2026-11-02 (dark)** on the PR list,
  PR overview, PR files, repo files, work item 36642 and the Kanban board.
  A dev-build border census (every visible element's non-transparent
  border sides and inset shadows, written to an `<html>` attribute and read
  with the `attr` probe) found only the kept kinds: selected-tab underlines
  (`.bolt-tab-inner-container`, 2px accent), the PR list's canvas-colored
  row gap borders and new-activity edge, the files-tree checkbox, kanban
  state dots (`.work-item-state-circle`). It also caught ADO's main-column
  section-header underline (`.work-item-form-collapsible-header`, now
  transparent). Every live `--border-subtle-color` use is a border
  (header shadow, in-app feedback file list, required-fields group). Work
  item form fields are `.bolt-textfield` inside `[class*="work-item-"]`
  containers whose chrome ADO shows only on hover
  (`.work-item-form-control-content:not(.show-border) …:not(:hover)`), and
  the header title/assignee carry `.not-active` at rest.

- **PR detail + sprint header polish — verified live 2026-11-02 (dark and
  light)** on PR 7331 (failed checks), PR 7288 (linked work item, tags, two
  reviewers), the sprint taskboard and Backlog tab, and the Backlogs page.
  PR header: `.repos-pr-header` > `.flex-column` > title `.flex-row` +
  `.flex-row.flex-column@xsmall` holding `.pr-secondary-title-row`
  (persona + `.pr-header-branches`), an empty `div.flex-grow`, then a
  second `.pr-secondary-title-row` with `.pr-header-reviewers`. The PR title
  is an editable `.repos-pr-title.bolt-textfield`. Merge-status card icons
  are `svg.bolt-status.{success,failed,active,…}` (24px with `.margin-4` in
  the summary rows, 16px in `.preview-check-list` rows). The focused
  composer's hint is `span.bolt-formitem-message > .markdown-text-container`
  (validation messages share `.bolt-formitem-message`). Linked work items:
  `table.linked-wit-pr-details .bolt-table-two-line-cell-item >
  a.text-ellipsis`. Header alignment, measured as centerlines: with the
  page-title padding at 20px the sprint title row's center is y=85 on both
  sprint tabs; lifts are taskboard −36px icons / −32px pickers, Backlog tab
  −38 / −34 (its tab row sits 2px lower), Backlogs page −50px margin.
  The padding is one variable, `--adofix-title-pad` (chrome.css; pr-list
  sets 32px on its page scope), and the lifts do NOT depend on it: the
  lifted rows hang below the header, which grows with the padding.
  Verified live 2026-11-02 by building with 30px: title, Filter icon and
  pickers all moved 85 → 95 together on the taskboard, sprint Backlog tab
  and Backlogs page (a calc() coupling was tried first and doubled the
  shift — don't reintroduce one).
  Browser Back from a PR (v0.61.1): the URL turns into the list's while
  ADO keeps rendering the PR page for a moment, so the `data-adofix-pr-list`
  page scope is set only once `.repos-pr-details-page` is gone. Otherwise the
  list-only header rules (tab-row lift, hidden `.bolt-header-title-area`)
  mangle the PR header: tabs over the meta line, section headers gone.
  PR list (v0.59.4): the page header's top padding is 32px here (20px
  elsewhere; since v0.62.3 by setting `--adofix-title-pad` on the page
  scope instead of a selector written to out-specify chrome.css); the tab-row and filter lifts hang off the header's bottom
  edge, so they need no change when that padding changes.
  The Filter toggle (`#__bolt-filter`, the tab row's only command) is
  `visibility: hidden` while `.repos-pr-listing-filterbar` exists (the
  wrapper only mounts while the bar is toggled on); display:none would push
  it into bolt's overflow menu.
  PR list (v0.57.1): with the 55px header the lifted tab row needs
  `top: 13px` and the filter wrapper `top: 5px` to share the New PR
  button's centerline (y≈85.5, measured). Filter items (v0.57.2): natively
  220x27 keyword, 270x35 identity pickers (their `.bolt-textfield` has
  `min-width: 270px`, and the flex wrappers' `min-width: auto` grows them
  to the input's intrinsic width), 230x32 Target branch
  (`.repos-version-dropdown-filterbaritem`, whose wrapper column has no
  flex-grow); unified to 220x32 with 8px gaps. Our review button
  (`.adofix-review-btn`) is the vote split-button's previous sibling and
  carries `data-vote`. ADO's focused-field ring is
  `.bolt-textfield.focused.focus-treatment` (accent border + 3px pulsing
  glow, `ms-focus-shadow-with-border-pulse`); the focused state can't be
  reproduced in the Claude window (no OS focus), so its override was
  verified by rule presence only.
  Probe results come back truncated at ~1.2 KB: chunk larger dumps into
  several `<html>` attributes from a dev footer.

- **Global frame (github-frame) — verified live 2026-11-02 (dark)** on the
  PR list, PR files, repo files, Kanban board and work item pages:
  - Header row `.project-header` = `.region-header` (logo
    `a.suite-logo > img.suite-image`, a cdn.vsassets.io SVG that works as a
    CSS mask; breadcrumb `.bolt-breadcrumb-list-item` > `.bolt-breadcrumb-item a
    .bolt-breadcrumb-item-text`, dividers `.bolt-breadcrumb-divider`,
    selectors in `#__bolt-breadcrumb-extra-content`; search
    `.expandable-search-header > .search[role=search]` = `.search-icon` +
    `input#l1-search-input.search-input`) + `.region-header-menubar` (icon
    buttons `.bolt-button.icon-only` with `ms-Icon--CheckList/Shop/Unknown/
    PlayerSettings`, avatar `#mectrl_headerPicture`). ADO stretches
    `.search` (`align-self: stretch`), which pins a fixed-height box to the
    top — it needs `align-self: center`. ADO's search box, on Enter, routes
    to `_search?text=…`; its help/suggestions callout is
    `.search-help-callout`.
  - Rail `.project-navigation`: groups are
    `.hub-group-container > [.bolt-expandable-container >]
    a.hub-group#__bolt-<contribution>-link` with an `<img>` icon in
    `.navigation-icon`; the current group has no expandable container and
    renders its sub-pages inline (`:scope > [role=menu] > a.hub`,
    `.displayed` = current page). ADO's selected look is the container's
    tint + a 3px `::before` bar. Every other group renders its sub-pages
    only on hover — dispatching `mouseenter`/`mouseover` on the
    `.bolt-expandable-container` renders `.bolt-callout#__bolt-menu-<group>-callout`
    with `a.bolt-menuitem-row[role=menuitem]#__bolt-<contribution>` rows,
    and `mouseleave`/`mouseout` removes it. `.click()` on those rows (or the
    hidden inline links) navigates in-app (same document). Artifacts is a
    single hub: no container, no flyout. Stand-alone items:
    `#__bolt-create-action` (`ms-Icon--Add`), `#__bolt-settings-link`
    (`ms-Icon--Settings`), `#project-expansion-toggle`
    (`ms-Icon--DoubleChevronRight` collapsed; `…Left` expanded, inferred).
    The expanded (labelled) rail was NOT checked live — toggling it writes a
    user preference.
  - The live-browser harness only synthesizes `pointermove`/`mousemove`
    for hovers (no `mouseover`/`mouseenter`, no `:hover`), so the rail
    binds `mousemove` too; real-pointer hover and `:hover` plates were
    checked through the open-menu state, not a real cursor.

- **GitHub makeover stage 1 — NOT yet verified live (stage 1, 2026-11-02).**
  Live probes became unavailable mid-run (design-decisions D10a), so
  everything below was written from code, `azure-devops-ui` sources and the
  earlier ledger entries. Re-check in both ADO themes before trusting it:
  - Theme signal (D3): `body.ms-vss-web-vsts-theme-dark` was observed in
    the dark theme only; the light and high-contrast class names
    (`…-theme-light`, `…-theme-hc-dark`/`-hc-light`) are inferred. No
    theme class at all → luminance of ADO's own body background.
  - Bridge variable list (D4): the 84 variables `azure-devops-ui@2.281.0`'s
    CSS consumes, set on `html body` with `!important` (D5). ADO's own
    non-bolt bundles may read more; check with a live dump. The
    `--palette-*` formulas (D12) need the side-by-side look, especially
    `--palette-black-alpha-*` in dark (ADO's dialog scrim uses
    black-alpha-20, now a light veil).
  - Canvas takeover: the explicit canvas rules on `.bolt-page`,
    `.region-header`, `.region-header-menubar`, `.project-header`, the
    sticky `th`s on taskboard/backlog grids, `.repos-pr-details-page`,
    `.repos-changes-explorer-splitter`, `.repos-pr-details-page-tabbar`,
    `.project-navigation`, `.kanban-board` and
    `.kanban-board-column-header-container` were deleted — these now rely
    on the bridge reaching them through ADO's variables. Any that paint a
    hard-coded grey need a selector fallback in the bridge.
  - Font override (D14): icon-font exemption by `[class*="icon" i]`
    (`.fabric-icon`, `.ms-Icon--*`, `.bowtie-icon`), `.monospaced-*` and
    `.monaco-editor`; confirm no glyph renders as a letter.
  - PR list (D42): `.repos-pr-list .bolt-pill` gets gh-Label geometry on
    every pill type (inner `.bolt-pill-content` padding unchecked); meta
    line color via `.repos-pr-list a[href*="/pullrequest/"] .secondary-text.body-s`.
  - PR overview (D43): `.comment-file-header` as a Box-header assumes it is
    the card's first child (top-corner radius); `.status-details-container`
    as wells (canvas-colored since the borderless pass). Plain comment cards have no verified header-row
    selector yet, so they get no Box-header.
  - Work item form (D65/D66): title `.work-item-form-header > :nth-child(2) input`
    at 32px (a fixed-height bolt textfield may clip it); rail sections
    `.work-item-form-right .work-item-form-group` and
    `.work-item-form-collapsible-header`; comment boxes on
    `.comment-item.displayed-comment` (padding unchecked); composer border on
    `.discussion-new-comment .markdown-editor`.
  - Boards (D61): kanban `.kanban-board-column` border + radius; taskboard
    cells boxed on all four sides — `border-radius` is ignored if the table
    collapses borders, and each parent row now reads as its own set of
    column boxes (+8px per row).
  - Card comments (D62): chip `top` 22px → 20px, centering the 20px
    Counter on the id line. Superseded 2026-11-02: the chip flows in the
    id line (`.flex-row.full-width` = `.rhythm-horizontal-8` [icon, id,
    title link] + absolute `.card-context-menu`), verified live on the
    Kanban board — "Integration: AIP x Akapedia - part 1" wraps beside
    the chip instead of under it.
  - adofix buttons (D47/D26): toolbar buttons are `gh-btn` (32px square
    icon buttons; Files-toolbar ones `gh-btn-sm`, 4px shorter than ADO's
    32px controls); `makeCommandProxy`'s cloned ADO font icons lose bolt's
    icon sizing rules. "Comment as draft" (green) sits next to ADO's blue
    Comment button (D21).

Remaining unverified (inert if wrong): swimlane header rules in `density.css`
(`grep -rn "TODO(selector)" src/`). Footer-text status fallback assumes an
English ADO UI.

After an ADO UI update breaks something: re-verify the constants in
`THREAD_SELECTORS` / `KEYNAV_SELECTORS` / `density.css`,
preferring `aria-label` / `role` / `data-*` / semantic class names — never
generated class hashes — and update the date in the comment.

## Primer foundation

`src/core/primer/` makes ADO look like GitHub: GitHub's (Primer's) tokens,
an ADO → Primer variable bridge, GitHub font families, `gh-` component
classes and Octicons. Always on and owned by core, not a toggleable
feature. Stage 1 of the GitHub makeover (spec
`docs/specs/2026-11-02-github-foundation-design.md`, decisions in
`docs/plans/design-decisions.md`). It replaced the old look: the `ACCENT`
purple, the `--adofix-bg/-lane/-card/-radius/-ink` tokens, the `#141414`
canvas with lane/card layering, and the heavy-shadow cards are all gone.
Layout of ADO's own pages does not change in this stage.

**Tokens are build-time.** `@primer/primitives` (devDependency, pinned
exact) is read by `build.mjs`, which bundles `build-css.ts` on the fly and
serves the result as text modules `virtual:primer/tokens` and
`virtual:primer/bridge` (D10). Nothing loads at runtime. The size,
typography and base-typography files ship whole, comments stripped
(`viewport.css` is skipped: `@custom-media` only). The dark and light theme
files are ~240 KB, as big as the whole script, so `prune.ts` cuts them to
the custom properties `src/**` actually references (`var(--name)`, tests
excluded) plus everything those alias in turn (Primer tokens chain:
`--focus-outlineColor` → `--focus-outline-color` → a hex). Only each theme
file's first rule is kept; the `@media (prefers-color-scheme)` copy for
`data-color-mode="auto"` is dead weight because we always write an explicit
mode. A referenced name with a Primer head (`fgColor`, `bgColor`, `text`,
`focus`, … list in `prune.ts`) that Primer doesn't define fails the build —
an undefined `var()` silently falls back to the property's initial value.
The bridge's own ADO variables (`--text-primary-color`,
`--focus-border-color`) are exempt (D11). Token names are Primer's own,
unprefixed, so CSS copied from GitHub works as-is.

**Theme sync** (`theme.ts`). GitHub Dark Default when ADO is dark, GitHub
Light when it is light. Writes `data-color-mode="dark|light"`,
`data-dark-theme="dark"`, `data-light-theme="light"` on `<html>` (what
Primer's theme selectors key off) and `data-adofix-bridge` unless ADO is in
high contrast. Runs at boot, on every settle, and — via `watchTheme()`, an
undebounced `MutationObserver` on body's `class` attribute started by
`injectPrimer` — the moment ADO writes its theme class, writing only changed
attributes, so an ADO theme switch follows without a reload. Signal, in
order: (1) ADO's body theme class (`ms-vss-web-vsts-theme-dark`;
`/theme-(hc-)?dark/` → dark, `/theme-hc/` → high contrast — only the dark
name is observed, D3); (2) the class-derived state of an earlier page load,
persisted through `core/storage` (`adofix.primer.theme`; GM storage is
synchronous in Violentmonkey, so it is there at boot); (3) the WCAG
luminance of ADO's OWN body background (< 0.5 → dark), read with the bridge
sheet briefly `disabled` — the bridge overrides `--background-color`, so
reading through it would measure our canvas and never follow a switch to
light. Unreadable → light (ADO's default). Only class-derived states are
persisted, and only when they change. Why (2): at document-idle the class
is usually NOT on body yet (live 2026-11-02: 5 of 5 page loads booted
without it), and the luminance guess read ADO's pre-theme light canvas —
dark users saw a light flash until the next settle. With the persisted
state the boot mode was already "dark" and never changed on all 5 loads.

**High contrast.** Without `data-adofix-bridge` the bridge and the font
override don't apply, so ADO's accessibility theme stays intact.
`data-color-mode` is still set, so adofix's own UI keeps resolving its
Primer tokens (features have no color fallbacks of their own).

**ADO variable bridge** (`bridge.ts`, data emitted at build time). ADO's
bolt components paint from CSS variables, so setting those recolors every
page at once, including corners no feature touches. The list is the 84
variables `azure-devops-ui@2.281.0`'s CSS consumes (D4, not yet checked
against a live dump). Emitted on `html[data-adofix-bridge] body` with
`!important` (D5: ADO's theme may set them inline on body). Two kinds:
- semantic variables hold whole colors and map to `var(--primer-token)`,
  so they follow `data-color-mode` by themselves: canvas →
  `--bgColor-default`, callouts → `--overlay-bgColor`, text →
  `--fgColor-default/-muted/-disabled`, borders → `--borderColor-*`, ADO's
  "communication" blue → Primer accent, statuses → success / attention /
  danger / accent families, grid hover/selection → control and accent-muted
  tokens, focus → `--focus-outlineColor`;
- `--palette-*` variables are bare `r, g, b` triples
  (`rgba(var(--palette-neutral-8), 1)`), which a `var()` can't produce, so
  the build computes them per theme from Primer's resolved hex values
  (translucent tokens composited over the canvas) into one rule per
  `data-color-mode`. With BG = canvas, FG = text, A = accent-emphasis:
  neutral-N = BG→FG by N%; primary tints = A→BG; primary shades = A→FG
  (toward the text color, not black, so shade-30 link-hover text stays
  legible on the dark canvas); darkened-6/10 = A→black (button hover/press
  under white text); accent3 = severe (orange); error = danger-emphasis
  darkened 0/12/20%; black-alpha-N = FG at N% alpha (a light veil in dark);
  callout/panel shadow colors from Primer's floating-small/-large shadows.
  The percentages reproduce ADO's light defaults from its white canvas and
  `#0078d4` (D12, provisional). The full table is the comment in `bridge.ts`.
`--third-party-icon-filter` is deliberately unmapped (a filter, not a
color, already right for ADO's theme).

**Fonts** (`type.css`): families only. `--fontStack-sansSerif` (GitHub's
stack) is forced with `!important` on body and every descendant, because
ADO's legacy bundles declare fonts on their own elements. Exempt: anything
with `icon` in a class, any case (FabricIcons, Fluent `ms-Icon--*`,
`.bowtie-icon` — broad on purpose so glyphs never turn into letters), code,
`.monospaced-*` and Monaco. Code/pre/kbd/samp and `.monospaced-*` get
`--fontStack-monospace`; Monaco measures its own glyphs and is left alone.
Sizes and line heights stay ADO's: they move rows and break the
measured-size tricks (stub-hide, teleport). Later stages set GitHub's sizes
per page.

**Components** (`components.css`): Primer patterns with a `gh-` prefix so
they never collide with ADO's or third-party classes — `gh-btn` (+
`-sm`, `-primary` green, `-danger`, `-invisible`), `gh-Label` (+
`--secondary/-accent/-success/-attention/-danger/-done`), `gh-Counter`,
`gh-Box` / `gh-Box-header` / `gh-Box-row`, `gh-menu` / `gh-menu-item` /
`gh-menu-divider` (ActionList overlay; core's popover is built on it),
`gh-tooltipped` (+ `-n`, CSS-only from `aria-label`). gh- classes go only
on elements adofix creates. React-owned ADO elements (PR-list card and
pills, overview cards, work item comments) get the same look from feature
CSS on their own selectors, because React overwrites `className` on
re-render (D41). `.adofix-surface` (core/dom) is now GitHub's overlay:
`--overlay-bgColor`, transparent border, 6px radius, floating-small shadow.

**Borderless** (user preference 2026-11-02, decisions
`docs/plans/design-decisions-borderless.md` B1–B20). Surfaces separate by
background steps, never hairlines: canvas `--bgColor-default` (in dark it
is the frame's `--bgColor-inset` black, B19) < surface
`--bgColor-muted` < hover/selected tints. Borders keep their width in
`transparent` so no geometry moves. gh- components: `gh-btn` default is
filled with no border or resting shadow (primary stays solid green,
invisible stays invisible); `gh-Label` variants are filled `-muted` tints;
`gh-Counter` drops its border; `gh-Box` is a `--bgColor-muted` surface with
a `--bgColor-neutral-muted` header; `gh-Box-row`s are muted tiles 2px apart
(a Box holding rows goes transparent so the canvas shows between them —
the one list recipe, B2); `gh-menu-divider` is space only. Overlays keep
`--shadow-floating-small` (B3). Form fields get the translucent
`--bgColor-neutral-muted` fill (B6), except fields that sit in content —
comment/reply composers (PR and work item), the PR title and tag pickers —
which have no fill at all and a `--fgColor-disabled` placeholder (B15). The
"Markdown supported…" hint under a focused comment field is hidden (B15). ADO's own components: `ado.css`
(injected and re-healed with the bridge, scoped `html[data-adofix-bridge]`
so high contrast is untouched) clears targeted divider/outline borders
(`.separator-line-*`, `.subtle-border`, tab list, master panel, filter
items, dropdown headers, card headers), fills `.bolt-textfield` /
`.bolt-tag-picker` (except focused/error/warning, inline/hide-border/subtle
fields and work item form fields, which read as text until hover — their
hover outline becomes the fill), and swaps outlined pills' outline for a
15% wash of their own color. The bridge maps only
`--border-subtle-color` and `--component-grid-cell-bottom-border-color` to
`transparent` (every use is a border, checked against azure-devops-ui and a
live rules dump, B9). Kept: focus rings, checkbox/radio/toggle outlines,
selected-tab underlines, the selected-row / new-activity marker edges, the
timeline spine and status dots.

**Octicons** (`icons.ts`, `icons.gen.ts`). `octicon(name, size = 16)` →
an `aria-hidden` `<svg class="octicon octicon-NAME">` filled with
`currentColor`, using the hand-tuned 24px drawing at 24px and up and the
16px one below. `icons.gen.ts` is generated by `pnpm icons`
(`scripts/icons.mjs`) from `@primer/octicons` (pinned exact) and holds only
the names in `scripts/icons.txt`, because the package isn't
tree-shakable. The generated file is committed; add a name to the list and
rerun. Unknown names throw (the type catches literals, the throw catches
strings).

**Injection order** (`index.ts`). `injectPrimer()` at boot, before the
base sheet and every feature sheet: tokens, bridge, type, ado, components,
then a theme sync and the body-class watch. Feature rules must win
equal-specificity ties against gh- classes. `syncPrimer()` on every settle
syncs the theme and re-heals only the bridge, type and ado sheets — they override ADO's declarations and must
stay after ADO's lazy chunks; tokens and components are deliberately left
ahead of the feature sheets (D13).

**Guard test** (`no-raw-colors.test.ts`). Fails on any raw color
(`#rgb[a]`/`#rrggbb[aa]` as a value, `rgb(a)(`, `hsl(a)(`) in
`src/features/**`, `src/styles/**` or `src/core/*.ts`. Tests and
`core/primer` are exempt. Colors live in the foundation, so the GitHub
look and dark/light stay in one place.

**vitest.** `vitest.config.ts` resolves `virtual:primer/*` to an empty
string (D7): features import `octicon` from `core/primer`, whose index
imports the esbuild-only virtual modules, and tests don't need the real
sheets.

**Known unthemed surfaces** (left for later stages):
- the Monaco diff/code editor (own theme API) → stage 3 (stage 4 for file
  view);
- charts, analytics and dashboard widgets;
- anything with inline `style` colors or canvas rendering;
- ADO's icon-font glyphs: colors follow text, shapes stay ADO's → each
  stage swaps the icons on its pages.

## Architecture

Core modules are factories composed once in `main.ts`; tests construct fresh
instances. (Feature files DO hold module-level session state — fetch caches,
wiring flags — that lasts the page lifetime by design.)

- `src/main.ts` — bootstrap: injects the Primer foundation
  (`injectPrimer`) and then the base sheet, then `createRouter()` +
  `createHotkeys()` + `createRegistry()`, registers features, wires the
  observer (each settle runs `syncPrimer()` before the features).
- `src/core/primer/` — the GitHub (Primer) foundation: build-time tokens
  and pruning, theme sync, the ADO variable bridge, font families, `gh-`
  components and `octicon()`. See "Primer foundation" above.
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
  Page scope (v0.62.0): a feature whose CSS targets chrome other pages share
  declares `scope(route)` (route test plus any DOM test, e.g. pr-list's
  "no `.repos-pr-details-page`"); the registry evaluates it on every pass,
  mirrors it on `<html>` as `data-adofix-<feature-id>` (string value or
  empty) and clears it on every route outside the feature's areas — so the
  attribute can never go stale after SPA navigation to another hub (the
  old per-feature toggles in backlog-toolbar and sprint-header did, since
  their apply() never ran off-boards). Out of scope, `apply()` is skipped.
  CSS selects it via `scopeSelector(id[, value])`. Users: pr-list,
  backlog-toolbar, sprint-header.
- `src/core/dom.ts` — `injectStyleOnce`/`setStyle` (self-healing re-append
  when ADO's lazy-loaded sheets land after ours), the base sheet
  (`injectBaseStyle`: `.adofix-surface` as GitHub's overlay, focus flash,
  toast), `stubHide` (the zero-size visibility-hidden stub recipe),
  `makeToolbarButton`/`makeCommandProxy` (`gh-btn gh-btn-invisible` 32px
  icon buttons), `ensureText`, `safeQuery`, `showToast` (Primer's Toast:
  accent icon block + content).
- `src/core/api.ts` — typed same-origin REST wrappers, `api-version=7.1`,
  errors returned as values (Phase 2 needs partial-failure handling);
  `(org, project)` travels as a `ProjectRef`; `projectBase` is the one
  builder of project-scoped paths (legacy visualstudio.com-safe).
- `src/core/fetch-cache.ts` — the fetch-once/latch-failure state machine
  every REST feature caches through (the v0.6.0 request-flood guard);
  failure policy per cache: latch (default) or retry. `load(key, fetch,
  onSettled)` is the whole single-key flow (cached value, else claim +
  fetch; `fetch` resolves null on failure; `onSettled` paints a value that
  lands between settle passes) — pr-checks, pr-diff-totals,
  workitem-layout's Created rows and pr-list's ownership, tab counts and
  row diffstats (keyed per repo) all go through it (v0.62.4).
- `src/core/popover.ts` — the shared light-dismiss menu (outside-mousedown,
  Escape, arrow roving, `data-adofix-modal` hotkey suspension; placement
  `below-end` or `right-start`; `takeFocus: false` for hover-opened menus
  that leave focus and a focused field's keys alone; focus returns to the
  anchor on close only if it was inside the menu) with
  `menuItem`/`menuStatus`/`menuDivider` building blocks, rendered as a
  `gh-menu` (check octicon in an always-reserved slot, `gh-Counter` counts;
  no `aria-checked` on toggle items — D46).
- `src/core/storage.ts` — the only caller of `GM_getValue`/`GM_setValue`;
  namespaced keys (`adofix.<feature>.<key>`) with a schema version envelope.
- `src/core/keys.ts` — `createHotkeys()`: single capture-phase keydown
  listener; ignores inputs/contenteditable and adofix modals; default keys
  live on the registrations.
- Shared feature modules mirror `src/features/pr/`:
  `src/features/boards/` (filter parsing, status formatting, unfiltered-total
  memory, boards-hub path/scope helpers) and `src/features/workitem/`
  (English-UI label matches + string transforms in `fields.ts`, the
  teleport-edit machinery in `teleport.ts`) and `src/features/frame/`
  (`hubs.ts`: the frame's Octicon tables and ADO hub-link extraction) —
  all with colocated tests.

