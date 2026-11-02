/*
 * The always-on Primer foundation: GitHub's tokens, the ADO → Primer
 * variable bridge, GitHub font families, the borderless ADO overrides and
 * the gh- component classes.
 * Owned by core (main.ts injects it at boot), not a toggleable feature.
 */
import bridgeCss from "virtual:primer/bridge";
import tokensCss from "virtual:primer/tokens";
import { injectStyleOnce } from "../dom";
import adoCss from "./ado.css";
import componentsCss from "./components.css";
import { BRIDGE_SHEET_ID, syncTheme, watchTheme } from "./theme";
import typeCss from "./type.css";

const TYPE_SHEET_ID = "primer-type";
const ADO_SHEET_ID = "primer-ado";

/**
 * Boot injection, before any feature sheet, plus the theme sync and the
 * body-class watch that keeps it current. Tokens and components first:
 * feature rules must win equal-specificity ties against gh- classes.
 */
export function injectPrimer(): void {
  injectStyleOnce("primer-tokens", tokensCss);
  injectStyleOnce(BRIDGE_SHEET_ID, bridgeCss);
  injectStyleOnce(TYPE_SHEET_ID, typeCss);
  injectStyleOnce(ADO_SHEET_ID, adoCss);
  injectStyleOnce("primer-components", componentsCss);
  syncPrimer();
  watchTheme();
}

/**
 * Every settle: follow ADO's theme, and keep the three sheets that override
 * ADO's own declarations (bridge, type, ado) after ADO's lazily-loaded chunks —
 * injectStyleOnce re-appends them. Tokens and components compete with no
 * ADO rule and are deliberately NOT re-healed, so they stay ahead of the
 * feature sheets.
 */
export function syncPrimer(): void {
  syncTheme();
  injectStyleOnce(BRIDGE_SHEET_ID, bridgeCss);
  injectStyleOnce(TYPE_SHEET_ID, typeCss);
  injectStyleOnce(ADO_SHEET_ID, adoCss);
}

export { octicon, octiconMask, type OcticonName } from "./icons";
