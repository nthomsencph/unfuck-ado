import { safeQuery, safeQueryAll } from "../../core/dom";

/**
 * Shared PR comment-thread lookup. pr-keynav, pr-thread-filter and Phase 2
 * (batched drafts) all locate threads through this module — one file to
 * re-verify when ADO ships a UI update.
 *
 * Verified live 2026-08-01 against dev.azure.com (PR Files + Overview views):
 *
 * - Files view: every comment site renders one `.repos-editor-discussion-host`
 *   containing EITHER a collapsed `button.repos-editor-discussion-expand`
 *   (aria-label = comment preview / "N comments … Click to expand") OR an
 *   expanded `.repos-discussion-thread`.
 * - Overview: threads are standalone `.repos-discussion-thread` elements
 *   (inside bolt-cards, no host wrapper).
 * - Status affordance: `button[aria-label^='State button']`, aria-label
 *   "State button <Status> mode", visible text = the status. Observed
 *   statuses: Active, Resolved, Closed.
 * - Expanded threads also carry a footer action button whose exact text is
 *   "Resolve" (thread is active) or "Reactivate" (thread is resolved/closed).
 * - The reply textfield inside an expanded thread has a `threadId-<id>` class
 *   — the DOM-to-REST id bridge Phase 2 needs.
 * - DECOY: `.repos-collapsed-comment` is an aria-hidden per-line placeholder
 *   span (hundreds per diff). Never anchor on it.
 *
 * Limitation: collapsed sites expose no status in the DOM. ADO itself
 * auto-collapses resolved/closed threads, so a collapsed site is *usually*
 * resolved, but we report "unknown" rather than guess. English UI assumed for
 * the footer-text fallback.
 */
export const THREAD_SELECTORS = {
  /** Comment site in the Files diff (collapsed or expanded). Verified 2026-08-01. */
  site: ".repos-editor-discussion-host",
  /** Collapsed site's expand affordance. Verified 2026-08-01. */
  expandButton: "button.repos-editor-discussion-expand",
  /** An expanded thread (Files view: inside a site; Overview: standalone). Verified 2026-08-01. */
  thread: ".repos-discussion-thread",
  /** The status dropdown button inside an expanded thread. Verified 2026-08-01. */
  stateButton: "button[aria-label^='State button']",
  /** Element whose class list carries threadId-<id> (the reply input). Verified 2026-08-01. */
  threadIdCarrier: "[class*='threadId-']",
};

export type ThreadStatus = "active" | "resolved" | "unknown";

// \b keeps "unresolved" from matching "resolved", and "Resolve" (the action
// button) from matching "Resolved" (the status). "Closed" and "Won't fix"
// count as resolved for our purposes (filtering / skip-in-nav).
const RESOLVED_RE = /\b(resolved|closed|won'?t\s+fix)\b/i;
const ACTIVE_RE = /\b(active|pending)\b/i;

export function classifyStatusText(text: string | null | undefined): ThreadStatus {
  const t = (text ?? "").trim();
  if (!t) return "unknown";
  if (RESOLVED_RE.test(t)) return "resolved";
  if (ACTIVE_RE.test(t)) return "active";
  return "unknown";
}

/**
 * Comment-thread elements in document order: site hosts in the Files view
 * (collapsed or expanded) plus standalone threads (Overview). Nested
 * duplicates (a thread inside a host) collapse to the outer element.
 */
export function getThreadElements(root: ParentNode = document): HTMLElement[] {
  const els = safeQueryAll<HTMLElement>(
    `${THREAD_SELECTORS.site}, ${THREAD_SELECTORS.thread}`,
    root
  );
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
}

export function isThreadExpanded(el: HTMLElement): boolean {
  return el.matches(THREAD_SELECTORS.thread) || !!safeQuery(THREAD_SELECTORS.thread, el);
}

export function getThreadStatus(el: HTMLElement): ThreadStatus {
  const stateBtn = safeQuery<HTMLElement>(THREAD_SELECTORS.stateButton, el);
  if (stateBtn) {
    const byAria = classifyStatusText(stateBtn.getAttribute("aria-label"));
    if (byAria !== "unknown") return byAria;
    const byText = classifyStatusText(stateBtn.textContent);
    if (byText !== "unknown") return byText;
  }
  // Footer-action fallback: exact text match so "Resolve" never fires on
  // e.g. comment bodies mentioning the word.
  for (const btn of safeQueryAll<HTMLElement>("button", el)) {
    const t = btn.textContent?.trim();
    if (t === "Reactivate") return "resolved";
    if (t === "Resolve") return "active";
  }
  return "unknown"; // collapsed sites carry no status in the DOM
}

