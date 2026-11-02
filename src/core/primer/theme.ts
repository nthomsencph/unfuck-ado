/*
 * Theme detection: GitHub Dark Default when ADO is dark, GitHub Light when
 * ADO is light. Primer's theme selectors key off attributes on <html>
 * ([data-color-mode="dark"][data-dark-theme="dark"]), which this module
 * writes. Runs at boot and on every settle, so switching ADO's theme
 * switches ours without a reload.
 */

/** Present on <html> while the ADO bridge and font override apply. */
export const BRIDGE_ATTR = "data-adofix-bridge";

/** data-adofix id of the bridge sheet (read around while detecting). */
export const BRIDGE_SHEET_ID = "primer-bridge";

export interface ThemeState {
  mode: "dark" | "light";
  /** ADO high-contrast theme: its accessibility colors stay untouched. */
  highContrast: boolean;
}

/** sRGB relative luminance (WCAG), 0 = black … 1 = white. */
export function luminance(r: number, g: number, b: number): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** rgb()/rgba()/#hex → [r, g, b]; null for transparent or unparseable. */
export function parseCssColor(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) === 0) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (!fn) return null;
  const alpha = fn[4] === undefined ? 1 : parseFloat(fn[4]) / (fn[4].endsWith("%") ? 100 : 1);
  if (alpha === 0) return null;
  return [+fn[1]!, +fn[2]!, +fn[3]!];
}

/*
 * ADO marks its theme on body: `ms-vss-web-vsts-theme-dark` (observed live
 * 2026-11-02 in the dark theme only). The light and high-contrast names are inferred
 * (D3, provisional), hence the luminance fallback when no theme class is
 * present at all.
 */
function themeClass(body: HTMLElement): string | undefined {
  // Prefix match, not "-theme-": body also carries feature flags like
  // `calendar-theme-fixes-enabled` (live 2026-11-02), listed BEFORE the theme
  // class — a loose match read that flag as "light".
  return [...body.classList].find((c) => /^ms-vss-web-vsts-theme(-|$)/.test(c));
}

/**
 * ADO's OWN canvas brightness. The bridge overrides --background-color, so
 * its sheet is disabled for the duration of the read — otherwise we'd
 * measure our own GitHub canvas and could never follow a switch to light.
 */
function adoCanvasIsDark(body: HTMLElement): boolean {
  const bridge = document.head.querySelector<HTMLStyleElement>(`style[data-adofix="${BRIDGE_SHEET_ID}"]`);
  const wasDisabled = bridge?.disabled ?? false;
  if (bridge) bridge.disabled = true;
  try {
    const cs = getComputedStyle(body);
    const rgb = parseCssColor(cs.backgroundColor) ?? parseCssColor(cs.getPropertyValue("--background-color"));
    // Unreadable → ADO's default (light).
    return rgb ? luminance(...rgb) < 0.5 : false;
  } finally {
    if (bridge) bridge.disabled = wasDisabled;
  }
}

export function detectTheme(body: HTMLElement = document.body): ThemeState {
  const cls = themeClass(body);
  if (cls) {
    return { mode: /theme-(hc-)?dark/.test(cls) ? "dark" : "light", highContrast: /theme-hc/.test(cls) };
  }
  return { mode: adoCanvasIsDark(body) ? "dark" : "light", highContrast: false };
}

function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

/**
 * Detects and writes the <html> attributes — only those that changed, since
 * this runs on every settle. data-color-mode is set in high contrast too:
 * adofix's own UI still resolves its Primer tokens there.
 */
export function syncTheme(): ThemeState {
  const state = detectTheme();
  const html = document.documentElement;
  setAttr(html, "data-color-mode", state.mode);
  setAttr(html, "data-dark-theme", "dark");
  setAttr(html, "data-light-theme", "light");
  setAttr(html, BRIDGE_ATTR, state.highContrast ? null : "");
  return state;
}
