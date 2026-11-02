/*
 * Build-time only (imported by build.mjs, never by the userscript): the ADO
 * → Primer variable bridge.
 *
 * ADO's bolt components (azure-devops-ui) paint from CSS variables. Setting
 * those to Primer values recolors every ADO page at once — including corners
 * no feature will ever touch. The variable list is the 84 variables that
 * azure-devops-ui 2.281.0's CSS consumes (D4: not yet confirmed against a
 * live dump — ADO's own non-bolt bundles may read more).
 *
 * Two kinds of variable:
 * - semantic ones (--background-color, …) hold whole colors, so they map to
 *   `var(--primer-token)` and follow data-color-mode by themselves;
 * - --palette-* ones are mostly bare "r, g, b" triples, consumed as
 *   `rgba(var(--palette-neutral-8), 1)`. A var() can't produce a triple, so
 *   the build computes them per theme from Primer's resolved hex values.
 *
 * Emitted on `html body` with !important (D5: ADO's theme may set them
 * inline on body), and only while theme.ts marks the page
 * [data-adofix-bridge] — i.e. never in ADO's high-contrast themes.
 */
import type { ThemeBlock } from "./prune";
import { BRIDGE_ATTR } from "./theme";

/*
 * Semantic map. Groups (spec): canvas → bgColor-default; overlays →
 * overlay-bgColor; text → fg tokens; borders → borderColor-*, except the
 * two that only ever draw row/section hairlines → transparent (borderless,
 * B9; the rest of the borderless pass is ado.css); ADO's
 * "communication" blue → Primer accent; statuses → success / attention /
 * danger / accent families; focus → focus-outlineColor.
 */
export const SEMANTIC: Record<string, string> = {
  "--background-color": "var(--bgColor-default)",
  "--text-primary-color": "var(--fgColor-default)",
  "--text-secondary-color": "var(--fgColor-muted)",
  "--text-disabled-color": "var(--fgColor-disabled)",
  "--text-on-communication-background": "var(--fgColor-onEmphasis)",
  "--communication-foreground": "var(--fgColor-accent)",
  "--communication-background": "var(--bgColor-accent-emphasis)",
  "--border-subtle-color": "transparent",
  "--splitter-border-color": "var(--borderColor-default)",
  "--callout-background-color": "var(--overlay-bgColor)",
  // Translucent in ADO (0.86) for its frosted callouts; GitHub overlays are opaque.
  "--callout-filtered-background-color": "var(--overlay-bgColor)",
  "--focus-border-color": "var(--focus-outlineColor)",
  // ADO's focus "pulse" is a translucent accent halo around the ring.
  "--focus-pulse-max-color": "var(--borderColor-accent-muted)",
  "--focus-pulse-min-color": "var(--bgColor-accent-muted)",
  "--status-success-background": "var(--bgColor-success-muted)",
  "--status-success-foreground": "var(--fgColor-success)",
  "--status-success-text": "var(--fgColor-success)",
  "--status-error-background": "var(--bgColor-danger-muted)",
  "--status-error-foreground": "var(--fgColor-danger)",
  "--status-error-text": "var(--fgColor-danger)",
  "--status-error-strong": "var(--fgColor-danger)",
  "--status-warning-background": "var(--bgColor-attention-muted)",
  "--status-warning-foreground": "var(--fgColor-attention)",
  "--status-warning-text": "var(--fgColor-attention)",
  "--status-warning-icon-foreground": "var(--fgColor-attention)",
  "--status-info-background": "var(--bgColor-accent-muted)",
  "--status-info-foreground": "var(--fgColor-accent)",
  "--component-status-success": "var(--fgColor-success)",
  "--component-status-error": "var(--fgColor-danger)",
  "--component-status-warning": "var(--fgColor-attention)",
  "--component-status-info": "var(--fgColor-accent)",
  "--component-status-neutral": "var(--fgColor-muted)",
  "--component-grid-row-hover-color": "var(--control-transparent-bgColor-hover)",
  "--component-grid-action-hover-color": "var(--control-transparent-bgColor-hover)",
  "--component-grid-selected-row-color": "var(--bgColor-accent-muted)",
  "--component-grid-action-selected-cell-hover-color": "var(--bgColor-accent-muted)",
  "--component-grid-cell-bottom-border-color": "transparent",
  "--component-grid-focus-border-color": "var(--focus-outlineColor)",
  "--component-grid-drag-source-color": "var(--bgColor-neutral-muted)",
  "--component-grid-link-hover-color": "var(--fgColor-accent)",
  "--component-grid-link-selected-row-color": "var(--fgColor-accent)",
  "--component-label-default-color": "var(--bgColor-neutral-muted)",
  "--component-label-default-color-hover": "var(--control-bgColor-hover)",
};

/*
 * Left to ADO on purpose: a CSS filter for third-party extension icons
 * (none / invert per theme) — not a color, and ADO's value is already
 * right for the theme it detected.
 */
export const UNMAPPED = ["--third-party-icon-filter"];

/*
 * Palette formulas — BG = --bgColor-default, FG = --fgColor-default,
 * A = --bgColor-accent-emphasis, mix(X, Y, p) = X moved p% toward Y in sRGB.
 * Percentages reproduce ADO's light defaults (azure-devops-ui 2.281.0
 * cssDefaults.json) from its white canvas and #0078d4 primary.
 *
 * | ADO variable                | form   | value                          |
 * |-----------------------------|--------|--------------------------------|
 * | palette-neutral-N           | triple | mix(BG, FG, N%)  (0 = canvas)  |
 * | palette-primary-tint-10…40  | triple | mix(A, BG, 15/78/87/94%)       |
 * | palette-primary-shade-10…30 | triple | mix(A, FG, 10/25/43%)          |
 * | palette-primary-darkened-6/10 | triple | mix(A, black, 14/24%) — button hover/press under white text |
 * | palette-accent3             | triple | --fgColor-severe (ADO orange)  |
 * | palette-accent3-dark        | triple | --bgColor-severe-emphasis      |
 * | palette-error / -6 / -10    | rgba   | mix(--bgColor-danger-emphasis, black, 0/12/20%) |
 * | palette-black-alpha-N       | rgba   | FG at N% alpha (a dark veil in light, light veil in dark) |
 * | callout/panel-shadow-color  | color  | Primer's floating-small/-large shadow colors |
 *
 * Tints go toward the canvas and shades toward the text color (not
 * white/black) so both stay usable on the dark canvas: ADO uses shade-30
 * for link hover text, which black-mixing would sink into #0d1117.
 */
const NEUTRAL_STEPS = [0, 2, 4, 6, 8, 10, 20, 30, 60, 70, 80, 100];
const TINTS: Record<string, number> = { 10: 15, 20: 78, 30: 87, 40: 94 };
const SHADES: Record<string, number> = { 10: 10, 20: 25, 30: 43 };
const DARKENED: Record<string, number> = { 6: 14, 10: 24 };
const BLACK_ALPHA = [2, 4, 6, 8, 10, 20, 30, 60, 70, 80];

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

export function parseHex(hex: string): Rgba {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m || ![3, 4, 6, 8].includes(m[1]!.length)) throw new Error(`primer: not a hex color: ${hex}`);
  let h = m[1]!;
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

export function mix(from: Rgba, to: Rgba, pct: number): Rgba {
  const t = pct / 100;
  const ch = (x: number, y: number): number => x + (y - x) * t;
  return { r: ch(from.r, to.r), g: ch(from.g, to.g), b: ch(from.b, to.b), a: ch(from.a, to.a) };
}

/** "r, g, b" — the form ADO's rgba(var(--palette-…), alpha) expects. */
export function toTriple(c: Rgba): string {
  return [c.r, c.g, c.b].map((x) => Math.round(x)).join(", ");
}

function toRgba(c: Rgba, alpha = c.a): string {
  return `rgba(${toTriple(c)}, ${+alpha.toFixed(3)})`;
}

/**
 * A token's color, following var() aliases to the hex. Translucent colors
 * are composited over `over` — triples can't carry alpha.
 */
export function resolveColor(theme: ThemeBlock, name: string, over?: Rgba): Rgba {
  let value = theme.decls.get(name);
  for (let hops = 0; value !== undefined && hops < 10; hops++) {
    const alias = /^var\((--[A-Za-z0-9-]+)\)$/.exec(value);
    if (!alias) break;
    value = theme.decls.get(alias[1]!);
  }
  if (value === undefined) throw new Error(`primer: ${name} does not resolve in ${theme.selector}`);
  const c = parseHex(value);
  return over && c.a < 1 ? { ...mix(over, c, c.a * 100), a: 1 } : c;
}

/** Shadow colors inside a Primer shadow token, in order. */
function shadowColors(theme: ThemeBlock, name: string): string[] {
  const value = theme.decls.get(name);
  if (!value) throw new Error(`primer: ${name} missing in ${theme.selector}`);
  return value.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
}

/** Every --palette-* (and shadow) value for one theme. */
export function paletteFor(theme: ThemeBlock): Record<string, string> {
  const bg = resolveColor(theme, "--bgColor-default");
  const fg = resolveColor(theme, "--fgColor-default", bg);
  const accent = resolveColor(theme, "--bgColor-accent-emphasis", bg);
  const danger = resolveColor(theme, "--bgColor-danger-emphasis", bg);
  const out: Record<string, string> = {};
  for (const n of NEUTRAL_STEPS) out[`--palette-neutral-${n}`] = toTriple(mix(bg, fg, n));
  for (const [k, p] of Object.entries(TINTS)) out[`--palette-primary-tint-${k}`] = toTriple(mix(accent, bg, p));
  for (const [k, p] of Object.entries(SHADES)) out[`--palette-primary-shade-${k}`] = toTriple(mix(accent, fg, p));
  for (const [k, p] of Object.entries(DARKENED)) {
    out[`--palette-primary-darkened-${k}`] = toTriple(mix(accent, BLACK, p));
  }
  out["--palette-accent3"] = toTriple(resolveColor(theme, "--fgColor-severe", bg));
  out["--palette-accent3-dark"] = toTriple(resolveColor(theme, "--bgColor-severe-emphasis", bg));
  out["--palette-error"] = toRgba(danger);
  out["--palette-error-6"] = toRgba(mix(danger, BLACK, 12));
  out["--palette-error-10"] = toRgba(mix(danger, BLACK, 20));
  for (const n of BLACK_ALPHA) out[`--palette-black-alpha-${n}`] = toRgba(fg, n / 100);
  // ADO stacks two shadows: a wide soft one (-color) and a tight one (-secondary-color).
  const [, small2, small3] = shadowColors(theme, "--shadow-floating-small");
  const [, large2, large3] = shadowColors(theme, "--shadow-floating-large");
  out["--callout-shadow-color"] = small3 ?? small2 ?? "transparent";
  out["--callout-shadow-secondary-color"] = small2 ?? "transparent";
  out["--panel-shadow-color"] = large3 ?? large2 ?? "transparent";
  out["--panel-shadow-secondary-color"] = large2 ?? "transparent";
  return out;
}

/** Every ADO variable the bridge sets or deliberately leaves alone. */
export function adoVariables(theme: ThemeBlock): Set<string> {
  return new Set([...Object.keys(SEMANTIC), ...Object.keys(paletteFor(theme)), ...UNMAPPED]);
}

function rule(selector: string, decls: Record<string, string>): string {
  const lines = Object.entries(decls).map(([name, value]) => `  ${name}: ${value} !important;`);
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

export function buildBridgeCss(dark: ThemeBlock, light: ThemeBlock): string {
  const scope = (mode: string): string => `html[${BRIDGE_ATTR}][data-color-mode="${mode}"] body`;
  return (
    rule(`html[${BRIDGE_ATTR}] body`, SEMANTIC) +
    rule(scope("dark"), paletteFor(dark)) +
    rule(scope("light"), paletteFor(light))
  );
}
