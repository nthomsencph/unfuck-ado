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

## D40 — PR-list "mine" tags kept, wash removed — **PROVISIONAL**
- **Context:** the spec retires the purple wash on authored/reviewing rows;
  the brief forbids changing REST calls or DOM hooks.
- **Decision:** only the CSS goes. `tagOwnership` (renamed from
  `tintOwnership`) still fetches once per repo and sets
  `data-adofix-mine` on rows; nothing styles it now.
- **Why provisional:** it keeps two fetches per list load that have no
  visible effect until stage 3 brings back a "mine" signal. Coordinator
  call: keep as the stage-3 hook, or drop the fetch and the tags now.

## D41 — ADO-rendered surfaces get the gh- look by CSS, not by gh- classes
- **Context:** the PR-list card, its rows and pills, and the PR-overview
  cards are React-owned bolt elements.
- **Decision:** they get the gh-Box / Box-row / gh-Label look from feature
  CSS on their existing selectors (tokens only). gh- classes go only on
  elements adofix creates.
- **Why:** React overwrites `className` on re-render, so added classes would
  flicker in and out between settles.

## D42 — PR-list state pills keep ADO's semantic colors, take gh-Label shape — **PROVISIONAL**
- **Decision:** every `.bolt-pill` in the list gets gh-Label geometry (20px,
  full radius, 12px medium text). Only `.standard` (tag) pills also get
  gh-Label's default outline colors; the outlined state pills keep ADO's
  colors, which the bridge already maps.
- **Why provisional:** the selector covers all pill types; the inner
  `.bolt-pill-content` padding was not checked live and may need tuning.

## D43 — PR-overview nested boxes become muted wells; file-anchored header is a Box-header — **PROVISIONAL**
- **Decision:** `.status-details-container` (checks, merge commit) gets
  `--bgColor-muted` fill and a `--borderColor-muted` hairline.
  `.comment-file-header` (the file path on file-anchored threads) becomes
  GitHub's review-thread Box-header: muted fill, default bottom border,
  6px top corners. The separator removals (thread replies, table rows) stay.
- **Why provisional:** the header's top-corner radius assumes it is the
  card's first child. Plain comment cards get no Box-header: their header
  row has no verified selector yet, so that needs a live DOM check first.

## D44 — Inline check icons: octicons by status, no longer ADO's bolt-status drawings
- **Decision:** approved → `check-circle` (success fg), rejected →
  `x-circle` (danger), queued/running → `dot-fill` (attention),
  broken/unknown → `dot-fill` (muted). The color comes from a
  `data-tone` attribute on `.adofix-check-row`.
- **Why:** this is GitHub's checks list. Trade-off: our rows no longer
  match ADO's native build-policy rows above them pixel for pixel until
  those are themed too.

## D45 — Diff totals as GitHub's diffstat: adds first, U+2212 minus
- **Decision:** green `+adds` shows before red `−dels` (flex `order`; the
  DOM keeps removed-then-added because `render()` indexes the children).
  Semibold. The title text now reads "added / removed".
- **Why:** GitHub's Files-changed header order and glyph.

## D46 — Popover → gh-menu; check octicon without aria-checked
- **Decision:** the menu is `adofix-menu gh-menu` (it no longer carries
  `.adofix-surface`; gh-menu's floating shadow already draws the ring).
  Items are `adofix-menu-item gh-menu-item`, the ✓ is `octicon("check")` in
  a 16px slot that is always reserved, the count is `gh-Counter`, the
  divider is `gh-menu-divider`, and the status line is styled as an
  ActionList group header.
- **Why:** `aria-checked` is left off. Without a menuitemcheckbox role it is
  invalid ARIA, and on gh-menu-item it would also add the selected fill
  and bold text, which is too heavy for toggle lists.

## D47 — Toast as Primer's Toast; toolbar buttons as invisible IconButtons
- **Decision:** the toast is `.adofix-surface` with a 48px
  `--bgColor-accent-emphasis` icon block (`info` octicon) and 16px-padded
  content. This replaces the 3px accent spine. `makeToolbarButton` emits
  `gh-btn gh-btn-invisible adofix-icon-btn` (a 32px square with a muted
  icon) instead of bolt's classes.
- **Why:** this is GitHub's look. Live check needed: cloned ADO font icons
  in `makeCommandProxy` buttons lose bolt's icon sizing rules.

## D20 — Drafts wear GitHub's "Pending" look: attention, not accent
- **Context:** drafts were marked by a purple "unsent ink" spine and accent
  text; the accent is retired.
- **Decision:** a draft is GitHub's pending review comment: flat `gh-Box`
  card, `gh-Label--attention` "Draft" chip, no spine or shadow. Drafted
  lines in the tree icon and Monaco gutter use `--fgColor-attention`, so
  every draft marker shares one color.
- **Why:** GitHub marks pending review comments with the yellow "Pending"
  Label; accent blue would read as a link or selection.

## D21 — "Comment as draft" is a green primary button — **PROVISIONAL**
- **Context:** it sits in ADO's composer footer next to ADO's blue
  "Comment" button.
- **Decision:** `gh-btn gh-btn-primary`, like GitHub's "Start a review"
  next to "Add single comment".
- **Why:** GitHub fidelity. Two filled buttons side by side (ADO blue, our
  green) needs the live check; fall back to a default `gh-btn` if it is loud.

## D22 — Drafts panel as GitHub's review overlay
- **Decision:** count is a `gh-Counter`, close is an invisible `x` octicon
  button, rows are muted-bordered list rows with a `--bgColor-muted` hover
  (accent spine on hover removed), and the submit is a right-aligned
  `gh-btn-primary` (no longer full width). Button texts and the two-click
  confirm are unchanged.
- **Why:** matches the "Finish your review" overlay's footer.

## D23 — Review header button: green primary, default once done or voted
- **Decision:** `.adofix-review-btn` is `gh-btn` + `gh-btn-primary`
  toggled with the old quiet state (`adofix-done` stays as a hook). The
  height stays at 32px to line up with ADO's Approve split button. No caret:
  the button opens no menu, so GitHub's "Review changes ▾" caret would lie.
- **Why:** GitHub's "Review changes" button is green primary.

## D24 — Status glyphs in labels become octicons at render time
- **Context:** `reviewButtonLabel`, `counterLabel` (tested) and
  `voteLabel` (pr/reviewer-api.ts, not in this group) return strings with
  ✓ / ✕.
- **Decision:** the strings keep their glyphs; `setIconLabel` in
  pr-review-flow swaps a leading/trailing ✓ or ✕ for the check / x
  octicon (green / red on the default-button state). The ✓ and 🎉 in two
  review-flow toasts were dropped.
- **Why:** no test or other feature changes; the screen shows octicons.

## D25 — Header "Reviewed" toggle as GitHub's "Viewed" button
- **Decision:** `.adofix-reviewed` is a `gh-btn gh-btn-sm` holding a
  16px checkbox (`--control-checked-*` tokens, check octicon); checked turns
  the button `--bgColor-accent-muted`. The label stays "Reviewed" (ADO's
  word for the same state); the hover reveal is unchanged.
- **Why:** GitHub's file-header "Viewed" control; ADO's checkbox blue is no
  longer needed now that the accent is GitHub blue.

## D26 — Files-toolbar buttons are gh-btn-sm
- **Decision:** `TOOLBAR_BUTTON_CLASSES` (pr/toolbar.ts) is now
  `gh-btn gh-btn-sm` instead of bolt's classes; the comments widget is a
  default small button (comment octicon, "n/m", drafts in a `gh-Counter`),
  no longer accent-filled. Review progress and mark-and-next are small
  invisible buttons.
- **Why:** GitHub's Files-changed toolbar uses small default/invisible
  buttons. ADO's toolbar controls are 32px, so ours are 4px shorter; live
  check pending.

## D27 — Hidden-thread marker is a secondary gh-Label
- **Decision:** the 💬 chip becomes `gh-Label gh-Label--secondary` with the
  comment-discussion octicon; the overview timeline variant keeps its
  full-width row geometry, now in muted text.
- **Why:** a neutral Label is how GitHub shows a collapsed/hidden item.

## D7 — vitest stubs the build-time `virtual:primer/*` modules
- **Context:** features import `octicon` from `core/primer`, whose index
  imports the esbuild-only virtual CSS modules; vitest couldn't resolve them.
- **Decision:** a tiny plugin in `vitest.config.ts` resolves them to `""`.
- **Why:** one central fix instead of every feature importing the deep
  `core/primer/icons` path.

## D8 — PR-list ownership tagging kept although nothing shows it
- **Context:** D40 removed the purple wash; the two cached REST fetches that
  tag rows `data-adofix-mine` still run.
- **Decision:** keep them (cached per page; tested) as the hook for stage 3's
  GitHub-style "mine" signal, rather than deleting `pr/list-api.ts` and
  re-adding it next stage.

## D9 — No GitHub "submit review" popover in stage 1 (deferred)
- **Context:** my brief to the PR-review migration asked for GitHub's
  "Review changes" popover; `pr-review-flow` has no such dialog — it would be
  a new feature (votes + overall comment via new REST writes).
- **Decision:** stage 1 only restyles (green primary Review button). The
  popover is a stage-3 candidate; the drafts panel, now styled like GitHub's
  "Finish your review" overlay, is the natural host.

## D60 — State picker dots use GitHub Projects' default status colours
- **Context:** the `s` state picker (now a gh-menu) shows a dot per state.
  ADO gives each state a `stateCategory`; GitHub has no states, only
  Projects' Status field.
- **Decision:** `dot-fill` octicon coloured by category: Proposed →
  `--fgColor-success`, InProgress → `--fgColor-attention`, Resolved →
  `--fgColor-accent`, Completed → `--fgColor-done`, Removed/unknown →
  `--fgColor-muted`. The current state gets a leading `check` octicon and
  `role="menuitemradio"` + `aria-checked` (single choice, so the selected
  fill is right here, unlike D46's toggle lists); the "(current)" suffix
  is gone.
- **Why:** these are Projects' default Todo / In progress / Done colours and
  GitHub's open-green / closed-purple; ADO's own per-state hex colours would
  break the no-raw-colours rule.

## D61 — Board columns as GitHub Projects; taskboard cells boxed per row — **PROVISIONAL**
- **Context:** Kanban columns are one element; the sprint taskboard is a
  table, so a "column" is a stack of cells, one per parent row.
- **Decision:** Kanban columns: `--bgColor-muted`, 1px `--borderColor-default`
  border, 6px radius. Cards: `--bgColor-default`, 1px border, 6px, no
  shadow. Taskboard cells: same muted box drawn inside a 4px transparent
  border on all four sides (was left/right only), the 1px line as an inset
  shadow so the gutters stay clear. Card spacing/padding rules unchanged.
- **Why provisional:** each taskboard row now reads as its own set of
  column boxes (like Projects' grouped board) and rows gain 8px; needs a
  live look, and `border-radius` is ignored if the table collapses borders.

## D62 — Column counts and comment counts are gh-Counter
- **Decision:** taskboard column counts render as a `gh-Counter` holding
  the bare number (was " (7)"); `headerName()` now strips the count only as
  a suffix, so a name containing the same digits survives (test added).
  Card comment chips: `comment` octicon + `gh-Counter`, `--fgColor-muted`;
  `top` 22px → 20px because the 20px Counter centres on the id line itself.
- **Why:** Projects shows column counts and card counts as Counters.

## D63 — Backlog/sprint header status text is muted, 14px — **PROVISIONAL**
- **Decision:** the title-row status ("n of m · dates · days left") moves
  from primary-text 13px to `--fgColor-muted` at `--text-body-size-medium`.
- **Why:** GitHub sets meta text beside a title in muted. Provisional
  because the user may want the counts at full contrast.

## D64 — Octicon as CSS mask on React-owned native buttons
- **Context:** Related Work's "Add link" shows a `+` drawn by `::before`
  on ADO's own button; appending an `<svg>` child to a React node is unsafe.
- **Decision:** `octiconMask(name)` turns `octicon()` into a data-URL
  `mask` image painted with `currentColor`; the `+` is now the `plus`
  octicon this way.
- **Why:** octicons everywhere without touching React's children. The same
  helper could live in core/primer if another feature needs it.

## D65 — Work item header as GitHub's issue header — **PROVISIONAL**
- **Decision:** the title input gets GitHub's large title (32px,
  regular weight, `--text-title-*` tokens) and the header closes with a 1px
  `--borderColor-default` rule and 16px of padding. Comments are styled as
  gh-Boxes by CSS (D41); the composer field is a bordered 6px box; the
  timeline gap is 16px. The Attachments proxy is `gh-btn gh-btn-invisible`
  with a `paperclip` octicon and a `gh-Counter` (was 📎 text).
- **Why provisional:** the title selector (`header > :nth-child(2) input`)
  and the comment padding are unverified live; a fixed-height bolt
  textfield may clip a 32px title.

## D66 — Work item rail: GitHub sidebar sections
- **Decision:** rail groups (except stubbed/hidden ones) end with a 1px
  `--borderColor-muted` rule and 16px padding/margin; group headings are
  12px semibold `--fgColor-muted`; KV rows are 12px with muted labels and
  `--control-transparent-bgColor-hover` hover; tags are
  `gh-Label gh-Label--secondary`.
- **Why:** this is GitHub's issue sidebar. KV rows keep their 32px
  min-height, which the teleport edit depends on.

## D10a — Release held back: live verification not possible unattended
- **Context:** the user authorised push + release "when the stage passes".
  The pass requires live side-by-side checks; Violentmonkey in the user's
  Firefox is running an installed copy (canvas still ADO's #202020), not the
  tracked `dist/` build, and the Firefox add-on needs a manual
  `about:debugging` reload for the read-only probes.
- **Decision:** commit and tag locally (v0.53.0, v0.54.0, docs), do not push
  or release until the live pass has run. Releasing would push an unverified
  makeover to every installed copy.

## D10b — Live pass (dark) done; light not checked live
- Dark: PR list, PR overview, PR files, work item and Kanban board checked
  side by side with GitHub (2026-11-02). Two bugs found and fixed: theme
  class matched a feature flag (v0.54.2); ADO page containers kept ADO's
  canvas (v0.54.3). Monaco stays ADO-black (known, stage 3).
- Light: checked after the user authorised switching their ADO theme
  (switched to Light, checked PR list / PR overview / work item, switched
  back to Dark). Reads as GitHub Light; borders confirmed at full zoom.

## D10c — Primer rem sizes converted to px at build time
- **Context:** Primer writes borders/radii/sizes in rem against GitHub's
  16px root; ADO's root font size isn't guaranteed to be 16px.
- **Decision:** `remToPx` (build-css.ts) converts every rem in the bundled
  token files to px (×16), pinning GitHub's rendered sizes.

## D67 — No removal without a way back in (2026-11-02)
- **Context:** an audit of everything the script hides found actions with
  no remaining path: New Work Item on Backlogs and both sprint tabs, the
  Mine view, Add link on a work item without links, Development (branch /
  PR linking), History and Follow.
- **Decision:** hiding a duplicate is fine; the only path to an action is
  demoted, never removed. New Work Item is an icon proxy next to Filter
  (ADO's own add callout opens; it light-dismisses). Related Work always
  shows its "+". Development and Follow are back as ADO renders them;
  History is a header icon proxy next to Attachments. Mine is an accent
  "Author" / "Reviewer" gh-Label after the row title (user's choice over
  restoring the tab).
- **Kept hidden (user-requested, information or duplicates only):** the
  Analytics/Capacity/Backlog tabs, the burndown widget, the Deployments
  group, Maximize toggles, the Assigned to / Parent Work Item filters,
  and the duplicate controls folded into adofix widgets.
