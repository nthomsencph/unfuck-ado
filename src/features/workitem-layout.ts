import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";

/**
 * Work item form restructured GitHub-issue-style (user request 2026-08-18):
 * one readable main column (Description + Discussion) and one narrow right
 * rail, capped and centered on wide screens.
 *
 * ADO's own body layout is a CSS grid (.work-item-grid, natively
 * "852px 410px 410px") with exactly three children: the first section
 * (Description), the discussion, and .work-item-form-right — a flex-ROW
 * holding the two field columns. The restructure is therefore pure CSS:
 * regrid to `minmax(0,1fr) 320px`, stack the right sections vertically,
 * and reassign grid areas (verified live 2026-08-18 on the dialog and the
 * full-page form — same DOM).
 *
 * GH idioms on top:
 *  - discussion mirrored oldest-first with the composer LAST — the same
 *    column-reverse trick as the PR Overview feed; the comment list is a
 *    plain flat container (composer + .comment-item siblings, NOT
 *    virtualized);
 *  - the Description editor expands to its content in view mode (ADO caps
 *    the rooster editor at 460/500px with an inner scrollbar); the cap
 *    stays while EDITING;
 *  - noise removed: the Deployment group (Releases are unused) and the
 *    Development "link a commit" zero-state hint box — GH sidebars list,
 *    they don't teach. Hidden fields stay editable via Customize/other
 *    views; comment cards join the card material.
 */
export const workitemLayout: Feature = {
  id: "workitem-layout",
  areas: "*",
  apply(): void {
    injectStyleOnce("workitem-layout", CSS);
  },
};

const CSS = `
/* One main column + a 320px rail, capped and centered like a GH issue. */
.work-item-grid {
  grid-template-columns: minmax(0, 1fr) 320px !important;
  max-width: 1250px !important;
  margin: 0 auto !important;
}
.work-item-form-first-section {
  grid-area: 1 / 1 / 2 / 2 !important;
}
.work-item-form-discussion {
  grid-area: 2 / 1 / 3 / 2 !important;
}
.work-item-form-right {
  grid-area: 1 / 2 / 3 / 3 !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
}
.work-item-form-right .work-item-form-section {
  width: 100% !important;
  max-width: none !important;
  flex: 0 0 auto !important;
}
/* Rail noise out. */
.work-item-form-group:has([class*="deployments"]) {
  display: none !important;
}
.links-control-zero-state {
  display: none !important;
}
/* Discussion GH-style: comments oldest-first, composer at the bottom. */
.work-item-form-discussion .work-item-form-collapsible-section-content {
  display: flex;
  flex-direction: column-reverse;
  gap: 12px;
}
.comment-item.displayed-comment {
  background: var(--adofix-card, #252423) !important;
  border-radius: var(--adofix-radius, 6px) !important;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.45),
    0 2px 10px rgba(0, 0, 0, 0.25) !important;
}
/* Description expands to its content in view mode (native cap 460/500px
   with an inner scrollbar); editing keeps ADO's cap. */
.work-item-form-page .html-editor.auto-grow .rooster-wrapper {
  max-height: none !important;
}
.work-item-form-page .html-editor.auto-grow .rooster-editor.view-mode {
  max-height: none !important;
}
`;
