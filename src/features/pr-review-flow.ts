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
    const inMonaco = safeQuery(DIFF_SELECTORS.monacoRoot) !== null;
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
  if (!safeQuery(DIFF_SELECTORS.filesView)) {
    safeQuery<HTMLElement>(FLOW_SELECTORS.filesTab)?.click();
    await waitFor(() => safeQuery(DIFF_SELECTORS.filesView));
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
    // Folder/root checkbox sweeps mark many files server-side without going
    // through our toggles — when a rendered tree row disagrees with the
    // slot, resync (rate-limited; the in-flight guard dedupes fetches).
    if (viewed && performance.now() - lastResync > 3000) {
      for (const [path, entry] of mapTreeFiles()) {
        if (entry.reviewed !== viewed.has(path)) {
          lastResync = performance.now();
          resyncViewed(ref, () => this.apply(route));
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
      // While the toolbar counter is visible it owns the n/m readout — the
      // button compresses so the message isn't repeated (user, 2026-08-19).
      const counterVisible = toolbar !== null && flow.started;
      const done = n !== null && m !== null && m > 0 && n >= m;
      const label = counterVisible
        ? done
          ? "Reviewed ✓"
          : "Reviewing"
        : reviewButtonLabel(n, m, flow.started);
      if (btn.textContent !== label) btn.textContent = label;
      btn.classList.toggle("adofix-done", flow.started && done);
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
    const counterText = counterLabel(n, m);
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
