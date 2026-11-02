/*
 * The always-on Primer foundation: GitHub's tokens, the ADO → Primer
 * variable bridge, GitHub font families and the gh- component classes.
 * Owned by core (main.ts injects it at boot), not a toggleable feature.
 */
import bridgeCss from "virtual:primer/bridge";
import tokensCss from "virtual:primer/tokens";
import { injectStyleOnce } from "../dom";
import componentsCss from "./components.css";
import { BRIDGE_SHEET_ID, syncTheme } from "./theme";
import typeCss from "./type.css";

const TYPE_SHEET_ID = "primer-type";

/**
 * Boot injection, before any feature sheet. Tokens and components first:
 * feature rules must win equal-specificity ties against gh- classes.
 */
export function injectPrimer(): void {
  injectStyleOnce("primer-tokens", tokensCss);
  injectStyleOnce(BRIDGE_SHEET_ID, bridgeCss);
  injectStyleOnce(TYPE_SHEET_ID, typeCss);
  injectStyleOnce("primer-components", componentsCss);
  syncPrimer();
}

/**
 * Every settle: follow ADO's theme, and keep the two sheets that override
 * ADO's own declarations (bridge, type) after ADO's lazily-loaded chunks —
 * injectStyleOnce re-appends them. Tokens and components compete with no
 * ADO rule and are deliberately NOT re-healed, so they stay ahead of the
 * feature sheets.
 */
export function syncPrimer(): void {
  syncTheme();
  injectStyleOnce(BRIDGE_SHEET_ID, bridgeCss);
  injectStyleOnce(TYPE_SHEET_ID, typeCss);
}

export { octicon, type OcticonName } from "./icons";
