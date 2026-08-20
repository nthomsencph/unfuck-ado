import type { Feature } from "../core/registry";
import { ACCENT, injectStyleOnce } from "../core/dom";

/**
 * GitHub-style restyle of the PR list page (spec:
 * docs/specs/2026-08-20-pr-list-design.md). Pure CSS in this first cut; the
 * meta-line text sweep lands separately. Selectors verified live 2026-08-20
 * (.repos-pr-list / .repos-pr-section-card / .repos-pr-listing-filterbar
 * exist ONLY on the list page, so the sheet is inert on PR detail routes).
 */
export const prList: Feature = {
  id: "pr-list",
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce("pr-list", CSS);
  },
};

const CSS = `
/* Card material — the pr-overview card recipe, so list and overview read as
   one theme (the list card is natively a flat full-width slab). Also covers
   the Mine tab's two section cards. */
.repos-pr-section-card.bolt-card {
  background: var(--adofix-card) !important;
  border-radius: var(--adofix-radius) !important;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    0 1px 4px rgba(0, 0, 0, 0.5) !important;
}
/* Filter bar: depth-8 shadow off, flat against the page. */
.repos-pr-listing-filterbar {
  background: transparent !important;
  box-shadow: none !important;
}
/* Row hairlines: bolt-table-show-lines draws cell top borders — soften to a
   GitHub-quiet line. */
.repos-pr-list .bolt-table-cell {
  border-top-color: rgba(128, 128, 128, 0.12) !important;
}
/* Subtle hover tint (rows are <a> elements). */
.repos-pr-list a.bolt-table-row:hover {
  background: rgba(128, 128, 128, 0.06) !important;
}
/* "New activity" left edge in our accent instead of ADO blue. Verified live
   2026-08-20: the marker is a 2px border-left on the row's FIRST spacer cell
   (rgb(82,143,217)) — not on the row, not a pseudo-element. */
.repos-pr-list .bolt-list-row-marked > .bolt-table-spacer-cell:first-child {
  border-left-color: ${ACCENT} !important;
}
/* Author coin 32 → 20px, centered on the title line (title top 11px, height
   17.5px in a 56px row — flex-start + 10px lines the centers up). size32
   appears only on the author cell; reviewer coins are size24 (verified). */
.repos-pr-list .bolt-coin.size32,
.repos-pr-list .bolt-coin.size32 .bolt-coin-content {
  width: 20px !important;
  height: 20px !important;
}
.repos-pr-list a.bolt-table-row > td:nth-child(2) .bolt-table-cell-content {
  align-items: flex-start !important;
}
.repos-pr-list .bolt-coin.size32 {
  margin-top: 10px !important;
}
/* Pills: the state pills (Draft/Declined/Required) are natively "outlined"
   with semantic colors and stay untouched; only the filled "standard" tag
   pills (white 8% slabs) go GitHub-outline. */
.repos-pr-list .bolt-pill.standard {
  background: transparent !important;
  border: 1px solid var(--border-subtle-color, rgba(128, 128, 128, 0.35)) !important;
}
/* Updated column muted — "Updated " is a bare text node in a classless div
   around the <time> span (same shape on notice rows), so the div is the
   muting target. The "n new push/comments" notice line sits above it in the
   .repos-pr-list-updates cell and pops in accent instead. */
.repos-pr-list div:has(> span.text-ellipsis > time.bolt-time-item) {
  color: var(--text-secondary-color, #a19f9d) !important;
}
.repos-pr-list .repos-pr-list-updates .font-weight-semibold {
  color: color-mix(in srgb, ${ACCENT} 70%, var(--text-primary-color, #fff)) !important;
}
`;
