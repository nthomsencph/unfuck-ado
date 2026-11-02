/*
 * Build-time only: build.mjs bundles this module, feeds it file contents
 * (it does no I/O itself, so it stays testable and needs no Node types) and
 * serves the result to the userscript as virtual modules.
 */
import { adoVariables, buildBridgeCss } from "./bridge";
import {
  assertKnown,
  collectRefs,
  definedNames,
  parseTheme,
  printBlock,
  pruneTheme,
  stripComments,
} from "./prune";

export interface PrimerInput {
  /** functional/themes/dark.css and light.css, verbatim. */
  dark: string;
  light: string;
  /** Size, typography and base files, shipped whole. */
  whole: string[];
  /** Every src/** text file that may reference tokens (tests excluded). */
  sources: string[];
}

export interface PrimerOutput {
  tokens: string;
  bridge: string;
}

export function buildPrimerCss(input: PrimerInput): PrimerOutput {
  const dark = parseTheme(input.dark);
  const light = parseTheme(input.light);
  const whole = input.whole.map((css) => stripComments(css).replace(/\n\s*\n/g, "\n").trim() + "\n");
  // Palette values come from the FULL themes — they resolve tokens the
  // pruned sheet never ships.
  const bridge = buildBridgeCss(dark, light);

  const refs = collectRefs([...input.sources, bridge, ...whole]);
  const known = new Set([...dark.decls.keys(), ...light.decls.keys()]);
  for (const css of whole) for (const name of definedNames(css)) known.add(name);
  assertKnown(refs, known, adoVariables(dark));

  const tokens = whole.join("") + printBlock(pruneTheme(dark, refs)) + printBlock(pruneTheme(light, refs));
  return { tokens, bridge };
}
