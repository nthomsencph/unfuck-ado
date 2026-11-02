import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { injectStyleOnce, safeQuery, safeQueryAll, showToast } from "../core/dom";
import { log } from "../core/log";
import { octicon } from "../core/primer/icons";
import { DIFF_SELECTORS, sectionFilePath } from "./pr/diff";
import { prRefFromRoute, refKey, type PrRef } from "./pr/threads-api";
import { patchViewed, viewedState } from "./pr/reviewed-data";
import { clickTreeCheckbox, mapTreeFiles } from "./pr/reviewed-tree";

/**
 * Mirrors the file tree's "Mark as reviewed" checkbox into every stacked
 * per-file header. Two mechanisms, because the tree is virtualized and the
 * reviewed hash is uncrackable client-side (see pr/reviewed-data.ts):
 * - DISPLAY reads the server's viewed-paths set (one POST per PR page load),
 *   overridden by live aria-checked wherever the tree row happens to be
 *   rendered.
 * - TOGGLE clicks ADO's real tree checkbox. If the row is virtualized away,
 *   the tree is sweep-scrolled once to map every path to its flat-list row
 *   index, then scrolled to the target row, clicked, and scrolled back.
 */
const FEATURE_ID = "pr-reviewed";

/*
 * GitHub's "Viewed" toggle from the Files-changed file header: a small
 * default button holding a checkbox, which turns accent-tinted once
 * checked. Revealed on header-row hover like the tree's own checkbox, and
 * stays visible once checked.
 */
const CSS = `
.adofix-reviewed {
  margin-right: 8px; flex-shrink: 0;
  opacity: 0; transition: opacity 0.12s;
}
.repos-summary-header > .flex-row:hover .adofix-reviewed,
.adofix-reviewed:focus-visible,
.adofix-reviewed[aria-checked="true"],
html[data-adofix-reviewing] .adofix-reviewed { opacity: 1; }
.adofix-reviewed[aria-checked="true"],
.adofix-reviewed[aria-checked="true"]:hover:not(:disabled) {
  background-color: var(--bgColor-accent-muted);
  border-color: var(--borderColor-accent-muted);
}
.adofix-reviewed-box {
  width: 16px; height: 16px; box-sizing: border-box; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bgColor-default);
  border: var(--borderWidth-default) solid var(--control-borderColor-emphasis);
  border-radius: var(--borderRadius-small);
}
.adofix-reviewed .adofix-reviewed-box .octicon { color: var(--control-checked-fgColor-rest); visibility: hidden; }
.adofix-reviewed[aria-checked="true"] .adofix-reviewed-box {
  background: var(--control-checked-bgColor-rest);
  border-color: var(--control-checked-borderColor-rest);
}
.adofix-reviewed[aria-checked="true"] .adofix-reviewed-box .octicon { visibility: visible; }
.adofix-reviewed-label { font-weight: var(--base-text-weight-normal); }
.adofix-reviewed.adofix-busy { cursor: progress; opacity: 0.6; }
`;

/** The stacked card's own collapse chevron (verified live 2026-08-19). */
const SECTION_EXPAND_SELECTOR = ".bolt-card-expand-button";

// Display state comes from the shared live slot in pr/reviewed-data.

let currentRef: PrRef | null = null;
let toggleBusy = false;

// ---- header checkboxes ------------------------------------------------------

function syncBox(box: HTMLElement, reviewed: boolean): void {
  box.setAttribute("aria-checked", String(reviewed));
  box.title = reviewed
    ? "Reviewed — click to unmark (synced with the file tree)"
    : "Mark file as reviewed (synced with the file tree)";
}

async function toggleReviewed(section: HTMLElement, box: HTMLElement): Promise<void> {
  if (toggleBusy) return;
  const path = sectionFilePath(section);
  if (!path) return;
  toggleBusy = true;
  box.classList.add("adofix-busy");
  try {
    const wasReviewed = box.getAttribute("aria-checked") === "true";
    const clicked = currentRef ? await clickTreeCheckbox(refKey(currentRef), path) : false;
    if (!clicked) {
      showToast("Couldn't reach this file's tree row to mark it reviewed");
      return;
    }
    syncBox(box, !wasReviewed); // optimistic; the settle re-apply confirms
    // Patch the shared set so settle re-applies don't flicker the box back
    // while the refetch is in flight, then resync with the server.
    if (currentRef) patchViewed(currentRef, path, !wasReviewed);
    // GH-style drawer: reviewed collapses the file's card, unmarking reopens.
    const expand = safeQuery<HTMLElement>(SECTION_EXPAND_SELECTOR, section);
    const expanded = expand?.getAttribute("aria-expanded") === "true";
    if (!wasReviewed && expanded) expand?.click();
    else if (wasReviewed && expand && !expanded) expand.click();
  } finally {
    box.classList.remove("adofix-busy");
    toggleBusy = false;
  }
}

export const prReviewed: Feature = {
  id: FEATURE_ID,
  areas: ["repos-pr"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const ref = prRefFromRoute(route);
    if (!ref) return;
    currentRef = ref;
    const sections = safeQueryAll<HTMLElement>(DIFF_SELECTORS.fileSection);
    if (sections.length === 0) return;
    const viewed = viewedState(ref, () => this.apply(route));
    const rendered = mapTreeFiles();
    let adorned = 0;
    for (const section of sections) {
      const host = safeQuery<HTMLElement>(".justify-end", section);
      const path = sectionFilePath(section);
      if (!host || !path) continue;
      let box = host.querySelector<HTMLButtonElement>(".adofix-reviewed");
      if (!box) {
        box = document.createElement("button");
        box.type = "button";
        box.className = "adofix-reviewed gh-btn gh-btn-sm";
        box.setAttribute("role", "checkbox");
        const inner = document.createElement("span");
        inner.className = "adofix-reviewed-box";
        inner.appendChild(octicon("check", 12));
        const labelEl = document.createElement("span");
        labelEl.className = "adofix-reviewed-label";
        labelEl.textContent = "Reviewed";
        box.append(inner, labelEl);
        const ownBox = box;
        box.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          void toggleReviewed(section, ownBox);
        });
        host.insertBefore(box, host.firstChild);
        adorned++;
      }
      // Rendered tree rows are live truth; the fetched set covers the rest.
      const live = rendered.get(path);
      syncBox(box, live ? live.reviewed : (viewed?.has(path) ?? false));
    }
    if (adorned > 0) log(FEATURE_ID, `header checkboxes adorned: ${adorned}`);
  },
};
