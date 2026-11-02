/*
 * Build-time only (imported by build.mjs, never by the userscript): turns
 * @primer/primitives' CSS into the token sheet we ship.
 *
 * The full dark + light theme files are ~240 KB with comments — as big as
 * the whole script — so the themes are pruned to the custom properties the
 * source actually references, plus everything those reference in turn
 * (Primer tokens alias each other: --focus-outlineColor →
 * --focus-outline-color → --borderColor-accent-emphasis → a hex).
 */

/** One theme file's first rule: its selector list and its declarations. */
export interface ThemeBlock {
  selector: string;
  decls: Map<string, string>;
}

/*
 * First name segment of Primer's functional tokens. A referenced name with
 * one of these heads that Primer doesn't define is a typo (--fgColor-mute)
 * and must fail the build — an undefined var() silently resolves to the
 * property's initial value, which is exactly the kind of bug nobody spots.
 */
export const PRIMER_PREFIXES = new Set([
  "fgColor",
  "bgColor",
  "borderColor",
  "borderRadius",
  "borderWidth",
  "boxShadow",
  "shadow",
  "button",
  "buttonCounter",
  "control",
  "controlStack",
  "overlay",
  "focus",
  "outline",
  "stack",
  "text",
  "fontStack",
  "base",
  "counter",
  "label",
  "tooltip",
  "menu",
  "selectMenu",
  "underlineNav",
  "avatar",
  "spinner",
  "breakpoint",
  "zIndex",
]);

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every `var(--name` in the sources (fallbacks and nesting included). */
export function collectRefs(sources: Iterable<string>): Set<string> {
  const refs = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) refs.add(m[1]!);
  }
  return refs;
}

function parseDecls(body: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const m of body.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    decls.set(m[1]!, m[2]!.trim());
  }
  return decls;
}

/**
 * A theme file's first rule only. Each Primer theme file repeats its
 * declarations inside `@media (prefers-color-scheme)` for
 * data-color-mode="auto"; theme.ts always writes an explicit dark|light, so
 * that copy would be dead weight.
 */
export function parseTheme(css: string): ThemeBlock {
  const text = stripComments(css);
  const open = text.indexOf("{");
  const close = text.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error("primer: theme CSS has no rule block");
  return {
    selector: text.slice(0, open).trim().replace(/\s*\n\s*/g, " "),
    decls: parseDecls(text.slice(open + 1, close)),
  };
}

/** All custom-property names a stylesheet defines. */
export function definedNames(css: string): Set<string> {
  return new Set(parseDecls(stripComments(css)).keys());
}

/** `theme` reduced to `refs` plus their transitive in-theme dependencies. */
export function pruneTheme(theme: ThemeBlock, refs: Iterable<string>): ThemeBlock {
  const keep = new Set<string>();
  const queue = [...refs];
  while (queue.length) {
    const name = queue.pop()!;
    if (keep.has(name)) continue;
    const value = theme.decls.get(name);
    if (value === undefined) continue; // defined elsewhere (size/type) or not Primer's
    keep.add(name);
    for (const dep of collectRefs([value])) queue.push(dep);
  }
  // Keep Primer's declaration order — stable output, readable diffs.
  const decls = new Map([...theme.decls].filter(([name]) => keep.has(name)));
  return { selector: theme.selector, decls };
}

export function printBlock(block: ThemeBlock): string {
  const lines = [...block.decls].map(([name, value]) => `  ${name}: ${value};`);
  return `${block.selector} {\n${lines.join("\n")}\n}\n`;
}

function looksPrimer(name: string): boolean {
  return PRIMER_PREFIXES.has(name.slice(2).split("-")[0]!);
}

/**
 * Throws when a referenced Primer-looking name is defined nowhere.
 * `exempt` holds ADO's own variables that share a head with Primer's
 * (--text-primary-color, --focus-border-color).
 */
export function assertKnown(refs: Iterable<string>, known: Set<string>, exempt: Set<string>): void {
  const unknown = [...refs].filter((n) => looksPrimer(n) && !known.has(n) && !exempt.has(n));
  if (unknown.length) {
    throw new Error(
      `primer: unknown Primer token(s) referenced in src/: ${unknown.sort().join(", ")}. ` +
        "Check the spelling against @primer/primitives' functional CSS; if it is an " +
        "ADO variable, add it to the bridge's ADO list."
    );
  }
}
