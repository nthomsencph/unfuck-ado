/*
 * Theme detection: GitHub Dark Default when ADO is dark, GitHub Light when
 * ADO is light. Primer's theme selectors key off attributes on <html>
 * ([data-color-mode="dark"][data-dark-theme="dark"]), which this module
 * writes. Runs at boot, on every settle, and immediately when ADO rewrites
 * body's class list (watchTheme), so switching ADO's theme switches ours
 * without a reload or a debounce-long flash.
 */
import { getValue, setValue } from "../storage";

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

/** The theme ADO's body class names; null while ADO hasn't set one yet. */
export function classTheme(body: HTMLElement = document.body): ThemeState | null {
  const cls = themeClass(body);
  if (!cls) return null;
  return { mode: /theme-(hc-)?dark/.test(cls) ? "dark" : "light", highContrast: /theme-hc/.test(cls) };
}

const STORE = "primer";
const STORE_KEY = "theme";

function isThemeState(v: unknown): v is ThemeState {
  const s = v as ThemeState | null;
  return !!s && (s.mode === "dark" || s.mode === "light") && typeof s.highContrast === "boolean";
}

/** Last class-derived theme, from an earlier page load (GM storage is sync). */
function persistedTheme(): ThemeState | null {
  const stored = getValue<unknown>(STORE, STORE_KEY, null);
  return isThemeState(stored) ? stored : null;
}

/**
 * ADO's theme class first. At document-idle it may not be on body yet, so
 * next comes the theme the class named on an earlier load — a luminance
 * guess there flashed the light theme into dark-theme users' page loads.
 * The luminance read is the last resort (first load ever, no class yet).
 */
export function detectTheme(body: HTMLElement = document.body): ThemeState {
  return classTheme(body) ?? persistedTheme() ?? { mode: adoCanvasIsDark(body) ? "dark" : "light", highContrast: false };
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
  const fromClass = classTheme(document.body);
  const state = fromClass ?? detectTheme();
  // Persist only what the class said (a guess must never outlive the load),
  // and only on change: this runs on every settle.
  if (fromClass) {
    const saved = persistedTheme();
    if (saved?.mode !== fromClass.mode || saved.highContrast !== fromClass.highContrast) {
      setValue(STORE, STORE_KEY, fromClass);
    }
  }
  const html = document.documentElement;
  setAttr(html, "data-color-mode", state.mode);
  setAttr(html, "data-dark-theme", "dark");
  setAttr(html, "data-light-theme", "light");
  setAttr(html, BRIDGE_ATTR, state.highContrast ? null : "");
  return state;
}

let watching = false;

/**
 * Re-syncs the moment ADO writes body's class list — the settle observer is
 * childList-only and debounced, so a theme class landing after boot would
 * otherwise show the wrong theme until the next settle. Undebounced: a
 * class write is rare and syncTheme only writes attributes that changed.
 * Once per page; body is never replaced by ADO's SPA.
 */
export function watchTheme(): () => void {
  if (watching || !document.body) return () => {};
  watching = true;
  const observer = new MutationObserver(() => syncTheme());
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  return () => {
    observer.disconnect();
    watching = false;
  };
}
