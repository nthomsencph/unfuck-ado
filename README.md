# Unf*ck ADO

[![Latest release](https://img.shields.io/github/v/release/nthomsencph/unfuck-ado?label=latest&color=8250df)](https://github.com/nthomsencph/unfuck-ado/releases/latest)
[![Install](https://img.shields.io/badge/install-ado--unfuck.user.js-8250df)](https://github.com/nthomsencph/unfuck-ado/releases/latest/download/ado-unfuck.user.js)

A Violentmonkey userscript that unf*cks the devastatingly poor Azure DevOps web UI. Everything runs client-side against the same origin. No PAT, no background script. MIT licensed.

## Install

With [Violentmonkey](https://violentmonkey.github.io/) (or another userscript manager) installed, click the install badge above or open the latest release build directly and confirm the install:

> https://github.com/nthomsencph/unfuck-ado/releases/latest/download/ado-unfuck.user.js

The script updates itself from that URL, and all versions live on the [releases page](https://github.com/nthomsencph/unfuck-ado/releases). It works on `dev.azure.com` and legacy `*.visualstudio.com` organizations. Firefox is the primary target, the ADO UI needs to be in English, and both ADO themes are supported.

## What it does

**Pull requests**

- `Draft comments` — write review comments in ADO's own editor and keep them as local drafts instead of posting them one by one. Drafts show up as inline cards in the diff, under their file in the tree, and in a panel where you can edit them, jump to them, and submit the whole batch at once.
- `PR review flow` — an actual **Review** button. GitHub-style reviewing for assigned reviewers, with progress tracking, jumping to the next unreviewed file, and marking a file reviewed before moving on. After you vote, the button shows your vote. If the PR changes under it, the button flips to "Re-review · k new" so you only look at what changed.
- `Reviewed status` — per-file "Reviewed" checkboxes on the diff headers, synced with ADO's file tree. Checking a file collapses its card.
- `Delightful review toolbar` — one toolbar button that holds the resolved count, your draft count, the thread filter, and ADO's advanced filters.
- `PR thread filter` — resolved and closed threads collapse into small placeholders you can click to reveal.
- `Visible PR checks` — every policy check shown directly on the Overview status card, failures first.
- `PR UI improvements` — the Overview page restructured. Conversation becomes cards, reviewers merge into one list, the feed runs oldest first with the composer at the bottom, and the auto-complete and merge actions fold into the ⋮ menu.
- `Diff totals` — whole-PR **−dels +adds** next to "n changed files".

**Boards & work items**

- `Layout for WI` — the work item form laid out like a GitHub issue, with one readable column and a compact details rail.
- `Workitem state` — change a work item's state with a hotkey.
- `Card comments` — 💬 comment counts on board cards.
- `Board density` / `chrome density` — denser cards, lanes, and header chrome on a layered dark canvas.
- `Backlog & sprint cleanup` — compact toolbars, filtered-vs-total counts, and taskboard columns that actually fit.

### Hotkeys

Hotkeys only fire outside inputs and editors.

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

Install the local build by pasting `file://<repo>/dist/ado-unfuck.user.js` into Firefox's address bar (Violentmonkey needs **Access local files** in `about:addons`). On the install tab, enable **Track external edits** and keep the tab open. Every rebuild then reinstalls automatically, and reloading the ADO tab picks it up. If something looks off, run `localStorage.setItem("adofix.debug", "1")` in the ADO tab's console and reload to get `[adofix]` log lines.

Implementation notes, the selector verification ledger, and the architecture live in [docs/INTERNALS.md](docs/INTERNALS.md), which is updated with every change.

## Releasing

Every version is a git tag. A public release is that tag with the built script attached:

```sh
pnpm build
gh release create vX.Y.Z dist/ado-unfuck.user.js --title vX.Y.Z --notes "see commit messages"
```

The banner's `@updateURL`/`@downloadURL` point at `releases/latest/download/ado-unfuck.user.js`, so installed scripts follow the newest release on their own.

## Disable / uninstall

The Violentmonkey toolbar icon toggles the script per browser, and its dashboard removes it. There is no server side and no stored credentials. Preferences live in `GM_setValue` and are deleted with the script.

## License

MIT — see [LICENSE](LICENSE).
