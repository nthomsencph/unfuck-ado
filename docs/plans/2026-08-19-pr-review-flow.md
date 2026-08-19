# pr-review-flow Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub-style Review flow for ADO PRs — a header Review button that starts a per-PR review, a Files-toolbar progress counter riding ADO's built-in per-file reviewed state, and next-unreviewed navigation.

**Architecture:** New `pr-review-flow` feature. The server viewed-state slot moves into shared `pr/reviewed-data`; the virtualized-tree sweep/click machinery moves into shared `pr/reviewed-tree`; pr-reviewed and pr-drafts are refactored onto the shared pieces first (pure refactor, tagged v0.42.0), then the feature lands (v0.43.0). Spec: `docs/specs/2026-08-19-pr-review-flow-design.md`.

**Tech Stack:** TypeScript strict, Vitest (jsdom), esbuild; the repo's Feature/registry/settle-observer pattern.

**Live-verified selectors (Chrome, 2026-08-19 — bake into the ledger in Task 6):**
- Header vote button container: `.repos-pr-header .repos-pr-header-vote-button` — our button inserts **before** it in its parent flex row.
- Files tab: `a.bolt-tab[href*="_a=files"]` — synthetic `.click()` SPA-navigates.
- Native progress text: `.pr-header-viewed-files` ("1/40 files reviewed"), lives in the PR header secondary title row, appears only at n ≥ 1.
- Changed-files total: a leaf `<span>` in `.repos-compare-toolbar` with text "40 changed files".
- Stacked-view scroller: `.repos-changes-viewer` (scroll-auto container of the `.repos-summary-header` sections).

**Working style (repo rules):** `npm pkg set version=0.x.y` before EVERY build; `pnpm typecheck && pnpm test && pnpm build` before every commit; commits bypass hooks with `git -c core.hooksPath=/dev/null commit`; messages end with "Claude goes brr.. via Dash"; behavior-changing tags list a Firefox checklist in the commit message.

---

### Task 1: Move `waitFor` to core/observe and `flashOutline` to core/dom

pr-review-flow needs both; today they're private to pr-drafts.

**Files:**
- Modify: `src/core/observe.ts` (append)
- Modify: `src/core/dom.ts` (append function; add flash CSS to `BASE_CSS` in `injectBaseStyle`)
- Modify: `src/features/pr-drafts.ts` (delete local copies, import)

- [ ] **Step 1: Append `waitFor` to `src/core/observe.ts`**

Move the function verbatim from `pr-drafts.ts` (it sits right below `captureDraft`, around line 593) and export it:

```ts
/** Poll for a DOM condition; resolves null on timeout. */
export function waitFor<T>(get: () => T | null, timeoutMs = 5000, stepMs = 150): Promise<T | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs;
    const tick = (): void => {
      const value = get();
      if (value !== null) {
        resolve(value);
        return;
      }
      if (performance.now() > deadline) {
        resolve(null);
        return;
      }
      setTimeout(tick, stepMs);
    };
    tick();
  });
}
```

- [ ] **Step 2: Append `flashOutline` to `src/core/dom.ts`**

```ts
/** One-shot accent flash to land the eye after a programmatic navigation. */
export function flashOutline(el: HTMLElement): void {
  el.classList.remove("adofix-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("adofix-flash");
  el.addEventListener("animationend", () => el.classList.remove("adofix-flash"), { once: true });
}
```

- [ ] **Step 3: Move the flash CSS into `BASE_CSS`**

In `src/core/dom.ts`, find the `BASE_CSS` template used by `injectBaseStyle()` and append (copy from `DRAFTS_CSS` in pr-drafts.ts, "Show landing flash" block — delete it there in Step 4; `ACCENT` is defined in this file):

```css
@keyframes adofix-flash {
  0% { box-shadow: 0 0 0 2px ${ACCENT}; }
  100% { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
}
.adofix-flash { animation: adofix-flash 1.4s ease-out; }
```

- [ ] **Step 4: Refactor `src/features/pr-drafts.ts`**

Delete the local `waitFor` function, the local `flashCard` function, and the `/* -- "Show" landing flash ---- */` CSS block (keyframes + `.adofix-flash`) from `DRAFTS_CSS`. Add imports:

```ts
import { waitFor } from "../core/observe";
// add flashOutline to the existing ../core/dom import list
```

Replace the two `flashCard(card)` call sites (in `revealDraftLine` and `showDraft`) with `flashOutline(card)`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, 245 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "core: waitFor and flashOutline become shared helpers

Claude goes brr.. via Dash"
```

---

### Task 2: Shared viewed-state slot in `pr/reviewed-data`

**Files:**
- Modify: `src/features/pr/reviewed-data.ts` (append slot)
- Modify: `src/features/pr-reviewed.ts` (consume; delete local slot)

- [ ] **Step 1: Append the slot to `src/features/pr/reviewed-data.ts`**

`fetchViewedPaths`, `PrRef` are already in this file's scope; add `refKey` to the existing `./threads-api` import and `log` from `../../core/log`.

```ts
// ---- shared live slot -------------------------------------------------------
// One viewed-paths set per PR, shared by pr-reviewed (checkbox mirrors) and
// pr-review-flow (progress + navigation). Deliberately NOT core/fetch-cache:
// the set is optimistically patched on toggle and refetched while the stale
// value keeps rendering — a live-synced value, not a fetch-once cache.

let slotKey: string | null = null;
let slotPaths: Set<string> | null = null;
let slotInFlight = false;
let slotFailed = false;

function ensureKey(ref: PrRef): void {
  const key = refKey(ref);
  if (key === slotKey) return;
  slotKey = key;
  slotPaths = null;
  slotInFlight = false;
  slotFailed = false;
}

function startFetch(ref: PrRef, onFresh?: () => void): void {
  slotInFlight = true;
  const startedFor = slotKey;
  void fetchViewedPaths(ref).then((res) => {
    slotInFlight = false;
    if (startedFor !== slotKey) return; // PR changed mid-flight
    if (!res.ok) {
      // Stand down for this page load; rendered tree rows still sync UIs.
      slotFailed = true;
      log("pr/reviewed-data", "viewed-state fetch failed", res.error);
      return;
    }
    slotPaths = res.value;
    onFresh?.();
  });
}

/**
 * The current PR's viewed-paths set, or null while unknown. Starts the fetch
 * when needed; onFresh fires when a fetch lands (callers re-apply then).
 */
export function viewedState(ref: PrRef, onFresh?: () => void): Set<string> | null {
  ensureKey(ref);
  if (slotPaths === null && !slotInFlight && !slotFailed) startFetch(ref, onFresh);
  return slotPaths;
}

/** Optimistic local patch after a toggle click, plus a background resync. */
export function patchViewed(ref: PrRef, path: string, viewed: boolean): void {
  ensureKey(ref);
  if (slotPaths) {
    if (viewed) slotPaths.add(path);
    else slotPaths.delete(path);
  }
  slotFailed = false;
  if (!slotInFlight) startFetch(ref);
}
```

- [ ] **Step 2: Refactor `src/features/pr-reviewed.ts` onto the slot**

Delete the module state `viewedKey`, `viewedPaths`, `viewedFetchInFlight`, `viewedFetchFailed` and the `refreshViewedPaths` function (keep `currentRef` and `treeIndexCache` for now — Task 3 moves the tree cache). Change the `fetchViewedPaths` import to `viewedState, patchViewed` (from `./pr/reviewed-data`).

In `apply()`: replace the key-swap block and fetch with

```ts
    currentRef = ref;
    const sections = safeQueryAll<HTMLElement>(DRAFT_SELECTORS.fileSection);
    if (sections.length === 0) return;
    const viewed = viewedState(ref, () => this.apply(route));
```

(the old `key !== viewedKey` reset now only resets `treeIndexCache`, keyed by `refKey(ref)` — keep a local `let treeKey: string | null` for that until Task 3 deletes it). The per-section sync line becomes:

```ts
      syncBox(box, live ? live.reviewed : (viewed?.has(path) ?? false));
```

In `toggleReviewed()`: replace the optimistic-patch block

```ts
    if (viewedPaths) { ... }
    viewedFetchFailed = false;
    if (currentRef) refreshViewedPaths(currentRef);
```

with

```ts
    if (currentRef) patchViewed(currentRef, path, !wasReviewed);
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean, 245 pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "pr/reviewed-data: one shared live viewed-state slot

Claude goes brr.. via Dash"
```

---

### Task 3: Tree sweep + row/checkbox clicks move into `pr/reviewed-tree`; v0.42.0

**Files:**
- Modify: `src/features/pr/reviewed-tree.ts` (append machinery)
- Modify: `src/features/pr-reviewed.ts` (consume; delete moved code)
- Modify: `src/features/pr-drafts.ts` (replace private `clickTreeFile`, export `currentFilePath`)

- [ ] **Step 1: Append to `src/features/pr/reviewed-tree.ts`**

Move `treeScroller`, `treeRowCount`, `delay`, `offsetForIndex`, `sweepTreeIndex` **verbatim** from pr-reviewed.ts (lines ~90–175; change the sweep's `log(FEATURE_ID, …)` to `log("pr/reviewed-tree", …)` and import `log` from `../../core/log`). Then add:

```ts
export interface TreeIndex {
  key: string;
  rowCount: number;
  byPath: Map<string, number>;
}

let treeIndex: TreeIndex | null = null;

/**
 * Sweep once per PR; expanding/collapsing folders renumbers the flat list,
 * so rowCount is the cheap staleness signal on top of the PR key.
 */
export async function getTreeIndex(key: string): Promise<TreeIndex | null> {
  if (treeIndex && treeIndex.key === key && treeIndex.rowCount === treeRowCount()) return treeIndex;
  const swept = await sweepTreeIndex();
  treeIndex = swept ? { key, rowCount: swept.rowCount, byPath: swept.byPath } : null;
  return treeIndex;
}

/** Files in tree order (sweeps the virtualized tree once per PR). */
export async function orderedFilePaths(key: string): Promise<string[] | null> {
  const index = await getTreeIndex(key);
  if (!index) return null;
  return [...index.byPath.entries()].sort((a, b) => a[1] - b[1]).map(([path]) => path);
}

interface EnsuredRow {
  row: HTMLElement;
  /** Put the tree back where it was — for clicks that shouldn't keep it here. */
  restore: () => void;
}

/** Scroll the virtualized tree until path's row renders. */
async function ensureTreeRow(key: string, path: string): Promise<EnsuredRow | null> {
  const direct = mapTreeFiles().get(path);
  if (direct) return { row: direct.row, restore: () => {} };
  const scroller = treeScroller();
  const index = (await getTreeIndex(key))?.byPath.get(path);
  if (!scroller || index === undefined) return null;
  const savedTop = scroller.scrollTop;
  scroller.scrollTop = Math.max(0, offsetForIndex(scroller, index) - scroller.clientHeight / 2);
  for (let tries = 0; tries < 20; tries++) {
    await delay(80);
    const row = safeQueryAll<HTMLElement>(TREE_SELECTORS.row).find(
      (r) => r.getAttribute("data-row-index") === String(index)
    );
    if (row)
      return {
        row,
        restore: () => {
          scroller.scrollTop = savedTop;
        },
      };
  }
  scroller.scrollTop = savedTop;
  return null;
}

/** Click ADO's reviewed checkbox for path; the tree scrolls back afterwards. */
export async function clickTreeCheckbox(key: string, path: string): Promise<boolean> {
  const ensured = await ensureTreeRow(key, path);
  if (!ensured) return false;
  const checkbox = safeQuery<HTMLElement>(TREE_SELECTORS.checkbox, ensured.row);
  if (!checkbox) {
    ensured.restore();
    return false;
  }
  checkbox.click();
  await delay(120); // let ADO fire its persistence call before we scroll away
  ensured.restore();
  return true;
}

/** Click the file's row itself — SPA-navigates to its single-file view
 * (verified live 2026-08-19). Navigation re-scrolls the tree; no restore. */
export async function clickTreeFileRow(key: string, path: string): Promise<boolean> {
  const ensured = await ensureTreeRow(key, path);
  if (!ensured) return false;
  ensured.row.click();
  return true;
}
```

Note `mapTreeFiles`, `readRenderedRows`, `buildTreePaths`, `TREE_SELECTORS`, `safeQuery`, `safeQueryAll` are already defined/imported in this file. `sweepTreeIndex`'s local `TreeIndexCache` interface comes along in the move — rename its usages to return `{ rowCount, byPath }` as before (the exported `TreeIndex` wraps it with `key`).

- [ ] **Step 2: Refactor `src/features/pr-reviewed.ts`**

Delete the moved functions, the local `TreeIndexCache`/`treeIndexCache`/`treeKey`, and `getTreeIndex`/`clickTreeCheckbox`. Import `clickTreeCheckbox` from `./pr/reviewed-tree` (drop now-unused `buildTreePaths`/`readRenderedRows` imports if nothing else uses them). In `toggleReviewed()` the click becomes:

```ts
    const clicked = currentRef ? await clickTreeCheckbox(refKey(currentRef), path) : false;
```

(`refKey` is already imported.)

- [ ] **Step 3: Refactor `src/features/pr-drafts.ts`**

Export the previously-private path helper (pr-review-flow needs it):

```ts
/** Single-file (Monaco) view: the open file's path from the breadcrumb. */
export function currentFilePath(): string | null {
```

Delete the private `clickTreeFile` function. Import `clickTreeFileRow` from `./pr/reviewed-tree` and replace the three `clickTreeFile(draft.filePath)` calls in `showDraft` with `clickTreeFileRow(currentKey!, draft.filePath)` — `currentKey` is the drafts key with the identical `org/project/repo/prId` format as `refKey`, and `showDraft` only runs with `currentKey` set (panel exists). Guard instead of asserting:

```ts
    const key = currentKey;
    if (!key) return;
```

at the top of `showDraft`, then use `clickTreeFileRow(key, draft.filePath)`.

- [ ] **Step 4: Verify, bump, build**

Run: `npm pkg set version=0.42.0 && pnpm typecheck && pnpm test && pnpm build`
Expected: clean, 245 pass, build ok.

- [ ] **Step 5: Commit + tag**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "pr/: tree sweep, row/checkbox clicks and viewed slot become shared modules

Pure refactor for the pr-review-flow feature: reviewed-tree owns the
virtualized-tree index (keyed per PR), row/checkbox clicking; reviewed-data
owns the live viewed-state slot; pr-drafts' Show rides the shared index
instead of its blind scroll sweep.

Firefox checklist: Mark-as-reviewed still toggles from stacked headers
(rendered and virtualized rows); drafts-panel Show still navigates across
files.

Claude goes brr.. via Dash" && git tag v0.42.0
```

---

### Task 4: pr-review-flow pure logic (TDD)

**Files:**
- Create: `src/features/pr-review-flow.ts` (pure exports only, feature object comes in Task 5)
- Create: `src/features/pr-review-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/pr-review-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  counterLabel,
  nextUnreviewedPath,
  parseChangedFiles,
  reviewButtonLabel,
} from "./pr-review-flow";

describe("parseChangedFiles", () => {
  it("parses the toolbar text", () => {
    expect(parseChangedFiles("40 changed files")).toBe(40);
    expect(parseChangedFiles(" 1 changed file ")).toBe(1);
  });

  it("rejects everything else", () => {
    expect(parseChangedFiles("changed files")).toBeNull();
    expect(parseChangedFiles("40 files")).toBeNull();
    expect(parseChangedFiles(null)).toBeNull();
    expect(parseChangedFiles(undefined)).toBeNull();
  });
});

describe("nextUnreviewedPath", () => {
  const order = ["/a", "/b", "/c"];

  it("starts at the top without an anchor", () => {
    expect(nextUnreviewedPath(order, new Set(), null)).toBe("/a");
  });

  it("skips reviewed files", () => {
    expect(nextUnreviewedPath(order, new Set(["/a"]), null)).toBe("/b");
  });

  it("continues after the anchor and wraps", () => {
    expect(nextUnreviewedPath(order, new Set(), "/b")).toBe("/c");
    expect(nextUnreviewedPath(order, new Set(["/c"]), "/b")).toBe("/a");
  });

  it("returns the anchor itself when it is the only file left", () => {
    expect(nextUnreviewedPath(order, new Set(["/a", "/c"]), "/b")).toBe("/b");
  });

  it("unknown anchor starts at the top", () => {
    expect(nextUnreviewedPath(order, new Set(), "/zzz")).toBe("/a");
  });

  it("null when everything is reviewed or there are no files", () => {
    expect(nextUnreviewedPath(order, new Set(order), "/a")).toBeNull();
    expect(nextUnreviewedPath([], new Set(), null)).toBeNull();
  });
});

describe("reviewButtonLabel", () => {
  it("is Review before starting", () => {
    expect(reviewButtonLabel(3, 40, false)).toBe("Review");
  });

  it("shows progress while reviewing", () => {
    expect(reviewButtonLabel(3, 40, true)).toBe("Reviewing · 3/40");
    expect(reviewButtonLabel(0, 40, true)).toBe("Reviewing · 0/40");
  });

  it("shows done at n = m", () => {
    expect(reviewButtonLabel(40, 40, true)).toBe("Reviewed ✓");
  });

  it("degrades while counts are unknown", () => {
    expect(reviewButtonLabel(null, 40, true)).toBe("Reviewing…");
    expect(reviewButtonLabel(3, null, true)).toBe("Reviewing…");
  });
});

describe("counterLabel", () => {
  it("shows n/m", () => {
    expect(counterLabel(3, 40)).toBe("3/40 files reviewed");
  });

  it("celebrates done", () => {
    expect(counterLabel(40, 40)).toBe("All files reviewed ✓");
  });

  it("degrades while counts are unknown", () => {
    expect(counterLabel(null, 40)).toBe("…/40 files reviewed");
    expect(counterLabel(3, null)).toBe("3/… files reviewed");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/features/pr-review-flow.test.ts`
Expected: FAIL — module has no exports yet.

- [ ] **Step 3: Implement the pure functions**

`src/features/pr-review-flow.ts` (top of the new file):

```ts
/** "40 changed files" → 40 (the Files toolbar's total; verified 2026-08-19). */
export function parseChangedFiles(text: string | null | undefined): number | null {
  const match = /^\s*(\d+)\s+changed files?\s*$/.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * First unreviewed file after `anchor` in tree order, wrapping. The anchor
 * itself is reachable last — "next" lands back on the current file when it
 * is the only one left to review.
 */
export function nextUnreviewedPath(
  order: readonly string[],
  viewed: ReadonlySet<string>,
  anchor: string | null
): string | null {
  if (order.length === 0) return null;
  const start = anchor ? order.indexOf(anchor) + 1 : 0; // unknown anchor → 0
  for (let i = 0; i < order.length; i++) {
    const path = order[(start + i) % order.length]!;
    if (!viewed.has(path)) return path;
  }
  return null;
}

export function reviewButtonLabel(n: number | null, m: number | null, started: boolean): string {
  if (!started) return "Review";
  if (n === null || m === null) return "Reviewing…";
  return m > 0 && n >= m ? "Reviewed ✓" : `Reviewing · ${n}/${m}`;
}

export function counterLabel(n: number | null, m: number | null): string {
  if (n !== null && m !== null && m > 0 && n >= m) return "All files reviewed ✓";
  return `${n ?? "…"}/${m ?? "…"} files reviewed`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/features/pr-review-flow.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/features/pr-review-flow.ts src/features/pr-review-flow.test.ts
git -c core.hooksPath=/dev/null commit -m "pr-review-flow: pure flow logic, test-first

Claude goes brr.. via Dash"
```

---

### Task 5: The pr-review-flow feature

**Files:**
- Modify: `src/features/pr-review-flow.ts` (append feature)
- Modify: `src/main.ts` (register)

- [ ] **Step 1: Append imports, selectors, CSS, state to `src/features/pr-review-flow.ts`**

```ts
import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { ACCENT, flashOutline, injectStyleOnce, safeQuery, safeQueryAll, showToast } from "../core/dom";
import { waitFor } from "../core/observe";
import { getValue, setValue } from "../core/storage";
import { currentFilePath, DRAFT_SELECTORS, sectionFilePath } from "./pr-drafts";
import { prRefFromRoute, refKey, type PrRef } from "./pr/threads-api";
import { patchViewed, viewedState } from "./pr/reviewed-data";
import { clickTreeCheckbox, clickTreeFileRow, orderedFilePaths } from "./pr/reviewed-tree";
import { findToolbar } from "./pr/toolbar";

const FEATURE_ID = "pr-review-flow";

/** All verified live 2026-08-19 (see README ledger). */
const FLOW_SELECTORS = {
  /** The Approve split-button's container; our button inserts before it. */
  voteButton: ".repos-pr-header .repos-pr-header-vote-button",
  /** Synthetic click SPA-navigates to the Files tab. */
  filesTab: 'a.bolt-tab[href*="_a=files"]',
  /** ADO's own "n/m files reviewed" header text (appears only at n ≥ 1). */
  nativeProgress: ".pr-header-viewed-files",
  /** The stacked view's scroll container (sections render near the viewport). */
  stackedScroller: ".repos-changes-viewer",
};

const CSS = `
.adofix-review-btn {
  background: ${ACCENT}; color: #fff; border: none; border-radius: 2px;
  font-weight: 600; font-size: 13px; padding: 5px 14px; margin-right: 8px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.adofix-review-btn:hover { background: #9161ea; }
.adofix-review-btn.adofix-done { background: rgba(130, 80, 223, 0.22); color: var(--adofix-ink); }

.adofix-review-progress, .adofix-review-mark {
  border: none; background: transparent; border-radius: 2px;
  font-weight: 600; font-size: 12px; padding: 4px 10px; margin-left: 8px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.7));
}
.adofix-review-progress:hover, .adofix-review-mark:hover {
  background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.05));
  color: var(--adofix-ink);
}
.adofix-review-progress, .adofix-review-mark {
  --adofix-ink: color-mix(in srgb, ${ACCENT} 62%, var(--text-primary-color, #201f1e));
}
.adofix-review-btn { --adofix-ink: color-mix(in srgb, ${ACCENT} 62%, var(--text-primary-color, #201f1e)); }

/* Our counter replaces ADO's native header progress while a review is on. */
html[data-adofix-reviewing] ${FLOW_SELECTORS.nativeProgress} { display: none; }
`;

interface FlowState {
  started: boolean;
  /** Remembered from the Files toolbar so the header label works on all tabs. */
  total?: number;
}

function readFlow(key: string): FlowState {
  return getValue<FlowState>(FEATURE_ID, key, { started: false });
}

function writeFlow(key: string, state: FlowState): void {
  setValue(FEATURE_ID, key, state);
}

let flowRef: PrRef | null = null;
let jumpBusy = false;
```

- [ ] **Step 2: Append the navigation + actions**

```ts
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stacked view: scroll (from the top) until path's section renders. */
async function jumpStacked(path: string): Promise<boolean> {
  const scroller = safeQuery<HTMLElement>(FLOW_SELECTORS.stackedScroller);
  if (!scroller) return false;
  const findSection = (): HTMLElement | null =>
    safeQueryAll<HTMLElement>(DRAFT_SELECTORS.fileSection).find(
      (s) => sectionFilePath(s) === path
    ) ?? null;
  let section = findSection();
  if (!section) scroller.scrollTop = 0;
  for (let step = 0; step < 40 && !section; step++) {
    await delay(120);
    section = findSection();
    if (section) break;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5) return false;
    scroller.scrollTop += scroller.clientHeight * 0.9;
  }
  if (!section) return false;
  section.scrollIntoView({ block: "start" });
  flashOutline(section);
  return true;
}

/** Jump to the next unreviewed file (single-file view: tree click; stacked:
 * section scroll with tree click as fallback). */
async function jumpNext(ref: PrRef): Promise<void> {
  if (jumpBusy) return;
  jumpBusy = true;
  try {
    const key = refKey(ref);
    const order = await orderedFilePaths(key);
    if (!order) {
      showToast("Couldn't index the file tree");
      return;
    }
    const viewed = viewedState(ref) ?? new Set<string>();
    const inMonaco = safeQuery(DRAFT_SELECTORS.monacoRoot) !== null;
    const target = nextUnreviewedPath(order, viewed, inMonaco ? currentFilePath() : null);
    if (!target) {
      showToast("All files reviewed 🎉");
      return;
    }
    if (inMonaco) {
      if (!(await clickTreeFileRow(key, target))) showToast("Couldn't reach the file in the tree");
      return;
    }
    if (!(await jumpStacked(target)) && !(await clickTreeFileRow(key, target)))
      showToast("Couldn't reach the file in the tree");
  } finally {
    jumpBusy = false;
  }
}

/** Header button: persist the flag, land on Files, go to the first gap. */
async function startReview(ref: PrRef): Promise<void> {
  const key = refKey(ref);
  writeFlow(key, { ...readFlow(key), started: true });
  document.documentElement.setAttribute("data-adofix-reviewing", "");
  if (!safeQuery(DRAFT_SELECTORS.filesView)) {
    safeQuery<HTMLElement>(FLOW_SELECTORS.filesTab)?.click();
    await waitFor(() => safeQuery(DRAFT_SELECTORS.filesView));
  }
  await jumpNext(ref);
}

/** Single-file view: mark the open file via ADO's real checkbox, advance. */
async function markCurrentAndNext(ref: PrRef): Promise<void> {
  const key = refKey(ref);
  const path = currentFilePath();
  if (path && !(viewedState(ref)?.has(path) ?? false)) {
    if (await clickTreeCheckbox(key, path)) {
      patchViewed(ref, path, true);
    } else {
      showToast("Couldn't reach this file's tree row");
      return;
    }
  }
  await jumpNext(ref);
}
```

- [ ] **Step 3: Append the feature object**

```ts
export const prReviewFlow: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    flowRef = ref;
    if (!ref) {
      document.documentElement.removeAttribute("data-adofix-reviewing");
      return;
    }
    const key = refKey(ref);
    let flow = readFlow(key);
    document.documentElement.toggleAttribute("data-adofix-reviewing", flow.started);

    const viewed = viewedState(ref, () => this.apply(route));
    const toolbar = findToolbar();
    if (toolbar) {
      const parsed =
        safeQueryAll<HTMLElement>("span", toolbar)
          .map((s) => parseChangedFiles(s.textContent))
          .find((v) => v !== null) ?? null;
      if (parsed !== null && parsed !== flow.total) {
        flow = { ...flow, total: parsed };
        writeFlow(key, flow);
      }
    }
    const m = flow.total ?? null;
    const n = viewed === null ? null : m === null ? viewed.size : Math.min(viewed.size, m);

    // Header button (all PR tabs).
    const vote = safeQuery<HTMLElement>(FLOW_SELECTORS.voteButton);
    if (vote?.parentElement) {
      let btn = vote.parentElement.querySelector<HTMLButtonElement>(
        `[data-adofix="${FEATURE_ID}-start"]`
      );
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "adofix-review-btn";
        btn.setAttribute("data-adofix", `${FEATURE_ID}-start`);
        btn.title = "Start reviewing — Files tab, first unreviewed file (ado-unfuck)";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (flowRef) void startReview(flowRef);
        });
        vote.parentElement.insertBefore(btn, vote);
      }
      btn.textContent = reviewButtonLabel(n, m, flow.started);
      btn.classList.toggle("adofix-done", flow.started && n !== null && m !== null && m > 0 && n >= m);
    }

    // Files-toolbar counter + mark-and-next (only while reviewing).
    const counter = toolbar?.querySelector<HTMLButtonElement>(
      `[data-adofix="${FEATURE_ID}-progress"]`
    );
    const mark = toolbar?.querySelector<HTMLButtonElement>(`[data-adofix="${FEATURE_ID}-mark"]`);
    if (!toolbar || !flow.started) {
      counter?.remove();
      mark?.remove();
      return;
    }
    let counterBtn = counter;
    if (!counterBtn) {
      counterBtn = document.createElement("button");
      counterBtn.type = "button";
      counterBtn.className = "adofix-review-progress";
      counterBtn.setAttribute("data-adofix", `${FEATURE_ID}-progress`);
      counterBtn.title = "Click to jump to the next unreviewed file (ado-unfuck)";
      counterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (flowRef) void jumpNext(flowRef);
      });
      toolbar.appendChild(counterBtn);
    }
    counterBtn.textContent = counterLabel(n, m);

    const inMonaco = safeQuery(DRAFT_SELECTORS.monacoRoot) !== null;
    if (!inMonaco) {
      mark?.remove();
      return;
    }
    if (!mark) {
      const markBtn = document.createElement("button");
      markBtn.type = "button";
      markBtn.className = "adofix-review-mark";
      markBtn.setAttribute("data-adofix", `${FEATURE_ID}-mark`);
      markBtn.textContent = "✓ Reviewed · next";
      markBtn.title = "Mark this file reviewed (ADO's own checkbox) and open the next unreviewed file (ado-unfuck)";
      markBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (flowRef) void markCurrentAndNext(flowRef);
      });
      toolbar.appendChild(markBtn);
    }
  },
};
```

- [ ] **Step 4: Register in `src/main.ts`**

```ts
import { prReviewFlow } from "./features/pr-review-flow";
```

and after `registry.register(prChecks);`:

```ts
  registry.register(prReviewFlow);
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean; test count grows by the Task 4 suite.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "pr-review-flow: GitHub-style Review flow

Claude goes brr.. via Dash"
```

---

### Task 6: README, ledger, v0.43.0

**Files:**
- Modify: `README.md` (feature table row + selector ledger)

- [ ] **Step 1: Add the feature-table row**

After the `pr-drafts` row in the README feature table:

```markdown
| `pr-review-flow` | GitHub-style review flow riding ADO's built-in per-file reviewed state. A **Review** button in the PR header (before Approve, all tabs) starts a per-PR review: lands on the Files tab and jumps to the first unreviewed file; its label tracks state (Review → "Reviewing · n/m" → "Reviewed ✓"). While reviewing, the Files toolbar shows an "n/m files reviewed" counter (click → next unreviewed; ADO's native `.pr-header-viewed-files` text is hidden meanwhile) and, in the single-file view, a "✓ Reviewed · next" action that clicks ADO's real tree checkbox for the open file and advances. Tree order and navigation come from the shared virtualized-tree index (`pr/reviewed-tree`); n comes from the shared viewed-state slot (`pr/reviewed-data`); m is parsed from the toolbar's "n changed files" text and remembered per PR. |
```

- [ ] **Step 2: Add the ledger bullet**

In the "Selector verification status" section, after the Monaco bullet:

```markdown
- **Review-flow anchors (verified live 2026-08-19)**: the header Approve
  split-button sits in `.repos-pr-header-vote-button` (our Review button
  inserts before it); `a.bolt-tab[href*="_a=files"]` SPA-navigates on
  synthetic click; ADO's own progress text is `.pr-header-viewed-files`
  in the header secondary title row and only exists at n ≥ 1; the stacked
  view scrolls inside `.repos-changes-viewer`; the changed-files total is
  a toolbar span reading "n changed files".
```

- [ ] **Step 3: Bump, verify, build**

Run: `npm pkg set version=0.43.0 && pnpm typecheck && pnpm test && pnpm build`
Expected: clean, build ok.

- [ ] **Step 4: Commit + tag**

```bash
git add -A && git -c core.hooksPath=/dev/null commit -m "pr-review-flow: GitHub-style Review flow (v0.43.0)

Review button in the PR header starts a per-PR review: Files tab, jump to
first unreviewed, label tracks Reviewing · n/m → Reviewed ✓. Files toolbar
gains the n/m counter (click = next unreviewed) and, in the single-file
view, '✓ Reviewed · next' clicking ADO's real tree checkbox. All state is
ADO's own reviewed system via the shared slot; native header progress text
hidden while our counter is on.

Firefox checklist: Review from Overview lands on Files at the first
unreviewed file; counter counts native checkbox toggles too; ✓ Reviewed ·
next marks + advances and wraps; Reviewed ✓ at n=m; native '1/40 files
reviewed' text stays hidden while reviewing; pr-reviewed header checkboxes
and drafts Show still work.

Claude goes brr.. via Dash" && git tag v0.43.0
```

---

## Self-review notes (already applied)

- Task 5's `apply` re-reads `flow` after the toolbar parse so the header
  label uses the fresh total.
- `nextUnreviewedPath` treats an unknown anchor as "start at top"
  (`indexOf` −1 + 1 = 0) — covered by a test.
- pr-drafts keeps working through the Task 3 refactor: `showDraft` guards
  `currentKey` instead of asserting.
- The counter and mark buttons are created once and re-labeled on settle;
  removal paths (`!started`, no toolbar, stacked view for mark) are explicit.
