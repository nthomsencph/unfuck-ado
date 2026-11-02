# Design decisions — borderless pass + theme flash fix (2026-11-02)

The user prefers color steps to borders ("I'm not a big fan of borders, I
would much rather rely on color difference"), applied everywhere in one go.
Same session: the theme flash on page load and the board-card comment chip
overlapping titles. **PROVISIONAL** entries first in review.

## B3 — Overlays keep Primer's floating shadow, ring included — **PROVISIONAL**
- **Context:** in dark, `--shadow-floating-small` starts with
  `0 0 0 1px #3d444d` — a 1px ring that reads like a border around menus,
  the drafts panel and toasts. Dark `--overlay-bgColor` (#010409) is DARKER
  than the canvas (#0d1117), so without the ring an overlay only lifts on a
  dark-on-dark shadow.
- **Decision:** keep the token as specified (the brief asked for it); the
  overlay's own border is transparent. If the ring still reads as a border
  to the user, the next step is a ring-free composite of the shadow's other
  two layers, which needs new shadow-color tokens in core/primer.
- **Check in the light pass:** the light ring is `#d1d9e040` (very faint).

## B6 — Form fields: translucent `--bgColor-neutral-muted` fill — **PROVISIONAL**
- **Context:** the brief suggested `--bgColor-inset` or
  `--control-bgColor-rest`. Live, inset (#010409) on the dark canvas
  (#0d1117) made the work item composer nearly invisible; in light, inset
  and control-rest both equal `--bgColor-muted` (#f6f8fa), so a field in a
  muted card or on the inset header would vanish.
- **Decision:** `--bgColor-neutral-muted` is translucent, so it is one step
  up from WHATEVER it sits on — canvas, muted card, inset header — in both
  themes. Used for ADO `.bolt-textfield`/`.bolt-tag-picker`, the drafts
  textarea, the frame search box and the work item composer. Focused,
  error and warning fields keep ADO's colored border + ring.
- **Trade-off:** same tint as labels and hover plates; fields stay
  distinguishable by shape and placeholder.

## B4 — Board cards stay `--bgColor-default` inside muted columns — **PROVISIONAL**
- **Context:** canvas < surface < hover ordering would put cards ABOVE the
  column (lighter in dark). GitHub Projects puts default-colored cards in
  muted columns.
- **Decision:** keep GitHub's arrangement — the card is a default-colored
  slab sunk into the muted column; with the borders gone, the canvas↔muted
  step is the card's whole edge. Sprint taskboard cells (muted boxes in 4px
  transparent gutters, D61) drop their inset-shadow outline the same way.
- **Check in the light pass:** white cards in #f6f8fa columns are a small
  step — may need `--bgColor-neutral-muted` columns in light.

## B10 — Work item form fields read as text until hovered — **PROVISIONAL**
- **Context:** the work item form's fields (title, state, assignee, rail
  values) are `.bolt-textfield`s that ADO draws chrome-less at rest and
  outlines on hover. The global field fill turned the title and state into
  filled boxes.
- **Decision:** `ado.css` skips fields inside `[class*="work-item-"]` (and
  `.not-active`, `.subtle`, inline / hide-border fields); their hover
  outline becomes the field fill instead. The composer's own field rule
  lives in workitem-layout. Hover could not be exercised live (pointer
  events didn't land in the Claude window); verified at rest only.

## B13 — Card-style rules: readable text + a 14% tint of the rule color — **PROVISIONAL**
- **Context:** (user report) Priority 1 task/bug cards rendered black
  text on our dark card. A board card-style rule sets the card's
  `background-color` inline and marks `.card-content` `.light` (or
  `.dark`); ADO's `.wit-card .light { color: black }` and the title's
  own rule then assume the rule color is behind the text — our surface
  replaces it. Live 2026-11-02, sprint taskboard: rule rgb(240,102,115).
- **Decision:** text on `.card-content.light/.dark` follows our surface
  (title, id, values `--fgColor-default`; `.label-*-secondary` field
  labels `--fgColor-muted`), for every `.wit-card` (Kanban + taskboard).
  The rule stays visible borderlessly: board-density copies the inline
  color into `--adofix-card-rule` each settle and density.css paints
  `color-mix(in srgb, rule 14%, --bgColor-default)` — a tint, no stripe
  (the left edge already carries the work-item-type flag).
- **Check in the light pass:** 14% of a saturated rule color on white;
  a `.dark` rule (dark color) on a light card.

## B1 — Surfaces: muted on the canvas, no border
- **Decision:** cards that were "canvas fill + 1px border" (gh-Box, PR
  overview cards, work item comments, drafts cards) become `--bgColor-muted`
  surfaces with 6px corners and no shadow; their headers go one tint up
  (`--bgColor-neutral-muted`), nested wells go down to the canvas.
- Borders keep their WIDTH in `transparent` everywhere, so no layout moves
  by a pixel ("behavior unchanged").

## B2 — One list recipe: tiles with 2px canvas gaps
- **Decision:** where a list sits in a container (PR list, gh-Box rows,
  drafts panel), each row is a muted tile and the canvas (or overlay) shows
  2px between rows; hover layers `--control-transparent-bgColor-hover` over
  the tile with a `linear-gradient` so the tint adds rather than replaces.
  The PR list draws its gap with the cells' existing 1px top/bottom borders
  in the canvas color — the 60px row geometry stays.
- ADO's full-page grids (repo files, backlogs, queries) have no row fill,
  so there the same recipe degenerates to "spacing + hover tint": their
  row hairlines (`--component-grid-cell-bottom-border-color`) go
  transparent (B9). Sidebar section rules (work item rail, D66) and the
  issue-header rule (D65) become transparent; the space stays.

## B5 — Header and rail lose their hairlines
- **Decision:** header bottom hairline, rail right hairline and rail group
  separators go; `--bgColor-inset` already differs from the canvas. The
  header's icon buttons become filled (`--button-default-bgColor-rest`)
  32px squares instead of bordered ones.

## B7 — Pills filled, not outlined
- **Decision:** `gh-Label` variants fill with their `-muted` background
  (neutral / accent / success / attention / danger / done). ADO's outlined
  state pills carry ADO-set colors (inline, not a token we can name), so
  their outline becomes `color-mix(in srgb, currentColor 15%, transparent)`
  — no raw color, follows whatever color ADO sets. Repo tag pills take
  `--bgColor-neutral-muted`.

## B8 — What keeps an edge
- **Decision:** focus rings (all of them, ADO's and ours); checkbox / radio
  / toggle outlines and the "mark as reviewed" checkbox square (the outline
  IS the control); selected-tab underlines; the PR list's new-activity edge
  and ADO's selected-row edge (state markers, not separators); the
  timeline spine (a connector); status dots; ADO's error/warning field
  borders; Markdown-authored `<hr>`/tables inside comments.

## B9 — Bridge remaps only border-only variables
- **Context:** `--palette-neutral-*` and `--palette-black-alpha-*` paint
  borders AND text, fills and controls (azure-devops-ui 2.281.0 core.css),
  so remapping them would hit non-border uses.
- **Decision:** the bridge maps `--border-subtle-color` and
  `--component-grid-cell-bottom-border-color` to `transparent` — every use
  in azure-devops-ui and in a live rules dump is a border or a 1px shadow
  line. `--splitter-border-color` stays (it also paints the drag
  placeholder; the resting splitter line is already cleared in chrome.css).
  Everything else is targeted selectors in `core/primer/ado.css`, scoped to
  `html[data-adofix-bridge]` so high contrast is untouched, and re-healed
  with the bridge after ADO's lazy chunks.

## B11 — Theme at boot comes from GM storage
- **Context:** at document-idle ADO's theme class was missing on 5 of 5
  live page loads, so boot used the luminance guess of ADO's not-yet-themed
  (light) canvas and dark users saw a light flash until the debounced
  settle.
- **Decision:** persist every class-derived theme via `core/storage`
  (`adofix.primer.theme`); at boot with no class, use it; luminance only
  when neither exists. Violentmonkey's `GM_getValue` is synchronous, so no
  async fallback was needed. Guesses are never persisted. A body
  `class` MutationObserver re-syncs immediately (undebounced) when ADO
  writes its class.

## B12 — Card comment chip flows in the id line
- **Decision:** the chip is the id line's last flex item (`margin-left:
  auto`) instead of absolutely positioned; long Kanban titles wrap beside
  it. ADO's ⋮ menu is absolutely positioned (live), so the corner is free.

## B3 (revised by coordinator) — Floating surfaces drop Primer's 1px ring
- **Context:** `--shadow-floating-small` starts with `0 0 0 1px …` — in dark a
  visible grey ring, i.e. a border.
- **Decision:** `--adofix-shadow-floating` (core/primer/components.css) keeps
  Primer's two drop shadows without the ring; in dark, menus/overlays sit on
  `--bgColor-muted` (one step above the canvas) instead of Primer's darker
  `--overlay-bgColor`, so they separate by color. Light keeps Primer's overlay.
