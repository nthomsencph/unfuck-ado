# GitHub makeover stage 1 — Primer foundation: implementation plan

> Spec: `docs/specs/2026-11-02-github-foundation-design.md`.
> Decisions made during autonomous execution: `docs/plans/design-decisions.md`.

**Goal:** every ADO page GitHub-colored and GitHub-typed (families) through a
Primer token layer + ADO variable bridge; every adofix feature rebuilt on
GitHub components; released.

**Working style (repo law, from earlier plans):** every build bumps the
version (`npm pkg set version=0.x.y`); `pnpm typecheck && pnpm test && pnpm
build` before every commit; one commit per version, tagged `vX.Y.Z`; commit
messages end `Claude goes brr.. via Dash`; commits run with
`-c core.hooksPath=/dev/null`; commit straight to `main`; pixel changes carry
a Firefox checklist in the commit message. Stage 1 versions: 0.53.x; the
release is the final tag.

**Live verification:** Firefox tools via `$CLAUDE_JOB_DIR/tmp/ff.mjs`
(MCP client for `.firefox-claude/firefox-mcp.mjs`); page reads go through the
`__PROBE__{…}__END__` probes (`scripts/firefox-claude/probe.js`) because ADO
and GitHub block eval. Read-only on ADO: no submits, votes or state changes.
Violentmonkey tracks `dist/`, so a rebuild + tab reload is the deploy.

### Task 1 — Live discovery (no code)
On the five reference pages (PR list, PR overview, PR files, a work item, the
Kanban board), dark theme:
- enumerate ADO theme variables (`vars` probe on `:root`, `body`, and the
  element that actually carries them), with their values;
- find ADO's theme marker (class/attribute) and a high-contrast signal;
- list icon-font classes (elements whose font-family is an icon font);
- note hard-coded colors that will survive a variable takeover (screens).
Output: `docs/plans/2026-11-02-ado-variables.md` (variable → value → Primer
mapping draft), committed with the plan.

### Task 2 — Foundation module (`src/core/primer/`)
- devDeps pinned exact: `@primer/primitives@11.10.0`, `@primer/octicons@19.42.0`.
- `tokens`: build-time import of dark/light theme CSS + size + typography;
  comment stripping; pruning to `var(--…)` referenced in `src/**` with
  transitive dependencies; unknown referenced Primer-looking token fails the
  build. Prune logic lives in a testable module used by `build.mjs`.
- `theme.ts`: detection (ADO marker → luminance fallback), high-contrast
  check, writes `data-color-mode`/`data-dark-theme`/`data-light-theme` on
  `<html>` only on change; called at boot and every settle.
- `type.css` (families only, icon fonts excluded), `components.css`
  (`gh-btn`, `gh-btn-primary`, `gh-btn-danger`, `gh-btn-sm`, `gh-Label`
  + variants, `gh-Counter`, `gh-Box`/`-header`/`-row`, `gh-menu`,
  `gh-tooltipped`), `icons.ts` + generated `icons.gen.ts` (`pnpm icons`,
  list in `scripts/icons.txt`).
- `core/dom.ts`: `ACCENT`, `--adofix-*` tokens and old `.adofix-surface`
  replaced; `.adofix-surface` = Primer overlay recipe.
- Tests: theme detection, octicon, prune.

### Task 3 — ADO bridge
`ado-bridge.css` from Task 1's mapping; skipped in high contrast; selector
fallbacks for hard-coded colors on the reference pages; remove canvas
overrides from `chrome.css`/`density.css`. Live check in dark.

### Tasks 4–6 — Feature migration (by area, files disjoint)
- 4 — PR review surfaces: `pr-drafts`, `pr-comments`, `pr-thread-filter`,
  `pr-reviewed`, `pr-keynav`, `pr/toolbar`, `pr-review-flow`.
- 5 — PR pages: `pr-list`, `pr-overview`, `pr-checks`, `pr-actions`,
  `pr-diff-totals`, `core/popover`, toast.
- 6 — Boards & WI: `card-comments`, `workitem-state`, `workitem-layout`,
  `taskboard-columns`, `sprint-header`, `backlog-*`, `board-density`,
  `chrome-density`, `src/styles/*`.
Each: tokens instead of colors, `gh-` components instead of hand-rolled
controls, Octicons instead of emoji/glyphs, retired looks per spec; behavior
and DOM hooks unchanged; existing tests green.

### Task 7 — Guard test
No raw colors in `src/features/**`, `src/styles/**`.

### Task 8 — Live verification
Side-by-side screenshots (ADO page vs GitHub counterpart), dark then light
(ADO theme switched in the user's profile settings and switched back);
full read-only click-through of every feature + hotkeys. Fix and re-check.

### Task 9 — Docs and release
`docs/INTERNALS.md` "Primer foundation" section + ledger entries; README and
`@description` say "makes ADO look like GitHub"; final version tag; push
`main` + tags; `gh release create vX.Y.Z dist/ado-unfuck.user.js`.
