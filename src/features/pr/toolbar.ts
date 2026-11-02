import { safeQuery } from "../../core/dom";

/**
 * The Files-tab diff toolbar ("All Changes / Filter / Inline / …") — the
 * injection point pr-thread-filter and pr-drafts share. Only exists on the
 * Files tab. Verified live 2026-08-01.
 */
export const TOOLBAR_SELECTOR = ".repos-compare-toolbar";

/**
 * Classes for buttons adofix injects into this toolbar: GitHub's small
 * button (28px, like the controls in github.com's Files-changed toolbar).
 * Was ADO's bolt-button triple until the Primer migration (2026-11-02).
 */
export const TOOLBAR_BUTTON_CLASSES = "gh-btn gh-btn-sm";

export function findToolbar(): HTMLElement | null {
  return safeQuery<HTMLElement>(TOOLBAR_SELECTOR);
}
