import type { Feature } from "../core/registry";
import { injectStyleOnce, safeQuery, safeQueryAll } from "../core/dom";
import { octicon } from "../core/primer/icons";
import { getValue, setValue } from "../core/storage";
import { getThreadElements, getThreadStatus, isThreadExpanded } from "./pr/threads";

const FEATURE_ID = "pr-thread-filter";
const HIDDEN_ATTR = "data-adofix-hidden";
const REVEALED_ATTR = "data-adofix-revealed";

const FILTER_CSS = `
[${HIDDEN_ATTR}="${FEATURE_ID}"] > :not(.adofix-thread-marker) { display: none !important; }
/* A secondary gh-Label carrying the comment-discussion octicon. */
.adofix-thread-marker {
  gap: 4px;
  font-family: inherit;
  cursor: pointer;
}
.adofix-thread-marker:hover {
  color: var(--fgColor-default);
  background-color: var(--control-transparent-bgColor-hover);
}
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
  font-size: var(--text-body-size-medium);
  justify-content: flex-start;
}
.bolt-timeline-cell .adofix-thread-marker::after {
  content: "Resolved comment thread — click to show";
  font-size: var(--text-body-size-medium);
  font-weight: var(--base-text-weight-normal);
  color: var(--fgColor-muted);
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
  marker.className = "adofix-thread-marker gh-Label gh-Label--secondary";
  marker.setAttribute("data-adofix", FEATURE_ID);
  marker.appendChild(octicon("comment-discussion"));
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
