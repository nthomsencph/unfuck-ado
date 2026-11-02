/*
 * One GitHub comment look for every comment ADO renders (user 2026-11-02:
 * "the same comment UI reused both here and on PR threads"). Work item
 * discussion comments and PR thread comments are different React trees of
 * the same shape — avatar column, then a header holding [author + date]
 * and [actions], then the body — so each feature passes its selectors and
 * gets identical rules: avatar 24px with an 8px gap, the header one
 * centered row, author semibold, the date muted, small and RIGHT-aligned
 * (pushed against the actions), the body 8px below. CSS only: the nodes
 * are React-owned (D41).
 */
export interface CommentDom {
  /** The comment's own surface; omitted where a card already is (PR threads). */
  box?: string;
  /** The avatar coin, where ADO's own margins need replacing by the 8px gap. */
  avatar?: string;
  /** Row holding the author group and the actions group. */
  header: string;
  /** The author + date group. */
  meta: string;
  author: string;
  date: string;
  actions: string;
}

export function commentCss(d: CommentDom): string {
  const box = d.box
    ? `${d.box} {
  background: var(--bgColor-muted) !important;
  border: var(--borderWidth-default) solid transparent !important;
  border-radius: var(--borderRadius-medium) !important;
  box-shadow: none !important;
  padding: 16px !important;
}
`
    : "";
  const avatar = d.avatar
    ? `${d.avatar} {
  margin: 0 8px 0 0 !important;
}
`
    : "";
  return `${box}${avatar}${d.header} {
  display: flex !important;
  align-items: center !important;
  gap: 8px;
  min-height: 24px;
  margin: 0 0 8px !important;
}
${d.meta} {
  display: flex !important;
  align-items: baseline !important;
  flex: 1 1 auto !important;
  min-width: 0;
  max-width: none !important; /* ADO caps the work item's at 85% */
  margin: 0 !important;
}
${d.author} {
  margin: 0 !important;
  padding: 0 !important;
  font-size: var(--text-body-size-medium) !important;
  font-weight: var(--base-text-weight-semibold) !important;
  line-height: var(--text-body-lineHeight-medium) !important;
  color: var(--fgColor-default) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
${d.date} {
  margin: 0 0 0 auto !important;
  padding-left: 8px !important;
  flex-shrink: 0;
  font-size: var(--text-body-size-small) !important;
  line-height: var(--text-body-lineHeight-medium) !important;
  color: var(--fgColor-muted) !important;
  white-space: nowrap;
}
${d.date} :is(a, span, time) {
  color: inherit !important;
  text-decoration: none !important;
}
${d.actions} {
  flex: 0 0 auto !important;
  margin: 0 !important;
}
`;
}
