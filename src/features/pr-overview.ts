import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";

/**
 * PR Overview restructuring — behavioral CSS, not density (carved out of
 * chrome.css 2026-08-19; selector-disjoint from what remains there): the
 * unified card theme, timeline entries flattened to feed lines, reviewers
 * merged into one list, and the discussion feed mirrored oldest-first.
 */
export const prOverview: Feature = {
  id: "pr-overview",
  areas: ["repos-pr"],
  apply(): void {
    injectStyleOnce("pr-overview", CSS);
  },
};

const CSS = `
/*
 * PR Overview: unified card theme (selectors verified live 2026-08-14 on PR
 * 6982). ADO paints every overview card with a depth-8 shadow and 4px
 * corners, and slices them with separator hairlines and 1px-outlined nested
 * boxes. Restyled as GitHub's Conversation-tab boxes: page-colored gh-Box
 * material (1px default border, 6px corners, no shadow — the heavy-shadow
 * cards are retired, spec 2026-11-02); chrome dividers go — icons, author
 * rows and spacing already group content — and nested boxes become muted
 * wells. ADO renders these cards in React, so the gh-Box look is applied by
 * CSS rather than by adding classes React would strip.
 * Scope: .shadow-padding is the Overview content column and exists ONLY
 * there — the Files view has none (verified live 2026-08-14), so the tuned
 * diff cards are untouched. Markdown-authored borders inside comments (<hr>,
 * tables) carry no bolt-* classes and are deliberately left alone.
 */
.repos-pr-details-page .shadow-padding .bolt-card {
  background: var(--bgColor-default) !important;
  border: var(--borderWidth-default) solid var(--borderColor-default) !important;
  box-shadow: none !important;
  border-radius: var(--borderRadius-medium) !important;
}
.repos-pr-details-page .shadow-padding .separator-line-bottom {
  border-bottom-color: transparent !important;
}
.repos-pr-details-page .shadow-padding .separator-line-top {
  border-top-color: transparent !important;
}
/* Reply separators inside discussion threads and row separators inside the
   commit-list / checks tables — author rows and spacing already do the work. */
.repos-pr-details-page .shadow-padding .repos-discussion-comment {
  border-bottom-color: transparent !important;
}
.repos-pr-details-page .shadow-padding .bolt-card .bolt-table-cell {
  border-top-color: transparent !important;
}
/* File-anchored comment cards (verified live 2026-08-17 on PR 7033): the
   file-path header becomes GitHub's review-thread Box-header — muted fill,
   default-border bottom edge, top corners following the card's. The code
   preview's own top border (.comment-file-diff-container) goes: the header
   edge already fences it. The blue .diff-comment underline marking the
   commented span is functional and stays. */
.repos-pr-details-page .shadow-padding .comment-file-header {
  background: var(--bgColor-muted) !important;
  border-bottom: var(--borderWidth-default) solid var(--borderColor-default) !important;
  border-radius: var(--borderRadius-medium) var(--borderRadius-medium) 0 0 !important;
}
.repos-pr-details-page .shadow-padding .comment-file-diff-container {
  border-top-color: transparent !important;
}
/* Nested boxes (checks, merge commit) as GitHub's muted wells: the
   --bgColor-muted fill with a muted hairline, 6px like every Box. */
.repos-pr-details-page .shadow-padding .status-details-container {
  border: var(--borderWidth-default) solid var(--borderColor-muted) !important;
  background: var(--bgColor-muted) !important;
  border-radius: var(--borderRadius-medium) !important;
}
/*
 * The right sidebar's sections (Reviewers, Tags, Work items) stay ADO's
 * plain transparent columns, flat against the page (card-ified 0.8.2,
 * reverted 2026-08-17 on user request — flat reads calmer next to the main
 * column's cards). Only the tag picker's input outline goes: the pills and
 * the + affordance carry the interaction, the box just added chrome.
 */
.repos-pr-details-page .repos-overview-right-pane .bolt-tag-picker {
  border-color: transparent !important;
}

/*
 * Non-comment feed entries ("pushed n commits" and other bolt-table-cards in
 * timeline cells) flatten against the page: conversations are cards, events
 * are just feed lines (user request 2026-08-17). The merge-status card at
 * the top is a bolt-table-card too but lives OUTSIDE .bolt-timeline-cell, so
 * it keeps the card treatment; so do .repos-comment-card and the no-padding
 * file-anchored thread cards.
 */
.repos-pr-details-page .shadow-padding .bolt-timeline-cell .bolt-table-card {
  background: transparent !important;
  box-shadow: none !important;
}

/*
 * Reviewers merged into one list (verified live 2026-08-17 on PR 6982).
 * ADO splits the card into .pr-required-reviewers-section and
 * .pr-optional-reviewers-section, each with a group header and an empty-state
 * well (.repos-pr-no-items-well). Merged: headers go, an empty group
 * disappears entirely when the other has reviewers (required stays first —
 * that is its DOM order), and each row is tagged in its subtitle instead —
 * "Approved · Required" when ADO renders a status line, a synthesized
 * "Required"/"Optional" line when it does not. Pure CSS via :has(); no DOM
 * surgery for React to fight. When BOTH groups are empty the sections are
 * left alone (ADO's own empty wells still render, minus the headers).
 */
.pr-required-reviewers-section > .body-s.secondary-text.font-weight-semibold,
.pr-optional-reviewers-section > .body-s.secondary-text.font-weight-semibold {
  display: none;
}
.pr-required-reviewers-section:not(:has(.repos-reviewer)):has(~ .pr-optional-reviewers-section .repos-reviewer),
.pr-required-reviewers-section:has(.repos-reviewer) ~ .pr-optional-reviewers-section:not(:has(.repos-reviewer)) {
  display: none;
}
.pr-required-reviewers-section .repos-reviewer .flex-column > .body-s.secondary-text::after {
  content: " · Required";
}
.pr-optional-reviewers-section .repos-reviewer .flex-column > .body-s.secondary-text::after {
  content: " · Optional";
}
.pr-required-reviewers-section .repos-reviewer > .flex-column:not(:has(> .body-s.secondary-text))::after,
.pr-optional-reviewers-section .repos-reviewer > .flex-column:not(:has(> .body-s.secondary-text))::after {
  font-size: var(--text-body-size-small);
  color: var(--fgColor-muted);
}
.pr-required-reviewers-section .repos-reviewer > .flex-column:not(:has(> .body-s.secondary-text))::after {
  content: "Required";
}
.pr-optional-reviewers-section .repos-reviewer > .flex-column:not(:has(> .body-s.secondary-text))::after {
  content: "Optional";
}

/*
 * PR Overview: discussion feed oldest-first, GitHub-style (verified live
 * 2026-08-17 on PR 6982). ADO renders newest-first; column-reverse mirrors
 * it visually without touching React's DOM. The rows are single-cell table
 * rows, so flattening the row-group to flex and rows to block loses nothing.
 * The composer is the DOM-first row and therefore lands at the bottom — also
 * GitHub-style. Spine caps: the composer's below-icon segment and the
 * DOM-last row's above-icon segment dangle once mirrored; hide them.
 *
 * SCOPE IS LOAD-BEARING: .can-add-comments is what separates the Overview
 * feed from the Updates tab's feed. The Overview feed is NOT virtualized
 * (all rows render; end spacers stay 0px under scroll — verified live). The
 * Updates feed (no .can-add-comments) IS virtualized — its 748px end spacer
 * lands on top when reversed and shoves every row below the fold, and the
 * virtualizer mounts rows assuming DOM order == visual order. Never apply
 * this to a virtualized bolt list.
 */
.repos-pr-details-page .activity-feed-list.can-add-comments > .relative {
  display: flex;
  flex-direction: column-reverse;
}
.repos-pr-details-page .activity-feed-list.can-add-comments > .relative > * {
  display: block;
}
.repos-pr-details-page .activity-feed-list.can-add-comments .bolt-timeline-first-row .bolt-timeline-icon-suffix {
  border-left-color: transparent !important;
}
.repos-pr-details-page .activity-feed-list.can-add-comments .bolt-timeline-last-row .bolt-timeline-icon-prefix {
  border-left-color: transparent !important;
}
`;
