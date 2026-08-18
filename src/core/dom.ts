export const ADOFIX_ATTR = "data-adofix";

/** One accent for everything we inject — deliberately foreign to ADO's blue. */
export const ACCENT = "#8250df";

export function safeQuery<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T | null {
  try {
    return root.querySelector<T>(selector);
  } catch {
    return null;
  }
}

export function safeQueryAll<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export function findByAriaLabel(
  label: string,
  root: ParentNode = document,
  exact = true
): HTMLElement | null {
  const op = exact ? "=" : "*=";
  return safeQuery<HTMLElement>(`[aria-label${op}"${cssEscape(label)}"]`, root);
}

export function findByText(
  text: string,
  selector = "button, a, span, div",
  root: ParentNode = document
): HTMLElement | null {
  const wanted = text.trim();
  for (const el of safeQueryAll<HTMLElement>(selector, root)) {
    if (el.textContent?.trim() === wanted) return el;
  }
  return null;
}

export function isApplied(el: Element, featureId: string): boolean {
  return el.getAttribute(ADOFIX_ATTR) === featureId;
}

export function markApplied(el: Element, featureId: string): void {
  el.setAttribute(ADOFIX_ATTR, featureId);
}

/**
 * Icon-only proxy for a (stubbed) native commandbar button: a fresh button
 * carrying bolt's subtle icon-button classes (fixed list, not a clone, so no
 * transient state — active highlight, aria-expanded — leaks in from a
 * template) with the native's icon cloned in. The native is resolved BY ID AT
 * CLICK TIME because ADO re-renders its headers and stateful controls must
 * never be mirrored statically. Returns null when the native (or its icon)
 * is not in the DOM.
 */
export function makeCommandProxy(nativeId: string, label: string): HTMLButtonElement | null {
  const native = document.getElementById(nativeId);
  const icon = native?.querySelector('[class*="fluent"], .bolt-button-icon');
  if (!native || !icon) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "adofix-toolbar-btn bolt-header-command-item-button bolt-button " +
    "bolt-icon-button enabled subtle icon-only bolt-focus-treatment";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.dataset["native"] = nativeId;
  btn.appendChild(icon.cloneNode(true));
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById(nativeId)?.click();
  });
  return btn;
}

/** True when a non-adofix stylesheet sits after `el` in <head>. */
function foreignSheetAfter(el: Element): boolean {
  for (let node = el.nextElementSibling; node; node = node.nextElementSibling) {
    if ((node.tagName === "STYLE" || node.tagName === "LINK") && !node.hasAttribute(ADOFIX_ATTR)) {
      return true;
    }
  }
  return false;
}

export function injectStyleOnce(featureId: string, css: string): void {
  const existing = safeQuery<HTMLStyleElement>(
    `style[${ADOFIX_ATTR}="${featureId}"]`,
    document.head
  );
  if (existing) {
    // ADO lazy-loads CSS chunks long after we inject, and equal-specificity
    // !important ties are decided by source order — so whenever ADO's sheets
    // end up after ours, move ours back to the end. apply() re-runs on every
    // DOM settle, which makes this self-healing; the guard keeps it from
    // reshuffling on every settle.
    if (foreignSheetAfter(existing)) document.head.appendChild(existing);
    return;
  }
  const style = document.createElement("style");
  style.setAttribute(ADOFIX_ATTR, featureId);
  style.textContent = css;
  document.head.appendChild(style);
}

/* Same surface language as the drafts UI: native ADO material, accent spine. */
const TOAST_CSS = `
.adofix-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--callout-background-color, #201f1e);
  color: var(--text-primary-color, #fff);
  border: 1px solid var(--border-subtle-color, rgba(0, 0, 0, 0.1));
  border-left: 3px solid ${ACCENT};
  padding: 9px 16px;
  border-radius: var(--adofix-radius, 10px);
  z-index: 100000;
  font-size: 13px;
  font-family: "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
`;

export function showToast(message: string, ms = 2500): void {
  injectStyleOnce("toast", TOAST_CSS);
  safeQuery(`[${ADOFIX_ATTR}="toast-item"]`)?.remove();
  const el = document.createElement("div");
  el.setAttribute(ADOFIX_ATTR, "toast-item");
  el.className = "adofix-toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
