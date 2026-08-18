import densityCss from "../styles/density.css";
import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";

/**
 * Pure CSS. Injected once; the rules only match board DOM, so keeping the
 * style route-agnostic is harmless and survives SPA navigation for free.
 */
export const boardDensity: Feature = {
  id: "board-density",
  areas: "*",
  apply(): void {
    injectStyleOnce("board-density", densityCss);
  },
};
