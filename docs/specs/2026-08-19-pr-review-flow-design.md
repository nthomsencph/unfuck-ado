# pr-review-flow — GitHub-style "Review" flow for ADO PRs

**Date:** 2026-08-19
**Status:** approved design, pending implementation

## Problem

ADO's per-file "Mark as reviewed" system is invisible: the checkbox only
appears on hover over a file-tree row, and the "n/m files reviewed" progress
text only appears after the first file is marked. There is no affordance that
says "start reviewing" and no guided path through the unreviewed files.
GitHub's flow (Review button → Files changed → per-file Viewed checkbox →
progress counter) is the model.

## Decisions (from brainstorming)

- Entry point: a **Review button in the PR header command bar**, visible on
  all tabs of a concrete PR.
- The Files-toolbar progress counter shows **only after Review is clicked**
  (per-PR flag, persisted).
- Extras: jump to first unreviewed on start; counter click advances to the
  next unreviewed file; done state at n = m.
- Reviewed state is **ADO's own built-in system** throughout — no parallel
  bookkeeping. Per-file checkboxes already exist (native tree checkbox +
  pr-reviewed's stacked-header mirrors) and keep working unchanged.
- Structure: a **new `pr-review-flow` feature**; the server viewed-state slot
  moves into the shared `pr/reviewed-data` module.

## Components

### 1. Header Review button

- Injected into the PR header command bar (near Approve); `repos-pr` routes
  with a concrete PR id only. Injection point verified live before wiring
  (selector goes into the README ledger).
- Label by state:
  - `Review` — per-PR flag unset
  - `Reviewing · n/m` — flag set, n < m
  - `Reviewed ✓` — m > 0 and n = m
- Click: set the flag, navigate to the Files tab by clicking ADO's native tab
  link (SPA — same mechanism class as tree-row clicks), then jump to the
  first unreviewed file. If already on Files, just jump.
- Clicking again while reviewing re-runs the jump. No un-start affordance.

### 2. Shared viewed-state slot (`pr/reviewed-data`)

- pr-reviewed's module state (viewedPaths set, fetch-in-flight/failed guards,
  optimistic patch on toggle) moves into `pr/reviewed-data.ts`; pr-reviewed
  and pr-review-flow both consume it. Existing display/toggle semantics are
  unchanged (this slot deliberately stays outside core/fetch-cache — it is a
  live-synced value, not a fetch-once cache).
- `n` = |viewedPaths| capped at m. `m` = parsed from the Files toolbar's
  native "n changed files" text (pure parser, tested).
- File **order** for "next" comes from the tree: rendered rows via
  `mapTreeFiles`, falling back to the tree sweep, which MOVES from
  pr-reviewed into `pr/reviewed-tree` so both features share one index
  cache.
- The per-PR "reviewing" flag lives in GM storage, keyed like the drafts
  store (org/project/repo/prId).

### 3. Files-toolbar counter

- Rendered in the Files diff toolbar only while the flag is set:
  `n/m files reviewed`, our design language (quiet text + ink accents).
- Click → next unreviewed file.
- Done state: `All files reviewed ✓` (quiet; no click target for "next").
- While the counter is active, ADO's native reviewed-progress text (appears
  only at n ≥ 1; selector verified live) is hidden to avoid duplication.

### 4. Next-unreviewed navigation

- "Next" = first file after the current file in tree order whose path is not
  in viewedPaths, wrapping to the top; "first" = same with no anchor.
- Single-file view: click the target's tree row (existing sweep-click
  machinery from Show).
- Stacked view: scroll the target's section into view, progressively
  scrolling until the virtualized section renders, then flash its header.
- Nothing unreviewed left → toast, no navigation.

### 5. Mark reviewed › next (single-file view)

- Alongside the counter in the single-file view: one action that marks the
  CURRENT file reviewed by clicking ADO's real checkbox — pr-reviewed
  exports one function, `toggleReviewedByPath(path)`, wrapping its existing
  click/sweep machinery — and then advances to the next unreviewed file. This closes the GitHub Viewed-checkbox loop without the
  hover hunt.

## Testing

- Pure, colocated: next-file selection (order, wrap, skip-reviewed, empty),
  button/counter label derivation, "n changed files" parsing.
- Live-verified in Chrome before wiring, ledgered in the README: header
  command bar injection point, Files tab link, native reviewed-text selector.
- Firefox checklist shipped per tag as usual.

## Out of scope

- Posting review summaries / comments batching (pr-drafts owns that).
- Auto-approve or any write beyond ADO's own reviewed toggles.
- Un-starting / resetting a review.
