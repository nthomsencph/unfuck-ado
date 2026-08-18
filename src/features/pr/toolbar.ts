import { safeQuery } from "../../core/dom";

/**
 * The Files-tab diff toolbar ("All Changes / Filter / Inline / …") — the
 * injection point pr-thread-filter and pr-drafts share. Only exists on the
 * Files tab. Verified live 2026-08-01.
 */
export const TOOLBAR_SELECTOR = ".repos-compare-toolbar";

/** ADO's own toolbar button classes — reused so injected buttons match ADO's layout. Verified live 2026-08-01. */
export const TOOLBAR_BUTTON_CLASSES = "bolt-button enabled bolt-focus-treatment";

export function findToolbar(): HTMLElement | null {
  return safeQuery<HTMLElement>(TOOLBAR_SELECTOR);
}
