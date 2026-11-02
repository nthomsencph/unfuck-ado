# GitHub makeover — stage 1: the Primer foundation

**Date:** 2026-11-02
**Status:** approved design, pending implementation plan

## Why

The user wants two things: to get fully away from Azure DevOps' UX, and to see
how far a userscript can push ADO toward GitHub. Today the script patches ADO
piece by piece. Several surfaces lean GitHub-ward (PR list, review flow, work
item layout), but on a home-grown look: a `#141414` canvas, layered greys,
a purple accent (`#8250df`) and 10px corners. The goal is that ADO reads as
GitHub, throughout.

## The makeover as a whole (decided with the user)

- **Depth:** mix. Reskin ADO's own pages to GitHub; rebuild the worst pages
  as our own views from ADO's REST API where reskinning can't get there.
- **Areas:** all four — global frame, pull requests, repos/code browsing,
  boards & work items.
- **Fidelity:** as close to GitHub as possible. GitHub's design system
  (Primer): its colors, type, spacing, icons and component patterns. The
  unfuck-ado identity (purple accent, `#141414` canvas) is retired.
- **Theme:** GitHub Dark Default when ADO is dark, GitHub Light when ADO is
  light.
- **Existing features:** keep their behavior, restyle to GitHub. Draft
  comments, review flow, reviewed checkboxes, thread filter, hotkeys, board
  tweaks — all keep working.
- **Rollout:** each stage ships as a normal release once it works. The GitHub
  look simply becomes unfuck-ado's look; no toggle, no second theme.
- **Done when (every stage):** the stage's reference pages, screenshotted next
  to the matching GitHub page, read as the same product at a glance.
- **Order:** each stage gets its own design → plan → build cycle.
  1. **Foundation** — this spec.
  2. **Global frame** — GitHub's header and navigation around every page
     (top bar, repo/project nav as GitHub's underline tabs, search).
  3. **Pull requests** — list, conversation, files/diff (incl. theming the
     Monaco diff editor), review flow.
  4. **Repos & code browsing** — repo home, file browser, commits, branches.
  5. **Boards & work items** — work items as GitHub issues, boards as
     GitHub Projects, backlogs, sprints.

  Stages 2–5 are outlines only; each is designed when it starts.

## Stage 1 goal

One shared GitHub design layer that (a) turns every ADO page GitHub-colored
and GitHub-typed at once, and (b) gives every later stage and every existing
feature GitHub's tokens, icons and component classes to build with. Layout
does not change in this stage.

### Non-goals

- Changing any page's layout or structure (stages 2–5).
- Replacing ADO's own icons (each later stage swaps the icons on its pages).
- Theming surfaces that ignore ADO's theme variables: the Monaco diff editor
  (→ stage 3), charts/analytics widgets, and inline-styled widgets. They are
  listed in "Known unthemed surfaces" and left alone.
- Dark Dimmed, high-contrast or colorblind GitHub themes.
- Any change to feature behavior.

## Design

### Approach (my call, agreed)

Take over ADO's own theme variables. ADO's bolt/Fluent components read their
colors from CSS custom properties (`--background-color`,
`--text-primary-color`, `--border-subtle-color`, `--palette-*`, …). Setting
those to GitHub values recolors every page at once, including corners no
feature will ever touch. Per-selector rules are only the fallback where ADO
hard-codes colors. The rejected alternative — restyling page by page with
selectors, as today — doesn't scale to four areas.

### Module: `src/core/primer/` (always on, owned by core)

Like today's base sheet, this is injected at boot by `main.ts`, before any
feature sheet; it is not a toggleable feature.

| File | Owns |
|---|---|
| `tokens.ts` | GitHub's dark and light color tokens, plus Primer's size and typography tokens, as CSS text. Imported at build time from `@primer/primitives` (devDependency, pinned exact) — `dist/css/functional/themes/{dark,light}.css` and the `functional/size` + `functional/typography` files. The build strips comments and **prunes the theme files to the tokens actually referenced** (any `var(--name)` in `src/**`), keeping the tokens those depend on transitively — Primer tokens reference each other — because the full dark + light set is ~190 KB even stripped — most of the size of the whole script today (~240 KB). Size and type files are small and kept whole. Nothing loads at runtime. (My call.) |
| `theme.ts` | Theme detection: decides dark vs light and sets the attributes Primer's selectors need on `<html>`: `data-color-mode="dark|light"`, `data-dark-theme="dark"`, `data-light-theme="light"`. |
| `ado-bridge.css` | Maps ADO's theme variables onto Primer tokens, plus selector fallbacks for hard-coded ADO colors on the reference pages. |
| `type.css` | GitHub typography, **font families only in stage 1** (my call): the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`) forced over ADO's font declarations, and `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` for code. The override must exclude ADO's icon-font elements (verify their classes live) so glyphs don't turn into letters. Font sizes, line heights and heading sizes are **not** changed here — they move rows and headers, which breaks "layout does not change" and the measured-size tricks (stub-hide, teleport). Each later stage sets GitHub's sizes on its own pages. Primer's typography tokens are bundled for those stages and for adofix's own UI. |
| `components.css` | Shared GitHub component classes (see below). |
| `icons.ts` + `icons.gen.ts` | `octicon(name, size?)` → an `<svg>` element. `icons.gen.ts` is generated by `pnpm icons` from `@primer/octicons` (devDependency, pinned exact) and contains only the icons listed in `scripts/icons.txt`; the full package is not tree-shakable, so it is never imported directly. The generated file is committed. |

Token names are Primer's own (`--bgColor-default`, `--fgColor-muted`,
`--borderColor-default`, `--button-primary-bgColor-rest`, …), unprefixed, so
CSS copied from GitHub works as-is. ADO does not use these names. (My call.)

### Theme detection (my call)

- Read ADO's resolved page background (computed `background-color` of
  `body`, falling back to the `--background-color` variable) and compute its
  relative luminance; below 0.5 → dark, otherwise light.
- Run at boot and on every observer settle; only write the attributes when
  the result changes. Switching ADO's theme therefore switches ours without a
  reload.
- Detection must read ADO's *own* background, not ours: the bridge
  overrides `--background-color`. The detector reads ADO's value before the
  bridge applies (store it at boot from a probe element outside the bridge's
  scope, or read ADO's theme marker if live verification finds a reliable
  one — e.g. a theme class/attribute on `body`). Which signal to use is
  decided during planning, after live verification; the luminance rule is
  the fallback.
- **ADO high-contrast themes (my call):** respect them. If ADO is in a
  high-contrast theme (signal verified live), the ADO bridge and the font
  override are not applied, so ADO's accessibility theme stays intact. The
  `data-color-mode` attributes are still set (dark/light by luminance), so
  adofix's own UI keeps resolving its Primer tokens — features have no color
  fallbacks of their own once the guard test is in place.

### ADO → Primer bridge

- Set ADO's theme variables to Primer tokens on the element(s) where ADO
  defines them (verify live: `:root`, `body`, or a theme container). Mapping
  groups: page canvas → `--bgColor-default`; raised surfaces/cards/callouts
  → `--bgColor-default` with `--borderColor-default` borders (GitHub's
  "Box"); inset/secondary surfaces → `--bgColor-muted`; primary text →
  `--fgColor-default`; secondary text → `--fgColor-muted`; borders/dividers
  → `--borderColor-default` / `--borderColor-muted`; links and ADO's
  "communication"/primary accent → `--fgColor-accent` /
  `--bgColor-accent-emphasis`; success/warning/error/info states → Primer's
  `success`/`attention`/`danger`/`accent` tokens; focus ring → `--focus-outlineColor`.
- **The exact ADO variable list is unknown and is the first planning task:**
  enumerate the variables ADO defines in both themes (live, via the Firefox
  tools), and map each to a Primer token or leave it explicitly unmapped.
- ADO lazy-loads CSS after ours. The bridge goes through `injectStyleOnce`,
  whose self-healing re-append keeps adofix sheets last; variables are set
  with the same or higher specificity than ADO's definitions.
- Selector fallbacks: only for hard-coded colors on the five reference pages
  that remain visibly ADO after the variable takeover. Each fallback gets a
  "verified <date>" comment, matching the existing convention.

### Shared components (`components.css`)

GitHub patterns as classes, named after Primer: `.btn`, `.btn-primary`
(green), `.btn-danger`, `.btn-sm`, `.Label` (+ state variants),
`.Counter`, `.Box` / `.Box-header` / `.Box-row`, `.SelectMenu`-style menu,
`.tooltipped`. Prefixed `gh-` (`.gh-btn`, `.gh-Box`, …) to avoid collisions
with ADO or third-party classes on the page. (My call.) Every existing feature is moved onto these in stage 1 (see below).

### Retiring the current look

- Removed: `ACCENT` (`#8250df`), `--adofix-bg`, `--adofix-lane`,
  `--adofix-card`, `--adofix-radius`, `--adofix-ink`, and today's
  `.adofix-surface` recipe.
- `.adofix-surface` keeps its name (many features use it) but becomes
  GitHub's overlay: `--overlay-bgColor`, `--borderColor-default` border, 6px
  radius (`--borderRadius-medium`), `--shadow-floating-small`.
- Accent usages (focus rings, flashes, active states) → `--fgColor-accent` /
  `--focus-outlineColor`. Primary actions (Review submit, drafts submit) →
  GitHub's green primary button.
- `chrome.css`/`density.css` canvas overrides (`#141414` etc.) are removed;
  the bridge owns the canvas. Their spacing/density rules stay.

### Existing features (user decision: everything GitHub in stage 1)

Every adofix-injected surface goes fully GitHub in this stage — not just its
colors:

- All seven files that use `ACCENT` and every hard-coded color in
  `src/features/**` and `src/styles/**` (~90 today) switch to Primer tokens.
- Every hand-rolled button, pill, counter, panel, menu and toast is rebuilt on
  the shared `gh-` component classes (and Octicons instead of emoji/glyphs,
  e.g. the 💬 board-card count). In scope: `pr-drafts`, `pr-review-flow`,
  `pr-comments`, `pr-checks`, `pr-actions`, `pr-thread-filter`,
  `pr-diff-totals`, `pr-reviewed`, `pr-list`, `pr-overview`, `card-comments`,
  `workitem-state`, `taskboard-columns`, `sprint-header`, `backlog-*`,
  `core/popover`, the toast.
- Retired looks, although they were earlier user requests (the user chose
  GitHub fidelity over them on 2026-11-02): the heavy-shadow cards on PR
  overview/list (→ flat bordered `gh-Box`), the canvas < lane < card layering
  on boards (→ GitHub Projects' flat `--bgColor-default` canvas with
  `--bgColor-muted` columns), and the purple accent wash on authored/reviewing
  PR-list rows (removed; GitHub's list has no equivalent — the "mine" signal
  returns, if wanted, as a GitHub-style filter or Label in stage 3).
- **Behavior is unchanged**: same actions, hotkeys, data and DOM hooks that
  other features or tests rely on. Only markup classes and styling change.
- "Layout does not change" (Goal) applies to ADO's own pages. adofix's own
  injected UI may change size and shape as it becomes GitHub components.

## Known unthemed surfaces (left for later stages)

- Monaco diff/code editor (own theme API) → stage 3 (and stage 4 for file view).
- Charts, analytics and dashboard widgets.
- Anything with inline `style` colors or canvas rendering.
- ADO's icon font glyphs (colors follow text, shapes stay ADO's) → each stage.

## Testing and verification

- **Unit (vitest):** theme detection (luminance threshold, attribute writes
  only on change); `octicon()` (known icon renders an `<svg>` with the right
  size and `aria-hidden`; unknown name throws in tests).
- **Guard test:** fails if any file in `src/features/**` or `src/styles/**`
  contains a raw color (`#rgb`/`#rrggbb`/`rgb(`/`rgba(`/`hsl(`) — keeps
  colors in the foundation. `src/core/primer/**` is exempt.
- **Build check:** `pnpm build` output size is recorded before/after. The
  pruning step has a unit test: a referenced token is kept in both themes,
  an unreferenced one is dropped, and a referenced name missing from Primer
  fails the build (catches typos like `--fgColor-mute`).
- **Live (Firefox tools, both ADO themes):** screenshot the five reference
  pages next to their GitHub counterparts:

  | ADO page | GitHub counterpart |
  |---|---|
  | PR list (`/_git/<repo>/pullrequests`) | a repo's Pull requests list |
  | PR overview | a PR's Conversation tab |
  | PR files | a PR's Files changed tab |
  | Work item form | an issue |
  | Kanban board | a Projects board |

  Pass = colors, type and surfaces read as GitHub at a glance (layout is
  allowed to differ in this stage). Every existing feature (README list + hotkeys) is clicked
  through on its page, in both themes, to confirm behavior is unchanged —
  this stage rewrites their markup, so this is a full pass, not a spot check.
- `docs/INTERNALS.md` gets a "Primer foundation" section (module, bridge
  mapping table, unthemed surfaces) and its verification ledger records the
  bridge's live checks.

## Shipping

One normal release once the live check passes in both themes; the README's
description and the `@description` banner line are updated to say the script
makes ADO look like GitHub.
