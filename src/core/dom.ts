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

/**
 * Bolt-styled subtle icon-only toolbar button: a fresh button carrying
 * bolt's classes (fixed list, not a clone, so no transient state — active
 * highlight, aria-expanded — leaks in from a template). `className` is the
 * caller's own marker class — each feature keeps its own so existence
 * guards next to the shared #__bolt-filter row never collide.
 */
export function makeToolbarButton(
  label: string,
  icon: Node,
  className = "adofix-toolbar-btn"
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    `${className} bolt-header-command-item-button bolt-button ` +
    "bolt-icon-button enabled subtle icon-only bolt-focus-treatment";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.appendChild(icon);
  return btn;
}

/**
 * Icon-only proxy for a (stubbed) native commandbar button, with the
 * native's icon cloned in. The native is resolved BY ID AT CLICK TIME
 * because ADO re-renders its headers and stateful controls must never be
 * mirrored statically. Returns null when the native (or its icon) is not in
 * the DOM.
 */
export function makeCommandProxy(nativeId: string, label: string): HTMLButtonElement | null {
  const native = document.getElementById(nativeId);
  const icon = native?.querySelector('[class*="fluent"], .bolt-button-icon');
  if (!native || !icon) return null;
  const btn = makeToolbarButton(label, icon.cloneNode(true));
  btn.dataset["native"] = nativeId;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById(nativeId)?.click();
  });
  return btn;
}

/**
 * Idempotent adofix text span: created under `parent` on first call, then
 * textContent updated only when it changed (apply() re-runs on every settle;
 * unchanged writes would still dirty the DOM).
 */
export function ensureText(parent: HTMLElement, className: string, text: string): void {
  let span = parent.querySelector<HTMLElement>(`:scope .${className}`);
  if (!span) {
    span = document.createElement("span");
    span.className = className;
    parent.appendChild(span);
  }
  if (span.textContent !== text) span.textContent = text;
}

/**
 * CSS keeping elements mounted but invisible, unclickable and zero-size —
 * the stub pattern. display:none is unsafe on bolt commandbar items (bolt
 * evicts them from the DOM and click-proxies lose their targets), and
 * opacity:0 is unsafe above teleported controls (opacity hides the whole
 * subtree, position:fixed descendants included). visibility is overridable
 * per-descendant — deliberately not !important — which the teleports rely on.
 */
export function stubHide(selectors: string): string {
  return `${selectors} {
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  overflow: hidden !important;
  visibility: hidden;
  pointer-events: none;
}`;
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

function ensureSheet(featureId: string): HTMLStyleElement {
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
    return existing;
  }
  const style = document.createElement("style");
  style.setAttribute(ADOFIX_ATTR, featureId);
  document.head.appendChild(style);
  return style;
}

export function injectStyleOnce(featureId: string, css: string): void {
  const sheet = ensureSheet(featureId);
  if (!sheet.textContent) sheet.textContent = css;
}

/**
 * injectStyleOnce for CSS that changes at runtime (per-selection rules):
 * rewrites the sheet when the text differs, with the same self-healing
 * re-append — a sheet appended once and never re-checked silently loses to
 * whichever ADO chunk loads after it.
 */
export function setStyle(featureId: string, css: string): void {
  const sheet = ensureSheet(featureId);
  if (sheet.textContent !== css) sheet.textContent = css;
}

/*
 * Shared design tokens + the elevated-surface recipe, injected once at boot
 * (main.ts) — owned by core, not by a toggleable feature, because every
 * feature's surfaces read these.
 */
const BASE_CSS = `
/*
 * --adofix-radius is THE corner radius for every adofix-styled container
 * surface (cards, panels, menus, toasts) — change it here, not per-rule.
 * Small controls (checkboxes, pills, badges) keep their own radii; those
 * track control height, not surface language.
 */
:root {
  --adofix-radius: 10px;
  /* Near-black canvas with layered surfaces (user request 2026-08-18):
     page < lane (grouping surfaces, e.g. board columns) < card. */
  --adofix-bg: #141414;
  --adofix-lane: #1d1c1b;
  --adofix-card: #252423;
}
/*
 * One recipe for every floating adofix panel (toast, menus, pickers, the
 * drafts panel): ADO theme variables with dark fallbacks, resolved at the
 * element — where ADO's theme vars are actually inherited; :root sits above
 * them. --adofix-ink mixes the accent toward the theme's text color so
 * accent text stays readable on both themes.
 */
.adofix-surface {
  --adofix-ink: color-mix(in srgb, ${ACCENT} 62%, var(--text-primary-color, #fff));
  background: var(--callout-background-color, #201f1e);
  color: var(--text-primary-color, #fff);
  border: 1px solid var(--border-subtle-color, rgba(128, 128, 128, 0.25));
  border-radius: var(--adofix-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-family: "Segoe UI", system-ui, sans-serif;
}
`;

export function injectBaseStyle(): void {
  injectStyleOnce("adofix-base", BASE_CSS);
}

/* Surface material comes from .adofix-surface; the accent spine is ours. */
const TOAST_CSS = `
.adofix-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 3px solid ${ACCENT};
  padding: 9px 16px;
  z-index: 100000;
  font-size: 13px;
}
`;

export function showToast(message: string, ms = 2500): void {
  injectStyleOnce("toast", TOAST_CSS);
  safeQuery(`[${ADOFIX_ATTR}="toast-item"]`)?.remove();
  const el = document.createElement("div");
  el.setAttribute(ADOFIX_ATTR, "toast-item");
  el.className = "adofix-toast adofix-surface";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
