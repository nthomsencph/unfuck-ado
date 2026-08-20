import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import {
  ACCENT,
  flashOutline,
  injectStyleOnce,
  safeQuery,
  safeQueryAll,
  showToast,
} from "../core/dom";
import { log } from "../core/log";
import { waitFor } from "../core/observe";
import { getValue, setValue } from "../core/storage";
import { currentFilePath, DIFF_SELECTORS, sectionFilePath } from "./pr/diff";
import { prRefFromRoute, refKey, type PrRef } from "./pr/threads-api";
import { patchViewed, resyncViewed, viewedState } from "./pr/reviewed-data";
import {
  clickTreeCheckbox,
  clickTreeFileRow,
  mapTreeFiles,
  orderedFilePaths,
} from "./pr/reviewed-tree";
import { fetchChangedSince, fetchCurrentUserId, fetchReviewSnapshot, myVote, voteLabel } from "./pr/reviewer-api";
import { findToolbar } from "./pr/toolbar";

const FEATURE_ID = "pr-review-flow";

/** All verified live 2026-08-19 (see docs/INTERNALS.md ledger). */
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
.adofix-review-btn, .adofix-review-progress, .adofix-review-mark {
  --adofix-ink: color-mix(in srgb, ${ACCENT} 62%, var(--text-primary-color, #201f1e));
}
.adofix-review-btn {
  background: ${ACCENT}; color: #fff; border: none; border-radius: 2px;
  font-weight: 600; font-size: 13px; padding: 0 14px; margin-right: 8px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  /* Match the Approve split-button (32px, measured live 2026-08-19). */
  height: 32px; box-sizing: border-box; align-self: center;
}
.adofix-review-btn:hover { background: #9161ea; }
/* Quiet permutation: review done, or a vote already cast. */
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

/* Our counter replaces ADO's native header progress while a review is on. */
html[data-adofix-reviewing] ${FLOW_SELECTORS.nativeProgress} { display: none !important; }
`;

interface FlowState {
  started: boolean;
  /** Remembered from the Files toolbar so the header label works on all tabs. */
  total?: number;
  /** Last vote seen for the user; a change re-baselines votedIteration. */
  seenVote?: number;
  /** The latest iteration at the time the current vote was cast/seen. */
  votedIteration?: number;
  /** Active re-review of changes since `base`; `done` = re-reviewed paths. */
  rereview?: { base: number; done: string[] };
}

function readFlow(key: string): FlowState {
  return getValue<FlowState>(FEATURE_ID, key, { started: false });
}

function writeFlow(key: string, state: FlowState): void {
  setValue(FEATURE_ID, key, state);
}

let flowRef: PrRef | null = null;
let jumpBusy = false;
let lastResync = 0;
let reapply: () => void = () => {};

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

// ---- reviewer snapshot (identity, vote, latest iteration) -------------------
//
// Live-ish like the viewed slot: refetched on settle at most every 30s, and
// force-refreshed shortly after the native vote button is used. Group/team
// reviewer entries (isContainer) never match — a member who hasn't voted
// individually sees no Review button (known limit, see pr/reviewer-api.ts).

interface Snapshot {
  key: string;
  myVote: number | null;
  latestIteration: number;
}

let snapshot: Snapshot | null = null;
let snapshotFetching = false;
let lastSnapshotFetch = 0;
const SNAPSHOT_MIN_INTERVAL = 30_000;

function refreshSnapshot(ref: PrRef, force = false): void {
  const key = refKey(ref);
  const stale = snapshot === null || snapshot.key !== key;
  if (snapshotFetching) return;
  if (!stale && !force && performance.now() - lastSnapshotFetch < SNAPSHOT_MIN_INTERVAL) return;
  snapshotFetching = true;
  lastSnapshotFetch = performance.now();
  void (async () => {
    const [userId, snap] = await Promise.all([
      fetchCurrentUserId(ref.org),
      fetchReviewSnapshot(ref),
    ]);
    snapshotFetching = false;
    if (!snap.ok) {
      log(FEATURE_ID, "review snapshot fetch failed", snap.error);
      return;
    }
    snapshot = {
      key,
      myVote: myVote(snap.value.reviewers, userId),
      latestIteration: snap.value.latestIteration,
    };
    reapply();
  })();
}

// changed-since sets, keyed per PR + iteration span; fetched lazily.
const changedSinceCache = new Map<string, Set<string>>();
const changedSinceInFlight = new Set<string>();

async function changedSinceSet(
  ref: PrRef,
  base: number,
  latest: number
): Promise<Set<string> | null> {
  const cacheKey = `${refKey(ref)}@${base}@${latest}`;
  const hit = changedSinceCache.get(cacheKey);
  if (hit) return hit;
  const res = await fetchChangedSince(ref, base, latest);
  if (!res.ok) {
    log(FEATURE_ID, "changed-since fetch failed", res.error);
    return null;
  }
  changedSinceCache.set(cacheKey, res.value);
  return res.value;
}

/** Non-blocking cache peek for apply(); kicks the fetch and re-applies. */
function peekChangedSince(ref: PrRef, base: number, latest: number): Set<string> | null {
  const cacheKey = `${refKey(ref)}@${base}@${latest}`;
  const hit = changedSinceCache.get(cacheKey);
  if (hit) return hit;
  if (!changedSinceInFlight.has(cacheKey)) {
    changedSinceInFlight.add(cacheKey);
    void changedSinceSet(ref, base, latest).then((set) => {
      changedSinceInFlight.delete(cacheKey);
      if (set) reapply();
    });
  }
  return null;
}

// ---- navigation --------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stacked view: scroll (from the top) until path's section renders. */
async function jumpStacked(path: string): Promise<boolean> {
  const scroller = safeQuery<HTMLElement>(FLOW_SELECTORS.stackedScroller);
  if (!scroller) return false;
  const findSection = (): HTMLElement | null =>
    safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection).find(
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

/**
 * The active review queue: during a re-review it is the files changed since
 * the vote (tree-ordered) minus the ones already re-checked; otherwise all
 * files minus the server-viewed set.
 */
async function reviewPlan(
  ref: PrRef
): Promise<{ order: string[]; done: ReadonlySet<string> } | null> {
  const key = refKey(ref);
  const order = await orderedFilePaths(key);
  if (!order) return null;
  const flow = readFlow(key);
  const snap = snapshot?.key === key ? snapshot : null;
  if (flow.rereview && snap) {
    const changed = await changedSinceSet(ref, flow.rereview.base, snap.latestIteration);
    if (changed) {
      const done = new Set(flow.rereview.done);
      return { order: order.filter((p) => changed.has(p)), done };
    }
  }
  return { order, done: viewedState(ref) ?? new Set<string>() };
}

/** The re-review queue is empty — the vote now covers the latest iteration. */
function completeRereview(ref: PrRef): void {
  const key = refKey(ref);
  const flow = readFlow(key);
  if (!flow.rereview) return;
  const next: FlowState = { started: flow.started };
  if (flow.total !== undefined) next.total = flow.total;
  if (flow.seenVote !== undefined) next.seenVote = flow.seenVote;
  next.votedIteration = snapshot?.key === key ? snapshot.latestIteration : flow.rereview.base;
  writeFlow(key, next);
  showToast("Caught up — all new changes re-reviewed ✓");
  reapply();
}

/** Jump to the next file in the active queue (single-file view: tree click;
 * stacked: section scroll with tree click as fallback). */
async function jumpNext(ref: PrRef): Promise<void> {
  if (jumpBusy) return;
  jumpBusy = true;
  try {
    const key = refKey(ref);
    const plan = await reviewPlan(ref);
    if (!plan) {
      showToast("Couldn't index the file tree");
      return;
    }
    const inMonaco = safeQuery(DIFF_SELECTORS.monacoRoot) !== null;
    const target = nextUnreviewedPath(plan.order, plan.done, inMonaco ? currentFilePath() : null);
    if (!target) {
      if (readFlow(key).rereview) completeRereview(ref);
      else showToast("All files reviewed 🎉");
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
  if (!safeQuery(DIFF_SELECTORS.filesView)) {
    safeQuery<HTMLElement>(FLOW_SELECTORS.filesTab)?.click();
    await waitFor(() => safeQuery(DIFF_SELECTORS.filesView));
  }
  await jumpNext(ref);
}

/** "Re-review · k new": queue up the files changed since the vote. */
async function beginRereview(ref: PrRef): Promise<void> {
  const key = refKey(ref);
  const flow = readFlow(key);
  if (flow.votedIteration === undefined) return;
  writeFlow(key, {
    ...flow,
    started: true,
    rereview: { base: flow.votedIteration, done: [] },
  });
  document.documentElement.setAttribute("data-adofix-reviewing", "");
  if (!safeQuery(DIFF_SELECTORS.filesView)) {
    safeQuery<HTMLElement>(FLOW_SELECTORS.filesTab)?.click();
    await waitFor(() => safeQuery(DIFF_SELECTORS.filesView));
  }
  await jumpNext(ref);
}

/** Single-file view: mark the open file (queue-aware), then advance. */
async function markCurrentAndNext(ref: PrRef): Promise<void> {
  const key = refKey(ref);
  const path = currentFilePath();
  const flow = readFlow(key);
  if (path && flow.rereview) {
    if (!flow.rereview.done.includes(path)) {
      writeFlow(key, {
        ...flow,
        rereview: { ...flow.rereview, done: [...flow.rereview.done, path] },
      });
    }
    // Keep the server-viewed state in step, but never UNcheck an already-
    // viewed file (the tree checkbox is a toggle).
    if (!(viewedState(ref)?.has(path) ?? false)) {
      if (await clickTreeCheckbox(key, path)) patchViewed(ref, path, true);
    }
    await jumpNext(ref);
    return;
  }
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

// ---- feature -----------------------------------------------------------------

function removeFlowUi(): void {
  safeQuery(`[data-adofix="${FEATURE_ID}-start"]`)?.remove();
  safeQuery(`[data-adofix="${FEATURE_ID}-progress"]`)?.remove();
  safeQuery(`[data-adofix="${FEATURE_ID}-mark"]`)?.remove();
}

export const prReviewFlow: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  init(): void {
    // The native vote UI changes the user's vote without touching our code;
    // pick the new vote up shortly after any interaction with it.
    document.addEventListener(
      "click",
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (!e.target.closest(FLOW_SELECTORS.voteButton)) return;
        setTimeout(() => {
          if (flowRef) refreshSnapshot(flowRef, true);
        }, 2500);
      },
      true
    );
  },
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    flowRef = ref;
    reapply = () => this.apply(route);
    if (!ref) {
      document.documentElement.removeAttribute("data-adofix-reviewing");
      return;
    }
    const key = refKey(ref);
    refreshSnapshot(ref);
    const snap = snapshot?.key === key ? snapshot : null;
    // Reviewer-gated: no button (or counter) until the snapshot proves the
    // user is an assigned reviewer.
    if (!snap || snap.myVote === null) {
      if (snap) document.documentElement.removeAttribute("data-adofix-reviewing");
      removeFlowUi();
      return;
    }
    const vote = snap.myVote;

    let flow = readFlow(key);
    // A vote change re-baselines: the new vote covers the latest iteration.
    if (flow.seenVote !== vote) {
      const next: FlowState = { started: flow.started, seenVote: vote };
      if (flow.total !== undefined) next.total = flow.total;
      if (vote !== 0) next.votedIteration = snap.latestIteration;
      flow = next;
      writeFlow(key, flow);
    }
    document.documentElement.toggleAttribute("data-adofix-reviewing", flow.started);

    const viewed = viewedState(ref, reapply);
    // Folder/root checkbox sweeps mark many files server-side without going
    // through our toggles — when a rendered tree row disagrees with the
    // slot, resync (rate-limited; the in-flight guard dedupes fetches).
    if (viewed && performance.now() - lastResync > 3000) {
      for (const [path, entry] of mapTreeFiles()) {
        if (entry.reviewed !== viewed.has(path)) {
          lastResync = performance.now();
          resyncViewed(ref, reapply);
          break;
        }
      }
    }
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

    // New changes since the vote? (Only meaningful with a cast vote.)
    const newSince =
      vote !== 0 && flow.votedIteration !== undefined && snap.latestIteration > flow.votedIteration
        ? peekChangedSince(ref, flow.votedIteration, snap.latestIteration)
        : null;
    const rereviewQueue =
      flow.rereview !== undefined
        ? peekChangedSince(ref, flow.rereview.base, snap.latestIteration)
        : null;
    const rereviewDone = flow.rereview
      ? Math.min(flow.rereview.done.length, rereviewQueue?.size ?? flow.rereview.done.length)
      : 0;

    // Header button (all PR tabs).
    const voteHost = safeQuery<HTMLElement>(FLOW_SELECTORS.voteButton);
    if (voteHost?.parentElement) {
      let btn = voteHost.parentElement.querySelector<HTMLButtonElement>(
        `[data-adofix="${FEATURE_ID}-start"]`
      );
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "adofix-review-btn";
        btn.setAttribute("data-adofix", `${FEATURE_ID}-start`);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!flowRef) return;
          const action = (e.currentTarget as HTMLElement).dataset["action"];
          if (action === "rereview") void beginRereview(flowRef);
          else void startReview(flowRef);
        });
        voteHost.parentElement.insertBefore(btn, voteHost);
      }
      // While the toolbar counter is visible it owns the numeric readout —
      // the button compresses so the message isn't repeated.
      const counterVisible = toolbar !== null && flow.started;
      const reviewDone = n !== null && m !== null && m > 0 && n >= m;
      let label: string;
      let quiet = false;
      let action = "review";
      let title = "Start reviewing — Files tab, first unreviewed file (ado-unfuck)";
      if (flow.rereview) {
        label = counterVisible
          ? "Re-reviewing"
          : `Re-reviewing · ${rereviewDone}/${rereviewQueue?.size ?? "…"}`;
        action = "review"; // click just re-enters the queue
        title = "Reviewing the files changed since your vote (ado-unfuck)";
      } else if (newSince && newSince.size > 0) {
        label = `Re-review · ${newSince.size} new`;
        action = "rereview";
        title = `${newSince.size} file${newSince.size === 1 ? "" : "s"} changed since your vote — review just those (ado-unfuck)`;
      } else if (vote !== 0) {
        label = voteLabel(vote) ?? "Reviewed ✓";
        quiet = true;
        title = "Your vote is current — click to browse the files anyway (ado-unfuck)";
      } else {
        label = counterVisible
          ? reviewDone
            ? "Reviewed ✓"
            : "Reviewing"
          : reviewButtonLabel(n, m, flow.started);
        quiet = flow.started && reviewDone;
      }
      if (btn.textContent !== label) btn.textContent = label;
      if (btn.title !== title) btn.title = title;
      btn.dataset["action"] = action;
      btn.classList.toggle("adofix-done", quiet);
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
    const counterText = flow.rereview
      ? `${rereviewDone}/${rereviewQueue?.size ?? "…"} re-reviewed`
      : counterLabel(n, m);
    if (counterBtn.textContent !== counterText) counterBtn.textContent = counterText;

    const inMonaco = safeQuery(DIFF_SELECTORS.monacoRoot) !== null;
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
      markBtn.title =
        "Mark this file reviewed (ADO's own checkbox) and open the next unreviewed file (ado-unfuck)";
      markBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (flowRef) void markCurrentAndNext(flowRef);
      });
      toolbar.appendChild(markBtn);
    }
  },
};
