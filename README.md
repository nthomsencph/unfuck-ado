# ado-unfuck

A Violentmonkey userscript that unfucks the Azure DevOps web UI. Client-side
only, same-origin, no PAT, no background script. MIT-licensed.

## Install

With [Violentmonkey](https://violentmonkey.github.io/) (or another userscript
manager) installed, open the latest release build and confirm the install:

> https://github.com/nthomsencph/unfuck-ado/releases/latest/download/ado-unfuck.user.js

Updates arrive automatically through the same URL. Works on `dev.azure.com`
and legacy `*.visualstudio.com` organizations, in Firefox (primary target)
with English-language ADO UI; both ADO themes are supported.

## What it does

**Pull requests**

- `pr-drafts` — batched review comments riding ADO's own composer: draft
  locally, see drafts as inline cards, Monaco view zones and file-tree rows,
  then submit them all at once.
- `pr-review-flow` — GitHub-style review: a **Review** button, "n/m files
  reviewed" progress, next-unreviewed navigation, mark-reviewed-and-next.
- `pr-reviewed` — per-file "Reviewed" checkboxes on the diff headers, synced
  with ADO's file tree; checking collapses the file's card.
- `pr-comments` — one toolbar button holding resolved counts, draft count,
  the thread filter and ADO's advanced filters.
- `pr-thread-filter` — resolved/closed threads collapse to click-to-reveal
  placeholders.
- `pr-checks` — every policy check inline on the Overview status card,
  failures first.
- `pr-overview` — Overview restructured: card-based conversation, one merged
  reviewer list, oldest-first feed with the composer at the bottom.
- `pr-actions` — auto-complete and merge actions folded into the ⋮ menu.
- `pr-diff-totals` — whole-PR **−dels +adds** next to "n changed files".
- `pr-keynav` — keyboard navigation on the Files tab.

**Boards & work items**

- `workitem-layout` — the work item form restructured GitHub-issue-style:
  one readable column plus a compact details rail.
- `workitem-state` — hotkey state picker (REST PATCH).
- `card-comments` — 💬 comment counts on board cards.
- `board-density` / `chrome-density` — denser cards, lanes and header chrome
  on a layered dark canvas.
- `backlog-toolbar` / `backlog-grid` / `backlog-status` / `sprint-header` /
  `taskboard-columns` — backlog and sprint cleanup: compact toolbars,
  filtered-vs-total counts, taskboard column fit.

### Hotkeys

Active outside of inputs and editors only.

| Key | Action | Where |
|---|---|---|
| `j` / `k` | next / previous changed file | PR **Files tab** |
| `n` / `p` | next / previous comment thread | PR |
| `u` | next **unresolved** thread | PR |
| `t` | toggle the file tree pane | PR |
| `s` | change work item state | work item form, boards |

## Developing

```sh
pnpm install
pnpm build        # emits dist/ado-unfuck.user.js
pnpm dev          # rebuild on change
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
```

Install the local build by pasting `file://<repo>/dist/ado-unfuck.user.js`
into Firefox's address bar (Violentmonkey needs **Access local files** in
`about:addons`). On the install tab, enable **Track external edits** and
keep the tab open — every rebuild then re-installs automatically; reload
the ADO tab to see it. If something looks off, run
`localStorage.setItem("adofix.debug", "1")` in the ADO tab's console and
reload to get `[adofix]` log lines.

Implementation notes, the selector verification ledger and the architecture
live in [docs/INTERNALS.md](docs/INTERNALS.md) — updated with every change.

## Releasing

Every version is a git tag; a public release is that tag plus the built
script attached:

```sh
pnpm build
gh release create vX.Y.Z dist/ado-unfuck.user.js --title vX.Y.Z --notes "see commit messages"
```

The banner's `@updateURL`/`@downloadURL` point at
`releases/latest/download/ado-unfuck.user.js`, so installed scripts follow
the newest release automatically.

## Disable / uninstall

The Violentmonkey toolbar icon toggles the script per-browser; its dashboard
removes it. No server side, no stored credentials — prefs live in
`GM_setValue` and are deleted with the script.

## License

MIT — see [LICENSE](LICENSE).
