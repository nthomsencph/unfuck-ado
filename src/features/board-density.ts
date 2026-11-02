import densityCss from "../styles/density.css";
import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";

/** Custom property carrying a card-style rule's color (density.css tints with it). */
const RULE_VAR = "--adofix-card-rule";

/**
 * Mostly CSS. Injected once; the rules only match board DOM, so keeping the
 * style route-agnostic is harmless and survives SPA navigation for free.
 *
 * The one bit of JS: board "card styles" rules (Board settings → Styles,
 * e.g. Priority = 1 → red) paint the card with an inline background-color,
 * which density.css's GitHub surface overrides. CSS can't read an inline
 * value, so each settle copies it into a custom property; density.css mixes
 * a tint of it into the surface (borderless B13). Idempotent: writes only
 * when the color changed.
 */
export const boardDensity: Feature = {
  id: "board-density",
  areas: "*",
  apply(): void {
    injectStyleOnce("board-density", densityCss);
    for (const card of document.querySelectorAll<HTMLElement>(".wit-card")) {
      const rule = card.style.backgroundColor;
      if (card.style.getPropertyValue(RULE_VAR) === rule) continue;
      if (rule) card.style.setProperty(RULE_VAR, rule);
      else card.style.removeProperty(RULE_VAR);
    }
  },
};
