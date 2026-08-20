# pr-list Restyle Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub-style restyle of the PR list page (`/_git/<repo>/pullrequests`) — card material, quiet rows, 20px author coin, outline pills, and a tidied meta line ("!7039 · Nicolai · into main").

**Architecture:** One new feature `src/features/pr-list.ts` (spec: `docs/specs/2026-08-20-pr-list-design.md`). CSS injected unconditionally on `repos-pr` routes (selectors are scoped to list-only classes); a `nodeValue`-only text sweep runs in `apply(route)` when `route.id === null` and is re-applied by the registry's route-change + DOM-settle cadence. No REST, no structural DOM changes.

**Tech Stack:** TypeScript strict, Vitest (jsdom), esbuild → single IIFE userscript. pnpm.

**Working style (repo law):** every build bumps the version (`npm pkg set version=0.x.y`); `pnpm typecheck && pnpm test && pnpm build` before every commit; one commit per version, tagged `vX.Y.Z`; commit messages end `Claude goes brr.. via Dash`; commits run with `-c core.hooksPath=/dev/null`; pixel changes carry a Firefox checklist in the commit message. Public release only after the user verifies the tag in Firefox — do NOT `gh release create` in this plan.

---

### Task 1: Live Chrome probe — resolve the five CSS unknowns

No code lands in this task. Probe the live PR list per the `ado-live-verification-setup` memory (org `dev.azure.com/Akademikernes`, project "AI og DT", repo `aka-ai-platform`, URL `/_git/aka-ai-platform/pullrequests?_a=active`). DLP: return derived values only, never `outerHTML`/`location.search`.

- [ ] **Step 1: Open the page and inject a prototype style element**

Navigate Chrome to the Active tab of the PR list, wait ~6s (slow tenant). All prototype CSS goes in one `<style id="adofix-proto-prlist">` so removal is a single element delete.

- [ ] **Step 2: Probe the five unknowns**

Run in the page (adjust as needed; keep results as derived values):

```js
// 1. How is the marked-row blue edge drawn? (border-left vs ::before vs box-shadow)
const m = document.querySelector('.repos-pr-list .bolt-list-row-marked');
const cs = getComputedStyle(m), before = getComputedStyle(m, '::before');
({ borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftColor,
   beforeContent: before.content, beforeWidth: before.width, beforeBg: before.backgroundColor,
   boxShadow: cs.boxShadow.slice(0, 80) });
```

```js
// 2. Pill class inventory: which classes distinguish Draft/Declined/Required/tag pills?
[...document.querySelectorAll('.repos-pr-list .bolt-pill')].map(p =>
  ({ cls: p.className, text: p.textContent, bg: getComputedStyle(p).backgroundColor,
     border: getComputedStyle(p).borderColor }));
```

```js
// 3. Reviewer-cell coin classes (must NOT be caught by the author-coin shrink)
const row = [...document.querySelectorAll('a[href*="/pullrequest/"]')]
  .find(r => r.children[3].querySelector('.bolt-coin'));
[...row.children[3].querySelectorAll('.bolt-coin')].map(c => c.className);
```

```js
// 4. "1 new push" / "n new comments" notice DOM inside the time cell
const t = [...document.querySelectorAll('a[href*="/pullrequest/"]')]
  .map(r => r.children[5]).find(td => td.textContent.includes('new'));
t ? [...t.querySelectorAll('*')].map(e => e.tagName + '.' + e.className).slice(0, 8) : 'none on page';
```

```js
// 5. Author-coin cell geometry for the 20px alignment (cell padding, two-line cell top offset)
const r0 = document.querySelector('a[href*="/pullrequest/"]');
const coin = r0.children[1].querySelector('.bolt-coin'), title = r0.querySelector('.body-l');
({ coinRect: coin.getBoundingClientRect().height, titleTop: title.getBoundingClientRect().top - r0.getBoundingClientRect().top,
   cellPad: getComputedStyle(r0.children[1]).padding });
```

- [ ] **Step 3: Prototype the full Task 2 CSS live**

Put the complete CSS block from Task 2 Step 1 into `#adofix-proto-prlist`, adjusted to the probe findings (marker mechanism, pill classes, notice selector, coin alignment margin). Screenshot, compare against GitHub's look, tune the tint/hairline values.

- [ ] **Step 4: Check the Mine tab too**

Navigate to `?_a=mine`, confirm the proto holds on the section cards ("Created by me" / "Assigned to me") and their sub-tab rows; screenshot.

- [ ] **Step 5: REMOVE the prototype**

```js
document.getElementById('adofix-proto-prlist')?.remove();
```

Record the five findings (they go into the Task 2 commit message and the INTERNALS ledger).

---

### Task 2: `pr-list` feature — material + row CSS (v0.49.0)

**Files:**
- Create: `src/features/pr-list.ts`
- Modify: `src/main.ts` (import + register + info string)
- Modify: `docs/INTERNALS.md` (feature table + selector ledger)

- [ ] **Step 1: Create `src/features/pr-list.ts`**

The CSS below is the verified baseline; where Task 1's findings differ (marked-row mechanism, exact pill classes, notice selector, coin margin), use the probed reality and note it in the file's comments. Two candidate rules are given for the marked-row edge — keep the one matching the probed mechanism, delete the other.

```ts
import type { Feature } from "../core/registry";
import { ACCENT, injectStyleOnce } from "../core/dom";

/**
 * GitHub-style restyle of the PR list page (spec:
 * docs/specs/2026-08-20-pr-list-design.md). Pure CSS in this feature's first
 * cut; the meta-line text sweep lands separately. Selectors verified live
 * 2026-08-20 (.repos-pr-list / .repos-pr-section-card /
 * .repos-pr-listing-filterbar exist ONLY on the list page, so the sheet is
 * inert on PR detail routes).
 */
export const prList: Feature = {
  id: "pr-list",
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce("pr-list", CSS);
  },
};

const CSS = `
/* Card material — the pr-overview card recipe, so list and overview read as
   one theme (list card is natively a flat full-width slab). */
.repos-pr-section-card.bolt-card {
  background: var(--adofix-card) !important;
  border-radius: var(--adofix-radius) !important;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    0 1px 4px rgba(0, 0, 0, 0.5) !important;
}
/* Filter bar: depth-8 shadow off, flat against the page. */
.repos-pr-listing-filterbar {
  background: transparent !important;
  box-shadow: none !important;
}
/* Row hairlines: bolt-table-show-lines draws cell top borders — soften to a
   GitHub-quiet line. */
.repos-pr-list .bolt-table-cell {
  border-top-color: rgba(128, 128, 128, 0.12) !important;
}
/* Subtle hover tint (rows are <a> elements). */
.repos-pr-list a.bolt-table-row:hover {
  background: rgba(128, 128, 128, 0.06) !important;
}
/* "New activity" left edge in our accent instead of ADO blue.
   KEEP ONE of these two rules per the Task 1 probe, delete the other: */
.repos-pr-list .bolt-list-row-marked {
  border-left-color: ${ACCENT} !important;
}
.repos-pr-list .bolt-list-row-marked::before {
  background-color: ${ACCENT} !important;
}
/* Author coin 32 → 20px, centered on the title line. size32 appears only on
   the author cell (reviewer coins are smaller classes — verified Task 1). */
.repos-pr-list .bolt-coin.size32,
.repos-pr-list .bolt-coin.size32 .bolt-coin-content {
  width: 20px !important;
  height: 20px !important;
}
/* Pills: GitHub outline style — transparent bg, 1px border. Text color (and
   thereby the semantic Draft/Declined/Required tint) is left alone. */
.repos-pr-list .bolt-pill {
  background: transparent !important;
  border: 1px solid var(--border-subtle-color, rgba(128, 128, 128, 0.35)) !important;
}
/* Updated column muted; the "n new push/comments" notice pops in accent. */
.repos-pr-list time.bolt-time-item {
  color: var(--text-secondary-color, #a19f9d) !important;
}
/* Notice line ("1 new push", "2 new comments, 34 new push…"): the updated
   cell is td 6 of 8; the notice is its non-<time> text container (confirm
   the wrapper against the Task 1 probe and tighten if it differs). Mixed
   toward text color for legibility on the dark card. */
.repos-pr-list a.bolt-table-row > td:nth-child(6) span.text-ellipsis:not(:has(time)) {
  color: color-mix(in srgb, ${ACCENT} 70%, var(--text-primary-color, #fff)) !important;
}
`;
```

- [ ] **Step 2: Register in `src/main.ts`**

Add the import (alphabetical, after `pr-keynav`):

```ts
import { prList } from "./features/pr-list";
```

Register after `prActions`:

```ts
  registry.register(prList);
```

Append `pr-list` to the feature list in the `info(...)` string.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck clean, 268 tests pass, `dist/ado-unfuck.user.js` builds.

- [ ] **Step 4: Update `docs/INTERNALS.md`**

Feature table (PR section) gets a `pr-list` row:

> Pure CSS restyle of the PR list page, GitHub-flavored: the list card gets the adofix card recipe (`--adofix-card`, radius, heavy shadow), filter bar sits flat, row hairlines soften, rows get a hover tint, the new-activity edge turns accent, the 32px author coin shrinks to 20px, and pills go outline-style. Selectors are list-page-only (`.repos-pr-list`, `.repos-pr-section-card`, `.repos-pr-listing-filterbar`), so the sheet is inert on PR detail routes.

Selector ledger: add the Task 1 findings (marked-row mechanism, pill classes, reviewer coin classes, notice DOM) dated 2026-08-20.

- [ ] **Step 5: Bump version, rebuild, commit, tag, push**

```bash
npm pkg set version=0.49.0
pnpm typecheck && pnpm test && pnpm build
git -c core.hooksPath=/dev/null add -A
git -c core.hooksPath=/dev/null commit -m "pr-list: GitHub-style material + row CSS for the PR list page

Firefox checklist:
- [ ] /pullrequests Active: list card rounded on --adofix-card w/ shadow
- [ ] row hairlines quiet, hover tints rows
- [ ] author coins 20px, centered on the title line; reviewer coins untouched
- [ ] pills outlined, semantic text colors intact
- [ ] new-activity left edge is accent purple
- [ ] updated column muted, 'n new push/comments' notices legible
- [ ] Mine tab: both section cards + sub-tabs look right
- [ ] PR detail pages (Overview/Files) unchanged

Claude goes brr.. via Dash"
git tag v0.49.0
git push && git push --tags
```

---

### Task 3: Meta-line sweep (v0.50.0)

**Files:**
- Modify: `src/features/pr-list.ts`
- Create: `src/features/pr-list.test.ts`
- Modify: `docs/INTERNALS.md`

- [ ] **Step 1: Write the failing tests**

Create `src/features/pr-list.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { rewriteMetaValues, sweepMetaLines } from "./pr-list";

/** The live meta-line span: text nodes then the branch icon + name spans. */
function buildRow(metaTextNodes: string[]): HTMLElement {
  const table = document.createElement("table");
  table.className = "repos-pr-list";
  const row = document.createElement("a");
  row.href = "/org/proj/_git/repo/pullrequest/7039";
  const line = document.createElement("div");
  line.className = "secondary-text body-s text-ellipsis";
  const span = document.createElement("span");
  for (const t of metaTextNodes) span.appendChild(document.createTextNode(t));
  const icon = document.createElement("span");
  icon.className = "fluent-icons-enabled";
  const branch = document.createElement("span");
  branch.className = "monospaced-xs padding-horizontal-4";
  branch.textContent = "main";
  span.append(icon, branch);
  line.appendChild(span);
  row.appendChild(line);
  table.appendChild(row);
  document.body.appendChild(table);
  return span;
}

describe("rewriteMetaValues", () => {
  it("rewrites the live node shape to '!id · First · into '", () => {
    expect(
      rewriteMetaValues(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "])
    ).toEqual(["", "!7039", " · ", "Nicolai", " · into "]);
  });

  it("takes the first whitespace token of single-token names too", () => {
    expect(rewriteMetaValues(["", "nthomsencph", " request !", "12", " into "])).toEqual([
      "",
      "!12",
      " · ",
      "nthomsencph",
      " · into ",
    ]);
  });

  it("is idempotent: a rewritten shape no longer matches", () => {
    expect(rewriteMetaValues(["", "!7039", " · ", "Nicolai", " · into "])).toBeNull();
  });

  it("leaves unknown shapes alone (localized UI, ADO update)", () => {
    expect(rewriteMetaValues(["", "Nicolai", " anmodning !", "7039", " ind i "])).toBeNull();
    expect(rewriteMetaValues(["", "Nicolai", " request !", "abc", " into "])).toBeNull();
    expect(rewriteMetaValues([""])).toBeNull();
  });
});

describe("sweepMetaLines", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("rewrites a live-shaped row in place, preserving the branch spans", () => {
    const span = buildRow(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "]);
    sweepMetaLines(document);
    expect(span.textContent).toBe("!7039 · Nicolai · into main");
    expect(span.querySelector(".monospaced-xs")?.textContent).toBe("main");
  });

  it("is a no-op on the second pass", () => {
    const span = buildRow(["", "Nicolai Syv.ai konsulent", " request !", "7039", " into "]);
    sweepMetaLines(document);
    sweepMetaLines(document);
    expect(span.textContent).toBe("!7039 · Nicolai · into main");
  });

  it("leaves non-matching rows untouched", () => {
    const span = buildRow(["", "Nicolai", " anmodning !", "7039", " ind i "]);
    sweepMetaLines(document);
    expect(span.textContent).toBe("Nicolai anmodning !7039 ind i main");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/features/pr-list.test.ts`
Expected: FAIL — `rewriteMetaValues`/`sweepMetaLines` are not exported.

- [ ] **Step 3: Implement in `src/features/pr-list.ts`**

Add below the imports (and change the `import type` to include `Route`):

```ts
import type { Route } from "../core/router";
```

```ts
/**
 * Meta-line rewrite: "{Display Name} request !{id} into {branch}" →
 * "!{id} · {FirstName} · into {branch}". Pure function over the leading
 * text-node values of the meta span; returns null when the shape doesn't
 * match (localized UI, ADO update, already rewritten) so the sweep degrades
 * to a no-op, never a mangled line. Idempotence falls out: after a rewrite
 * no node equals " request !".
 */
export function rewriteMetaValues(values: readonly string[]): string[] | null {
  const idx = values.indexOf(" request !");
  if (idx < 1) return null;
  const name = values[idx - 1]?.trim();
  const id = values[idx + 1];
  if (!name || !id || !/^\d+$/.test(id) || values[idx + 2] !== " into ") return null;
  const out = [...values];
  out[idx - 1] = `!${id}`;
  out[idx] = " · ";
  out[idx + 1] = name.split(/\s+/)[0]!;
  out[idx + 2] = " · into ";
  return out;
}

/**
 * Applies rewriteMetaValues to every PR-list row's meta span. nodeValue
 * writes only — no structural DOM change for React to fight; the registry's
 * settle re-apply repairs any React re-render that restores the original.
 */
export function sweepMetaLines(root: ParentNode): void {
  const lines = root.querySelectorAll<HTMLElement>(
    '.repos-pr-list a[href*="/pullrequest/"] .secondary-text.body-s > span'
  );
  for (const line of lines) {
    const textNodes: Text[] = [];
    for (const node of line.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) break; // leading text run only
      textNodes.push(node as Text);
    }
    const next = rewriteMetaValues(textNodes.map((t) => t.nodeValue ?? ""));
    if (!next) continue;
    textNodes.forEach((t, i) => {
      if (t.nodeValue !== next[i]) t.nodeValue = next[i]!;
    });
  }
}
```

Change `apply` to run the sweep on list pages only:

```ts
  apply(route: Route): void {
    injectStyleOnce("pr-list", CSS);
    if (route.id === null) sweepMetaLines(document);
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/features/pr-list.test.ts`
Expected: PASS (7 tests). Then the full gate: `pnpm typecheck && pnpm test && pnpm build` — all green.

- [ ] **Step 5: Verify live in Chrome (emulation)**

Per the verification memory: on the live PR list, paste the compiled `sweepMetaLines` body (or equivalent inline script) into the console, confirm every row reads `!<id> · <FirstName> · into <branch>`, no mangled rows, branch icon intact. This is DOM state (not CSS): reload the page afterward to restore.

- [ ] **Step 6: Update `docs/INTERNALS.md`**

Extend the `pr-list` feature-table row:

> A `nodeValue`-only text sweep (list routes: `route.id === null`) rewrites each row's meta line "{Display Name} request !{id} into {branch}" → "!{id} · {FirstName} · into {branch}" — the meta span is discrete text nodes (verified live 2026-08-20), unknown shapes are left alone, and the registry's settle re-apply repairs React re-renders.

- [ ] **Step 7: Bump version, rebuild, commit, tag, push**

```bash
npm pkg set version=0.50.0
pnpm typecheck && pnpm test && pnpm build
git -c core.hooksPath=/dev/null add -A
git -c core.hooksPath=/dev/null commit -m "pr-list: meta line tidied to '!id · First · into branch'

Firefox checklist:
- [ ] /pullrequests rows read '!7039 · Nicolai · into main'
- [ ] branch icon + monospace branch intact
- [ ] rows survive tab switches / filtering (settle re-apply repairs)
- [ ] no mangled meta lines anywhere (Mine tab sections included)

Claude goes brr.. via Dash"
git tag v0.50.0
git push && git push --tags
```

---

### Done

Both tags await the user's Firefox verification before any public release (`gh release create` pushes to every installed user — never run it inside this plan).
