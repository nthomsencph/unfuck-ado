import type { Feature } from "../core/registry";
import { injectStyleOnce, safeQuery, safeQueryAll, showToast } from "../core/dom";
import { getThreadElements, getThreadStatus } from "./pr/threads";
import { log } from "../core/log";

export const KEYNAV_SELECTORS = {
  /**
   * One section per changed file in the PR Files diff (header + diff body,
   * so scrolling to its start is scrolling to the file header). The list is
   * virtualized: only files near the viewport are in the DOM.
   * Verified live 2026-08-01.
   */
  fileHeader: ".repos-summary-header",
  /**
   * The file-tree pane in the Files view (the fixed pane of the explorer
   * splitter). Verified live 2026-08-01.
   */
  treePane: ".repos-changes-explorer-splitter .vss-Splitter--pane-fixed",
  /**
   * Present only when the Files tab is active. A PR opens on Overview, where
   * file navigation has nothing to work with — used to give a useful message
   * instead of "no changed files found". Verified live 2026-08-01.
   */
  filesView: ".repos-changes-viewer",
};

/** Sticky toolbars cover the top of the viewport; treat this line as "current". */
const REF_OFFSET_PX = 96;
const EPSILON_PX = 8;
const FOCUS_ATTR = "data-adofix-focus";

const KEYNAV_CSS = `
[${FOCUS_ATTR}] {
  outline: 2px solid #0078d4 !important;
  outline-offset: 2px;
  scroll-margin-top: ${REF_OFFSET_PX}px;
}
`;

/**
 * Given element tops relative to the reference line, pick the next (dir=1) or
 * previous (dir=-1) index, clamping at the ends. Pure — unit tested.
 */
export function pickNextIndex(tops: number[], dir: 1 | -1): number | null {
  if (tops.length === 0) return null;
  if (dir === 1) {
    for (let i = 0; i < tops.length; i++) {
      if (tops[i]! > EPSILON_PX) return i;
    }
    return tops.length - 1;
  }
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i]! < -EPSILON_PX) return i;
  }
  return 0;
}

function jump(elements: HTMLElement[], dir: 1 | -1, emptyMessage: string): void {
  if (elements.length === 0) {
    showToast(`adofix: ${emptyMessage}`);
    return;
  }
  const tops = elements.map((el) => el.getBoundingClientRect().top - REF_OFFSET_PX);
  const index = pickNextIndex(tops, dir);
  if (index === null) return;
  const el = elements[index]!;

  for (const prev of safeQueryAll(`[${FOCUS_ATTR}]`)) prev.removeAttribute(FOCUS_ATTR);
  el.setAttribute(FOCUS_ATTR, "");
  el.scrollIntoView({ block: "start", behavior: "smooth" });
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  setTimeout(() => el.removeAttribute(FOCUS_ATTR), 1500);
}

function fileHeaders(): HTMLElement[] {
  return safeQueryAll<HTMLElement>(KEYNAV_SELECTORS.fileHeader);
}

/** File/tree actions only make sense on the Files tab; say so instead of "not found". */
function requireFilesView(): boolean {
  if (safeQuery(KEYNAV_SELECTORS.filesView)) return true;
  showToast("adofix: open the PR's Files tab first");
  return false;
}

function toggleTree(): void {
  if (!requireFilesView()) return;
  const pane = safeQuery<HTMLElement>(KEYNAV_SELECTORS.treePane);
  if (!pane) {
    log("pr-keynav", "tree pane not found (selector rot?)");
    showToast("adofix: file tree not found");
    return;
  }
  pane.style.display = pane.style.display === "none" ? "" : "none";
}

export const prKeynav: Feature = {
  id: "pr-keynav",
  areas: ["repos-pr"],
  init(ctx): void {
    ctx.hotkey("next-file", "j", "Next changed file", () => {
      if (requireFilesView()) jump(fileHeaders(), 1, "no changed files found");
    });
    ctx.hotkey("prev-file", "k", "Previous changed file", () => {
      if (requireFilesView()) jump(fileHeaders(), -1, "no changed files found");
    });
    ctx.hotkey("next-thread", "n", "Next comment thread", () =>
      jump(getThreadElements(), 1, "no comment threads found")
    );
    ctx.hotkey("prev-thread", "p", "Previous comment thread", () =>
      jump(getThreadElements(), -1, "no comment threads found")
    );
    // Collapsed sites report "unknown" status; ADO auto-collapses
    // resolved/closed threads, so unknown is skipped rather than guessed.
    ctx.hotkey("next-unresolved", "u", "Next unresolved comment thread", () =>
      jump(
        getThreadElements().filter((t) => getThreadStatus(t) === "active"),
        1,
        "no unresolved threads found"
      )
    );
    ctx.hotkey("toggle-tree", "t", "Toggle the file tree pane", toggleTree);
  },
  apply(): void {
    injectStyleOnce("pr-keynav", KEYNAV_CSS);
  },
};
