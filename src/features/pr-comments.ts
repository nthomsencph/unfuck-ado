import type { Feature } from "../core/registry";
import { ACCENT, injectStyleOnce, safeQuery } from "../core/dom";
import { findToolbar, TOOLBAR_BUTTON_CLASSES } from "./pr/toolbar";
import { hideResolvedEnabled, setHideResolved } from "./pr-thread-filter";
import { draftsCount, toggleDraftsPanel } from "./pr-drafts";

/**
 * One comments control for the Files toolbar (user request 2026-08-02),
 * replacing four scattered pieces:
 * - the header's "n/m comments resolved" text (hidden by chrome.css; its
 *   count lives on this button),
 * - ADO's native Filter button (collapsed to an invisible stub by
 *   chrome.css; proxied from this menu — the callout anchors to the stub),
 * - pr-thread-filter's "Hide resolved" toolbar toggle,
 * - pr-drafts' "Drafts · N" toolbar button.
 */
const FEATURE_ID = "pr-comments";

/** The header count element chrome.css hides — still readable. Verified live 2026-08-02. */
const RESOLVED_TEXT_SELECTOR = ".pr-header-resolved-comments";
/** The collapsed native Filter stub whose click opens ADO's filter callout. */
const NATIVE_FILTER_SELECTOR = ".repos-compare-filter";

const CSS = `
/* Filled-accent toolbar button (inherited from the retired standalone toggles). */
.adofix-toggle {
  background: ${ACCENT} !important; color: #fff !important;
  margin-left: 8px; border-radius: 2px;
}
.adofix-toggle:hover { background: #9161ea !important; }
.adofix-toggle[aria-pressed="true"] { background: #6b40ba !important; }
.repos-compare-toolbar > .adofix-toggle:last-child { margin-right: 12px; }

/* Surface material comes from .adofix-surface (core BASE_CSS). */
.adofix-comments-menu {
  position: fixed; width: 260px; z-index: 99999; overflow: hidden;
  font-size: 13px;
  padding: 4px 0;
}
.adofix-comments-status {
  padding: 8px 14px 6px; font-size: 12px;
  color: var(--text-secondary-color, rgba(0, 0, 0, 0.6));
}
.adofix-comments-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 14px; border: none; background: transparent; cursor: pointer;
  font: inherit; color: inherit; text-align: left;
}
.adofix-comments-item:hover { background: var(--palette-black-alpha-4, rgba(0, 0, 0, 0.05)); }
.adofix-comments-item[disabled] {
  cursor: default; color: var(--text-secondary-color, rgba(0, 0, 0, 0.5));
}
.adofix-comments-item[disabled]:hover { background: transparent; }
.adofix-comments-check {
  width: 14px; text-align: center; flex-shrink: 0;
  color: var(--adofix-ink);
  font-weight: 700;
}
.adofix-comments-count {
  margin-left: auto; font-size: 11px; font-weight: 700;
  background: rgba(130, 80, 223, 0.22);
  color: var(--adofix-ink);
  padding: 1px 8px; border-radius: 10px;
}
.adofix-comments-divider {
  height: 1px; margin: 4px 0;
  background: var(--border-subtle-color, rgba(0, 0, 0, 0.08));
}
`;

/** "0/2 comments resolved" → { resolved: 0, total: 2 }; anything else → null. */
export function parseResolvedText(text: string | null | undefined): {
  resolved: number;
  total: number;
} | null {
  const match = /^\s*(\d+)\/(\d+)\s+comments resolved/.exec(text ?? "");
  return match ? { resolved: Number(match[1]), total: Number(match[2]) } : null;
}

function resolvedCounts(): { resolved: number; total: number } | null {
  return parseResolvedText(safeQuery<HTMLElement>(RESOLVED_TEXT_SELECTOR)?.textContent);
}

function buttonLabel(): string {
  const counts = resolvedCounts();
  return counts ? `💬 ${counts.resolved}/${counts.total}` : "💬";
}

function closeMenu(): void {
  safeQuery(`[data-adofix="${FEATURE_ID}-menu"]`)?.remove();
  document.removeEventListener("mousedown", onOutsideMouseDown, true);
  document.removeEventListener("keydown", onMenuKeyDown, true);
}

function onOutsideMouseDown(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(`[data-adofix="${FEATURE_ID}-menu"], [data-adofix="${FEATURE_ID}-toggle"]`))
    return;
  closeMenu();
}

function onMenuKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") closeMenu();
}

function menuItem(
  label: string,
  opts: { checked?: boolean; count?: number; disabled?: boolean },
  onClick?: () => void
): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "adofix-comments-item";
  const check = document.createElement("span");
  check.className = "adofix-comments-check";
  check.textContent = opts.checked ? "✓" : "";
  item.append(check, label);
  if (opts.count !== undefined) {
    const pill = document.createElement("span");
    pill.className = "adofix-comments-count";
    pill.textContent = String(opts.count);
    item.appendChild(pill);
  }
  if (opts.disabled) item.disabled = true;
  if (onClick && !opts.disabled) {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return item;
}

function openMenu(anchor: HTMLElement): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.setAttribute("data-adofix", `${FEATURE_ID}-menu`);
  menu.className = "adofix-comments-menu adofix-surface";

  const counts = resolvedCounts();
  const status = document.createElement("div");
  status.className = "adofix-comments-status";
  status.textContent = counts
    ? `${counts.resolved} of ${counts.total} comment${counts.total === 1 ? "" : "s"} resolved`
    : "No comments yet";
  menu.appendChild(status);

  menu.appendChild(
    menuItem("Hide resolved threads", { checked: hideResolvedEnabled() }, () => {
      setHideResolved(!hideResolvedEnabled());
      openMenu(anchor); // re-render in place, keeping the menu open
    })
  );

  const drafts = draftsCount();
  menu.appendChild(
    drafts > 0
      ? menuItem("Drafts", { count: drafts }, () => {
          closeMenu();
          toggleDraftsPanel();
        })
      : menuItem("No local drafts", { disabled: true })
  );

  const divider = document.createElement("div");
  divider.className = "adofix-comments-divider";
  menu.appendChild(divider);

  menu.appendChild(
    menuItem("Advanced filters…", {}, () => {
      closeMenu();
      const stub = safeQuery<HTMLElement>(NATIVE_FILTER_SELECTOR);
      const trigger = stub?.querySelector<HTMLElement>('button, [role="button"]') ?? stub;
      trigger?.click();
    })
  );

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  document.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("keydown", onMenuKeyDown, true);
}

export const prComments: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const toolbar = findToolbar();
    if (!toolbar) return;
    let btn = toolbar.querySelector<HTMLButtonElement>(`[data-adofix="${FEATURE_ID}-toggle"]`);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-adofix", `${FEATURE_ID}-toggle`);
      btn.className = `${TOOLBAR_BUTTON_CLASSES} adofix-toggle`;
      btn.title = "Comments — resolved count, filters and drafts (ado-unfuck)";
      const ownBtn = btn;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (safeQuery(`[data-adofix="${FEATURE_ID}-menu"]`)) closeMenu();
        else openMenu(ownBtn);
      });
      toolbar.appendChild(btn);
    }
    btn.textContent = buttonLabel();
  },
};
