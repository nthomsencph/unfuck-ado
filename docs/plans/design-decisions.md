# Design decisions — GitHub makeover stage 1 (autonomous run, 2026-11-02)

Decisions made on the user's behalf while executing
`docs/plans/2026-11-02-github-foundation.md`. Provisional entries are marked
**PROVISIONAL** and should be reviewed first.

## D1 — Wrote the implementation plan myself
- **Context:** the user said "execute this plan" with only the spec approved.
- **Decision:** wrote `docs/plans/2026-11-02-github-foundation.md` from the
  spec, following the previous plans' working style (version bump per
  build, tag per commit, `core.hooksPath=/dev/null`).
- **Why:** the spec was detailed enough to plan from without new product
  decisions.

## D2 — Read-only page probes instead of eval for live checks
- **Context:** the Firefox port's javascript tool evaluates code with
  `eval`, which ADO's and GitHub's Content-Security-Policy block.
- **Decision:** `scripts/firefox-claude/probe.js` adds a fixed set of
  read-only probes (computed styles, custom properties, outerHTML,
  CSS-rule search, counts) that the tool runs via `scripting.executeScript`
  when the code contains `__PROBE__{json}__END__`. Spliced in by `setup.sh`.
- **Rejected:** stripping the sites' CSP headers (would weaken the client's
  ADO security in the user's main profile while the add-on is loaded).

## D3 — Theme signal: ADO's body class — **PROVISIONAL**
- **Context:** spec left the theme signal to live verification. Live probe
  (dark theme) found `body.ms-vss-web-vsts-theme-dark`.
- **Decision:** dark if the body class matches `/theme-(hc-)?dark/`, high
  contrast if it matches `/theme-hc/`; luminance of ADO's own background
  (read with the bridge sheet briefly `disabled`) is the fallback when no
  theme class is present.
- **Why provisional:** the light and high-contrast class names are inferred
  from the dark one (`ms-vss-web-vsts-theme`, `-hc-dark`, `-hc-light`), not
  observed.

## D4 — ADO variable list from `azure-devops-ui` instead of a live dump — **PROVISIONAL**
- **Context:** live JS probes became unavailable mid-run (Firefox serves the
  add-on's cached scripts until a manual `about:debugging` reload;
  Violentmonkey isn't picking up local `dist/` rebuilds).
- **Decision:** the bridge maps the 84 variables that Microsoft's public
  `azure-devops-ui@2.281.0` (MIT) CSS consumes. Semantic variables
  (`--background-color`, `--text-primary-color`, …) take Primer tokens;
  `--palette-*` variables are `r, g, b` triples, so the build computes them
  per theme from Primer's resolved colors.
- **Why provisional:** ADO's own (non-azure-devops-ui) bundles may consume
  further variables; to be checked live.

## D5 — Bridge overrides with `!important` on `body`
- **Decision:** ADO's runtime theme may set variables inline on `body`;
  bridge declarations use `!important` on `html body` so they win over
  inline and lazily-loaded theme rules alike.

## D6 — Temporary aliases while features migrate
- **Decision:** Task 2 keeps `ACCENT` and `--adofix-*` as aliases onto
  Primer tokens so every intermediate commit builds and runs; Tasks 4–6
  remove every use; Task 7's guard test plus deleting the aliases closes it.

## D10 — Build-time Primer CSS via an esbuild plugin; bridge generated, not hand-written
- **Context:** the spec named an `ado-bridge.css`; the `--palette-*`
  variables need per-theme `r, g, b` triples that only exist after
  resolving Primer's hex values.
- **Decision:** `build.mjs` bundles `src/core/primer/build-css.ts` on the
  fly and serves `virtual:primer/tokens` and `virtual:primer/bridge` as text
  modules. The bridge lives in `src/core/primer/bridge.ts` as data (semantic
  map + palette formulas with a comment table) and is emitted at build time.
  Primer's `@media (prefers-color-scheme)` "auto" copies are dropped (we
  always write an explicit mode); `functional/size/viewport.css` is skipped
  (`@custom-media` only); `base/typography` is added because the functional
  typography tokens alias it.
- **Why:** one source of truth for pruning, the unknown-token check and the
  palette math, all unit-tested; nothing loads at runtime.

## D11 — Unknown-token check: Primer name heads, ADO variables exempt
- **Context:** ADO's variables share name heads with Primer's
  (`--text-primary-color`, `--focus-border-color`).
- **Decision:** a reference whose first segment is a Primer head
  (`fgColor`, `bgColor`, `text`, `focus`, …, list in `prune.ts`) must be
  defined by the shipped Primer files unless it is one of the bridge's ADO
  variables. Test files are excluded from the scan (they hold deliberate
  typos).
- **Why:** catches `--fgColor-mute`-style typos without false positives on
  ADO's own names. A feature that reads another Primer-headed ADO variable
  must add it to the bridge's lists.

## D12 — Palette formulas: tints toward canvas, shades toward text — **PROVISIONAL**
- **Context:** ADO's `--palette-primary-shade-*` darken toward black in its
  light theme; ADO uses shade-30 for link hover text.
- **Decision:** neutral-N = canvas→text by N%; tints = accent→canvas;
  shades = accent→text; darkened-6/10 (primary button hover/press under
  white text) = accent→black; black-alpha-N = text color at N% alpha (a
  light veil in dark). Percentages reproduce ADO's light defaults.
- **Why provisional:** chosen so both themes stay legible; needs the live
  side-by-side check (Task 8), especially black-alpha in dark (ADO's dialog
  scrim uses black-alpha-20).

## D13 — Only the bridge and type sheets self-heal on settle
- **Decision:** `syncPrimer()` (every settle) re-calls `injectStyleOnce` for
  the bridge and type sheets only. Tokens, components and the base sheet
  stay where boot put them, ahead of the feature sheets.
- **Why:** the bridge and type rules override ADO's declarations and must
  stay after ADO's lazy chunks; gh- components must lose equal-specificity
  ties to feature rules, so they must not be moved after them.

## D14 — Font override uses Primer's `--fontStack-*`, applied to every element
- **Decision:** `type.css` sets `var(--fontStack-sansSerif)` (GitHub's
  current stack: Mona Sans VF if installed, then the system stack from the
  spec) with `!important` on body and every descendant, except elements with
  `icon` in a class (any case: `.fabric-icon`, `.ms-Icon--*`, `.bowtie-icon`),
  code/pre/kbd/samp, `.monospaced-*` and Monaco. Code and `.monospaced-*`
  get `--fontStack-monospace`; Monaco is untouched.
- **Why:** ADO's legacy bundles set fonts on their own elements, so
  inheritance from body is not enough. The `[class*="icon" i]` exclusion is
  broad on purpose — a few non-icon wrappers keep ADO's font rather than
  risking glyphs turning into letters. Live check pending (spec).
