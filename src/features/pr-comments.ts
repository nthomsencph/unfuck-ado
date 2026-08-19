import type { Feature } from "../core/registry";
import { ACCENT, injectStyleOnce, safeQuery } from "../core/dom";
import {
  closePopover,
  isPopoverOpen,
  menuDivider,
  menuItem,
  menuStatus,
  openPopover,
} from "../core/popover";
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

/* Menu material + items come from core's .adofix-surface / .adofix-menu-*. */
.adofix-comments-menu { width: 260px; overflow: hidden; }
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

function openMenu(anchor: HTMLElement): void {
  openPopover({
    id: `${FEATURE_ID}-menu`,
    anchor,
    className: "adofix-comments-menu",
    keepOpenWithin: `[data-adofix="${FEATURE_ID}-toggle"]`,
    render(menu, ctx): void {
      const counts = resolvedCounts();
      menu.appendChild(
        menuStatus(
          counts
            ? `${counts.resolved} of ${counts.total} comment${counts.total === 1 ? "" : "s"} resolved`
            : "No comments yet"
        )
      );

      menu.appendChild(
        menuItem("Hide resolved threads", { checked: hideResolvedEnabled() }, () => {
          setHideResolved(!hideResolvedEnabled());
          ctx.rerender();
        })
      );

      const drafts = draftsCount();
      menu.appendChild(
        drafts > 0
          ? menuItem("Drafts", { count: drafts }, () => {
              ctx.close();
              toggleDraftsPanel();
            })
          : menuItem("No local drafts", { disabled: true })
      );

      menu.appendChild(menuDivider());

      menu.appendChild(
        menuItem("Advanced filters…", {}, () => {
          ctx.close();
          const stub = safeQuery<HTMLElement>(NATIVE_FILTER_SELECTOR);
          const trigger = stub?.querySelector<HTMLElement>('button, [role="button"]') ?? stub;
          trigger?.click();
        })
      );
    },
  });
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
        if (isPopoverOpen(`${FEATURE_ID}-menu`)) closePopover();
        else openMenu(ownBtn);
      });
      toolbar.appendChild(btn);
    }
    btn.textContent = buttonLabel();
  },
};
