import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";
import { log } from "../core/log";

/**
 * Folds the header's "Set auto-complete" split button into the ⋮ More-actions
 * menu (user request 2026-08-17: one less button in the header). The split
 * button collapses to an invisible stub — kept in the DOM because both proxy
 * clicks and the merge-actions callout still anchor to it. When the ⋮ menu
 * opens, two rows are injected at the top:
 *  - the split button's CURRENT primary action, label read live from the
 *    button ("Set auto-complete" / "Cancel auto-complete" / … — it tracks
 *    state, so we never hardcode it);
 *  - "More merge actions…", which opens the native chevron menu (Complete /
 *    Mark as draft / Abandon / …) — its items are stateful too, so we hand
 *    over to ADO's own menu instead of cloning it.
 * Verified live 2026-08-17 on PR 6970: opening the chevron menu auto-closes
 * the ⋮ menu (bolt keeps a single callout).
 */
const FEATURE_ID = "pr-actions";

const SPLIT = ".repos-pr-header-complete-button";

const CSS = `
/* Same stub pattern as the Files-view Filter button: zero-size, invisible,
   still clickable by proxy. */
${SPLIT} {
  width: 0 !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}
/* Cloned rows are outside bolt's hover/focus state — style hover ourselves. */
.adofix-menu-item:hover { background: rgba(128, 128, 128, 0.12); cursor: pointer; }
`;

function splitButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SPLIT);
}

/** Light-dismiss every open bolt callout (menus close on outside mousedown). */
function dismissMenus(): void {
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

function makeItem(
  template: HTMLTableRowElement,
  label: string,
  onPick: () => void
): HTMLTableRowElement {
  const tr = template.cloneNode(true) as HTMLTableRowElement;
  tr.classList.add("adofix-menu-item");
  tr.removeAttribute("id");
  const icon = tr.querySelector(".bolt-menuitem-cell-icon .fabric-icon");
  if (icon) icon.className = "flex-noshrink fabric-icon"; // blank, keeps text aligned
  const text = tr.querySelector(".bolt-menuitem-cell-text");
  if (text) text.textContent = label;
  tr.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismissMenus();
    // Next frame: let the menu unmount before the action opens its own UI.
    requestAnimationFrame(onPick);
  });
  return tr;
}

function injectIntoMenu(menu: HTMLElement): void {
  if (menu.querySelector(".adofix-menu-item")) return;
  const first = menu.querySelector<HTMLTableRowElement>('tr[role="menuitem"]');
  const split = splitButton();
  if (!first || !first.parentElement || !split) return;
  const main = split.querySelector<HTMLButtonElement>("button.bolt-split-button-main");
  const option = split.querySelector<HTMLButtonElement>("button.bolt-split-button-option");
  if (!main || !option) return;
  const primary = makeItem(first, (main.textContent ?? "").trim(), () => main.click());
  const more = makeItem(first, "More merge actions…", () => option.click());
  first.parentElement.insertBefore(primary, first);
  first.parentElement.insertBefore(more, first);
  log(FEATURE_ID, "menu items injected");
}

/**
 * The ⋮ menu callout renders asynchronously after the click, so poll briefly.
 * Injection only ever targets the menu spawned by the header ⋮ click that
 * triggered this schedule (bolt keeps one callout open at a time — the last
 * .bolt-menu is it); the chevron menu our proxy opens never reaches here
 * because dismissMenus() runs before the proxy click.
 */
function scheduleInjection(): void {
  let tries = 0;
  const poll = (): void => {
    tries += 1;
    const menus = document.querySelectorAll<HTMLElement>(
      ".bolt-contextualmenu-container .bolt-menu"
    );
    const menu = menus[menus.length - 1];
    if (menu) {
      injectIntoMenu(menu);
      return;
    }
    if (tries < 20) setTimeout(poll, 75);
  };
  setTimeout(poll, 50);
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target as Element | null;
  const ellipsis = target?.closest?.(".bolt-header-command-item-button");
  if (!ellipsis) return;
  const split = splitButton();
  // Only the ⋮ that shares the header row with the (hidden) split button.
  if (!split || split.parentElement !== ellipsis.parentElement) return;
  scheduleInjection();
}

let wired = false;

export const prActions: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce(FEATURE_ID, CSS);
    if (wired) return;
    wired = true;
    // Capture phase: runs even though bolt stops propagation of menu clicks.
    document.addEventListener("click", onDocumentClick, true);
  },
  dispose(): void {
    if (!wired) return;
    wired = false;
    document.removeEventListener("click", onDocumentClick, true);
  },
};
