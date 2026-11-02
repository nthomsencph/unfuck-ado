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
