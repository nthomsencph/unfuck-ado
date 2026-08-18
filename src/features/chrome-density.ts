import chromeCss from "../styles/chrome.css";
import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";

/**
 * Pure CSS, like board-density, but a separate feature so Phase 3's config
 * panel can toggle header compression independently of card density.
 */
export const chromeDensity: Feature = {
  id: "chrome-density",
  areas: "*",
  apply(): void {
    injectStyleOnce("chrome-density", chromeCss);
  },
};
