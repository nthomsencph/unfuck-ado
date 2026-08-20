# pr-list — GitHub-style restyle of the PR list page

**Date:** 2026-08-20
**Status:** approved design, pending implementation

## Problem

The PR list (`/_git/<repo>/pullrequests`) is untouched territory: a flat
full-width `bolt-table` card with loud separators, a bulky 32px author coin
per row, noisy pills, and a meta line of word salad ("Fabian Syv.ai konsulent
request !7040 into main"). Every other PR surface (overview, files) already
carries the adofix card theme; the list should read as the same product.
GitHub's PR list is the model: one calm rounded container, quiet hairlines,
subtle hover, state pills that whisper, a one-line meta with number, author
and target.

## Decisions (from brainstorming)

- **Depth:** reskin + row rework via CSS, using only data already in the DOM
  — no REST enrichment, no per-row vote/re-review chips (deliberately out of
  scope; can layer on later).
- **Row lead:** keep the author avatar but shrink it to ~20px, centered on
  the title line — face-scanning stays, bulk goes. (Not GitHub's state icon.)
- **Meta line:** rewritten by a small JS text sweep to `!7039 · Nicolai ·
  into main` (first whitespace token of the display name). The updated-time
  column **stays** as its own muted right column so "1 new push" / "2 new
  comments" notices keep their home. (Not the full GitHub fold-in — moving
  the `<time>` across table cells means DOM surgery React would fight.)

## Verified DOM (live, 2026-08-20, Chrome on client ADO)

- Container: `table.repos-pr-list.bolt-table.bolt-table-show-lines` inside
  `.repos-pr-section-card.bolt-card`, under `.page-content`.
- Rows are `a.bolt-table-row[href*="/pullrequest/"]`; the "new activity"
  marker class is `bolt-list-row-marked` (blue left edge).
- Cells in order: compact spacer · avatar (`.bolt-coin.size32`) · two-line
  cell (`.body-l` title + `.secondary-text.body-s` meta) · reviewers
  (`.bolt-coin`s with vote overlays) · comments
  (`.repos-pr-list-comment-count`, `.has-active-comments` variant) · time
  (`time.bolt-time-item`) · side-action · compact spacer.
- Meta line span children are **discrete text nodes**:
  `[""] [displayName] [" request !"] [id] [" into "] [branch-icon span]
  [monospaced-xs branch span] [""]` — rewriting is pure `nodeValue`
  assignment, no structural change.
- Pills observed: `aiplatform` (repo tag), `Declined`, `Draft`, `Required`
  (`.bolt-pill-content`).
- Filter bar: `.repos-pr-listing-filterbar.vss-FilterBar.depth-8`.
- Tab bar: `.bolt-tabbar.bolt-tabbar-grey` (Mine / Active / Completed /
  Abandoned). The Mine tab renders **multiple** `.repos-pr-section-card`s
  ("Created by me", "Assigned to me" with Active/Reviewed/Declined
  sub-tabs); same row DOM throughout.

## Design

### 1. Feature wiring

- New feature `src/features/pr-list.ts`, id `pr-list`,
  `areas: ["repos-pr"]`, registered in `main.ts`.
- CSS injected unconditionally via `injectStyleOnce` — every selector is
  scoped under list-only classes (`.repos-pr-list`,
  `.repos-pr-section-card`, `.repos-pr-listing-filterbar`) that do not
  exist on PR detail pages.
- The meta-line sweep runs in `apply(route)` guarded on
  `route.id === null`; the registry re-runs `apply` on every route change
  and debounced DOM settle, which is the sweep's repair loop — no dedicated
  observer.

### 2. Material (CSS)

- `.repos-pr-section-card.bolt-card` gets the pr-overview card recipe:
  `background: var(--adofix-card)`, `border-radius: var(--adofix-radius)`,
  shadow `0 8px 24px rgba(0,0,0,.6), 0 1px 4px rgba(0,0,0,.5)`.
- Filter bar: `depth-8` shadow removed, background blended with the page.
- Row separators (`bolt-table-show-lines`): softened to a faint grey
  hairline (`rgba(128,128,128,0.12)`-ish, tuned live).
- Row hover: subtle tint (`rgba(128,128,128,0.06)`-ish, tuned live).
- `bolt-list-row-marked` left edge recolored to `ACCENT` (#8250df).

### 3. Rows (CSS)

- Author coin: 32 → ~20px (both the `.bolt-coin` box and its
  `.bolt-coin-content` image), vertically centered on the title line.
- Pills: GitHub-outline style — transparent background, 1px border,
  smaller text; semantic colors kept (Draft blue-ish, Declined/Required
  red-ish, repo tags neutral secondary).
- Comment counts unchanged in content; `has-active-comments` keeps its
  accent treatment.
- Updated-time column: muted (`secondary-text` tone); the "1 new push" /
  "n new comments" notice lines get accent color so they pop.

### 4. Meta-line sweep (JS)

- Target: `.repos-pr-list a[href*="/pullrequest/"]
  .secondary-text.body-s > span` — first four meaningful text nodes.
- Rewrite in place (nodeValue only):
  `[name][" request !"][id][" into "]` →
  `["!7039"][" · "]["Nicolai"][" · into "]`, where `Nicolai` is the first
  whitespace token of the display name. Branch icon + monospace branch span
  untouched.
- Idempotence: skip any line whose visible text already starts with `!`.
- Robustness: if the node shapes don't match the expected pattern (ADO
  update, localized string), leave the line alone — the sweep degrades to
  a no-op, never to a mangled line.
- Core logic is a pure function (text-node values in → new values or null),
  unit-tested; DOM walking is a thin wrapper.

### 5. Testing & shipping

- Vitest: pure rewrite function (happy path, non-matching shapes,
  idempotence) + a jsdom fixture of the row span for the wrapper.
- Two tags, each with its own Firefox checklist in the commit message:
  - **v0.49.0** — material + row CSS (sections 2–3).
  - **v0.50.0** — meta-line sweep (section 4).
- Prototype in Chrome first per `ado-live-verification-setup`; remove
  protos and restore state after measuring. Update the feature table +
  selector ledger in `docs/INTERNALS.md` with both changes.

## Out of scope (explicitly)

- REST enrichment per row (own vote state, "Re-review · k new" chips,
  conflict status) — a possible later layer on top of this restyle.
- Reordering/removing columns, folding the time column into the meta line.
- The New PR button, breadcrumb, or global nav (chrome-density territory).
