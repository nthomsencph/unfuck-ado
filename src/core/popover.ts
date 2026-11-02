import { ADOFIX_ATTR, injectStyleOnce, safeQuery } from "./dom";
import { octicon } from "./primer/icons";

/**
 * Light-dismiss popover shared by every adofix dropdown menu. One popover is
 * open at a time — opening any closes the previous. Dismiss: mousedown
 * outside (capture, so React can't swallow it) and Escape. Arrow keys rove
 * the enabled items; the container takes focus and carries data-adofix-modal
 * so global hotkeys stand down while it is open (keys.ts checks the event
 * target). Item/status/divider building blocks live here too so every menu
 * speaks the same surface language.
 */

/*
 * Material and items come from the gh-menu component (GitHub's ActionList
 * overlay); this sheet adds only placement and the adofix-specific slots.
 */
const POPOVER_CSS = `
.adofix-menu {
  position: fixed;
  z-index: 100000;
  outline: none;
}
/* Item rules are scoped under .adofix-menu: pr-actions tags FOREIGN (cloned
   bolt table-row) menu items "adofix-menu-item" for its own hover rule, and
   bare class selectors here would restyle those rows the moment any popover
   injects this sheet. */
.adofix-menu .adofix-menu-status {
  padding: 6px 16px;
  font-size: var(--text-body-size-small);
  font-weight: var(--base-text-weight-semibold);
  color: var(--fgColor-muted);
}
/* Keyboard roving focus lands on the item: show it as GitHub's active row. */
.adofix-menu .adofix-menu-item:focus-visible {
  background-color: var(--control-transparent-bgColor-hover);
}
/* Leading check slot, always reserved so labels align (single-select
   ActionList). */
.adofix-menu .adofix-menu-check {
  display: inline-flex;
  width: 16px;
  flex-shrink: 0;
}
.adofix-menu .adofix-menu-count {
  margin-left: auto;
}
`;

export interface MenuItemOptions {
  checked?: boolean;
  count?: number;
  disabled?: boolean;
}

export function menuItem(
  label: string,
  opts: MenuItemOptions = {},
  onClick?: () => void
): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "adofix-menu-item gh-menu-item";
  const check = document.createElement("span");
  check.className = "adofix-menu-check";
  if (opts.checked) check.appendChild(octicon("check"));
  item.append(check, label);
  if (opts.count !== undefined) {
    const pill = document.createElement("span");
    pill.className = "adofix-menu-count gh-Counter";
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

export function menuStatus(text: string): HTMLDivElement {
  const status = document.createElement("div");
  status.className = "adofix-menu-status";
  status.textContent = text;
  return status;
}

export function menuDivider(): HTMLDivElement {
  const divider = document.createElement("div");
  divider.className = "adofix-menu-divider gh-menu-divider";
  return divider;
}

export interface PopoverContext {
  close(): void;
  /** Rebuilds the content in place (checked states after a click). */
  rerender(): void;
}

export interface PopoverSpec {
  /** data-adofix value of the menu element; keys isPopoverOpen. */
  id: string;
  anchor: HTMLElement;
  /** Extra class for feature-specific geometry (width etc.). */
  className?: string;
  /** Builds the content into the (empty) menu; re-run by ctx.rerender(). */
  render(menu: HTMLElement, ctx: PopoverContext): void;
  /** Extra selector that must not light-dismiss (the toggle button). */
  keepOpenWithin?: string;
}

let activeClose: (() => void) | null = null;

export function closePopover(): void {
  activeClose?.();
}

export function isPopoverOpen(id: string): boolean {
  return safeQuery(`[${ADOFIX_ATTR}="${id}"]`) !== null;
}

export function openPopover(spec: PopoverSpec): void {
  injectStyleOnce("adofix-popover", POPOVER_CSS);
  closePopover();

  const menu = document.createElement("div");
  menu.setAttribute(ADOFIX_ATTR, spec.id);
  menu.setAttribute("data-adofix-modal", "");
  menu.className = `adofix-menu gh-menu${spec.className ? ` ${spec.className}` : ""}`;
  menu.tabIndex = -1;

  const close = (): void => {
    menu.remove();
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    activeClose = null;
    // Hand focus back so Escape doesn't strand it on <body>.
    spec.anchor.focus();
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (!(e.target instanceof Element)) return;
    const keep = spec.keepOpenWithin ? `, ${spec.keepOpenWithin}` : "";
    if (e.target.closest(`[${ADOFIX_ATTR}="${spec.id}"]${keep}`)) return;
    close();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>(".adofix-menu-item:not([disabled])")
    );
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const idx = items.findIndex((b) => b === document.activeElement);
    const delta = e.key === "ArrowDown" ? 1 : -1;
    items[(idx + delta + items.length) % items.length]?.focus();
  };

  const position = (): void => {
    const rect = spec.anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  };

  const ctx: PopoverContext = {
    close,
    rerender(): void {
      menu.replaceChildren();
      spec.render(menu, ctx);
      position();
      // A click that triggered the rerender destroyed the focused item —
      // keep focus inside so the modal hotkey suspension holds.
      if (!menu.contains(document.activeElement)) menu.focus();
    },
  };

  document.body.appendChild(menu);
  spec.render(menu, ctx);
  position();
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  activeClose = close;
  menu.focus();
}
