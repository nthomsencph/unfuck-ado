import type { Feature } from "../core/registry";
import { ACCENT, injectStyleOnce, safeQuery, safeQueryAll } from "../core/dom";
import { getValue, setValue } from "../core/storage";
import { getThreadElements, getThreadStatus, isThreadExpanded } from "./pr/threads";

const FEATURE_ID = "pr-thread-filter";
const HIDDEN_ATTR = "data-adofix-hidden";
const REVEALED_ATTR = "data-adofix-revealed";

const FILTER_CSS = `
[${HIDDEN_ATTR}="${FEATURE_ID}"] > :not(.adofix-thread-marker) { display: none !important; }
.adofix-thread-marker {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  line-height: 1;
  color: ${ACCENT};
  border: 1px solid rgba(130, 80, 223, 0.4);
  border-radius: 10px;
  padding: 0 8px;
  height: 18px;
  background: transparent;
  cursor: pointer;
}
.adofix-thread-marker:hover { background: rgba(130, 80, 223, 0.08); }
/*
 * Overview feed variant: there the thread sits in a timeline card, and the
 * compact chip collapsed the card to a sliver, misaligned with the rail's
 * bubble icon. Full-width labeled row instead; 58px centers the content on
 * the rail icon, which anchors ~29px below the card top (measured live
 * 2026-08-17). The diff-view chips above stay compact on purpose.
 */
.bolt-timeline-cell .adofix-thread-marker {
  display: flex;
  width: 100%;
  height: 58px;
  padding: 0 16px;
  border: none;
  border-radius: inherit;
  gap: 10px;
  font-size: 14px;
  justify-content: flex-start;
}
.bolt-timeline-cell .adofix-thread-marker::after {
  content: "Resolved comment thread — click to show";
  font-size: 13px;
  color: var(--text-secondary-color, #a19f9d);
}
`;

/**
 * The on/off state and its persistence live here; the toolbar UI moved into
 * the pr-comments widget (2026-08-02), which drives it via these exports.
 */
export function hideResolvedEnabled(): boolean {
  return getValue(FEATURE_ID, "hideResolved", false);
}

export function setHideResolved(on: boolean): void {
  setValue(FEATURE_ID, "hideResolved", on);
  applyFilter();
}

/**
 * A thread is "settled" and gets hidden when the filter is on:
 * - confirmed resolved/closed status (the classifier folds Closed and
 *   Won't fix into "resolved"), or
 * - a collapsed site with unknown status — ADO itself auto-collapses
 *   settled threads, so a collapsed site is treated as settled.
 * A site the user revealed via its marker stays visible until the toggle
 * cycles off and on again.
 */
export function shouldHide(el: HTMLElement): boolean {
  if (el.hasAttribute(REVEALED_ATTR)) return false;
  const status = getThreadStatus(el);
  if (status === "resolved") return true;
  return status === "unknown" && !isThreadExpanded(el);
}

function markerIn(el: HTMLElement): HTMLElement | null {
  return safeQuery<HTMLElement>(":scope > .adofix-thread-marker", el);
}

/** Hide the thread's content but keep a small chip so the spot stays visible. */
function hideThread(el: HTMLElement): void {
  el.setAttribute(HIDDEN_ATTR, FEATURE_ID);
  if (markerIn(el)) return;
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = "adofix-thread-marker";
  marker.setAttribute("data-adofix", FEATURE_ID);
  marker.textContent = "💬";
  marker.title = "Hidden resolved thread — click to show (ado-unfuck)";
  marker.addEventListener("click", (e) => {
    e.stopPropagation();
    el.setAttribute(REVEALED_ATTR, "");
    el.removeAttribute(HIDDEN_ATTR);
    marker.remove();
  });
  el.appendChild(marker);
}

function unhideThread(el: HTMLElement): void {
  if (el.getAttribute(HIDDEN_ATTR) === FEATURE_ID) el.removeAttribute(HIDDEN_ATTR);
  markerIn(el)?.remove();
}

/**
 * Threads render lazily as the diff scrolls, so this runs on every DOM settle
 * (via apply) — it must stay cheap and idempotent.
 */
function applyFilter(): void {
  const on = hideResolvedEnabled();
  for (const thread of getThreadElements()) {
    if (on && shouldHide(thread)) hideThread(thread);
    else unhideThread(thread);
  }
  if (!on) {
    for (const el of safeQueryAll(`[${REVEALED_ATTR}]`)) el.removeAttribute(REVEALED_ATTR);
  }
}

export const prThreadFilter: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce(FEATURE_ID, FILTER_CSS);
    applyFilter();
  },
};
