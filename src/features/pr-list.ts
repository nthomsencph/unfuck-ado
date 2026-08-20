import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { ACCENT, injectStyleOnce } from "../core/dom";
import { fetchCurrentUserId } from "./pr/reviewer-api";
import { fetchActivePrs, ownershipMap, type Ownership } from "./pr/list-api";

/**
 * GitHub-style restyle of the PR list page (spec:
 * docs/specs/2026-08-20-pr-list-design.md). Row/material selectors verified
 * live 2026-08-20 (.repos-pr-list / .repos-pr-section-card /
 * .repos-pr-listing-filterbar exist ONLY on the list page, so those rules
 * are inert on PR detail routes). The header-consolidation rules target
 * generic bolt chrome (.bolt-header, .bolt-tabbar) that every hub reuses,
 * so they are gated behind a data-adofix-prlist attribute on <html> —
 * which is why areas is "*": the attribute must clear when navigating to
 * ANY other page, including other hubs where apply() would otherwise
 * never run (the backlog-toolbar precedent).
 */
const ATTR = "data-adofix-prlist";

export const prList: Feature = {
  id: "pr-list",
  areas: "*",
  apply(route: Route): void {
    const onList = route.area === "repos-pr" && route.id === null;
    document.documentElement.toggleAttribute(ATTR, onList);
    injectStyleOnce("pr-list", CSS);
    if (!onList) return;
    // The Mine view is retired: bare /pullrequests defaults to it, so both
    // land on Active instead (the hidden Mine tab still takes .click()).
    if (shouldRedirectToActive(location.search))
      document.querySelector<HTMLElement>("#__bolt-tab-active")?.click();
    sweepMetaLines(document);
    tintOwnership(route);
  },
};

/*
 * "Mine" tinting, the Mine view's replacement: rows the user authored or
 * reviews get an accent wash (author stronger than reviewer). One fetch per
 * repo per page load, success and failure both cached until reload (the
 * pr-checks precedent); the fetch targets active PRs, so Completed/
 * Abandoned rows simply never match. Rows are tagged with a data attribute
 * the settle re-apply repairs after React re-renders, like the meta sweep.
 */
let ownershipSlot: {
  key: string;
  map: ReadonlyMap<number, Ownership> | null;
  pending: boolean;
} | null = null;

function tintOwnership(route: Route): void {
  const { org, project, repo } = route;
  if (!org || !project || !repo) return;
  const key = `${org}/${project}/${repo}`;
  if (!ownershipSlot || ownershipSlot.key !== key)
    ownershipSlot = { key, map: null, pending: false };
  const slot = ownershipSlot;
  if (slot.map) {
    sweepOwnership(document, slot.map);
    return;
  }
  if (slot.pending) return;
  slot.pending = true;
  void (async () => {
    const [myId, prs] = await Promise.all([
      fetchCurrentUserId(org),
      fetchActivePrs({ org, project, repo }),
    ]);
    slot.map = myId && prs.ok ? ownershipMap(prs.value, myId) : new Map();
    sweepOwnership(document, slot.map);
  })();
}

/** Tags every list row with its ownership; clears rows that lost it. */
export function sweepOwnership(root: ParentNode, map: ReadonlyMap<number, Ownership>): void {
  const rows = root.querySelectorAll<HTMLElement>('.repos-pr-list a[href*="/pullrequest/"]');
  for (const row of rows) {
    const match = /\/pullrequest\/(\d+)/.exec(row.getAttribute("href") ?? "");
    const rel = match ? map.get(Number(match[1])) : undefined;
    if (rel) row.setAttribute("data-adofix-mine", rel);
    else row.removeAttribute("data-adofix-mine");
  }
}

/**
 * True when the list URL resolves to the retired Mine view: an explicit
 * `_a=mine` or no `_a` at all (ADO's default view is Mine). Any other
 * explicit view is respected.
 */
export function shouldRedirectToActive(search: string): boolean {
  const view = new URLSearchParams(search).get("_a");
  return view === null || view === "mine";
}

/**
 * Meta-line rewrite: "{Display Name} request !{id} into {branch}" →
 * "!{id} · {FirstName} · into {branch}". Pure function over the leading
 * text-node values of the meta span; returns null when the shape doesn't
 * match (localized UI, ADO update, already rewritten) so the sweep degrades
 * to a no-op, never a mangled line. Idempotence falls out: after a rewrite
 * no node equals " request !".
 */
export function rewriteMetaValues(values: readonly string[]): string[] | null {
  const idx = values.indexOf(" request !");
  if (idx < 1) return null;
  const name = values[idx - 1]?.trim();
  const id = values[idx + 1];
  if (!name || !id || !/^\d+$/.test(id) || values[idx + 2] !== " into ") return null;
  const out = [...values];
  out[idx - 1] = `!${id}`;
  out[idx] = " · ";
  out[idx + 1] = name.split(/\s+/)[0]!;
  out[idx + 2] = " · into ";
  return out;
}

/**
 * Applies rewriteMetaValues to every PR-list row's meta span. nodeValue
 * writes only — no structural DOM change for React to fight; the registry's
 * settle re-apply repairs any React re-render that restores the original.
 */
export function sweepMetaLines(root: ParentNode): void {
  const lines = root.querySelectorAll<HTMLElement>(
    '.repos-pr-list a[href*="/pullrequest/"] .secondary-text.body-s > span'
  );
  for (const line of lines) {
    const textNodes: Text[] = [];
    for (const node of line.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) break; // leading text run only
      textNodes.push(node as Text);
    }
    const next = rewriteMetaValues(textNodes.map((t) => t.nodeValue ?? ""));
    if (!next) continue;
    textNodes.forEach((t, i) => {
      if (t.nodeValue !== next[i]) t.nodeValue = next[i]!;
    });
  }
}

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

/*
 * Header consolidation (verified live 2026-08-20): title row, tab bar and
 * filter bar merge into ONE bar — tabs left, filters right-packed, then the
 * native filter toggle and New PR button. The stack is .bolt-header (59px,
 * title + right commandbar) → .bolt-tabbar (48px) → the filter wrapper
 * (67px, present only while toggled on) → the list card, all flex children
 * of .bolt-page. The title text is redundant with the breadcrumb and hides;
 * the commandbar keeps the row and right-aligns via margin-left:auto (the
 * hidden title area was its flex-grow spacer). Tabbar and wrapper lift onto
 * the header row with negative margins as click-through overlays:
 * pointer-events none on the containers, auto on the interactive children.
 * z-index 4 is load-bearing — the header is a FLEX ITEM with z-index: 3
 * (z-index applies to flex items even at position:static), so the lifted
 * bars must out-stack it or every click lands on the header. The Mine tab
 * hides (stable bolt id); the redirect above covers direct URLs.
 */
[${ATTR}] .bolt-header-title-area {
  display: none !important;
}
[${ATTR}] .bolt-header .bolt-header-commandbar {
  margin-left: auto !important;
}
[${ATTR}] #__bolt-tab-mine {
  display: none !important;
}
[${ATTR}] .bolt-tabbar {
  background: transparent !important;
  position: relative !important;
  z-index: 4 !important;
  margin-top: -55px !important;
  padding-right: 220px !important;
  pointer-events: none !important;
}
[${ATTR}] .bolt-tabbar .bolt-tabbar-tabs,
[${ATTR}] .bolt-tabbar .bolt-header-commandbar {
  pointer-events: auto !important;
}
/* The filter-bar lift needs the full row's width to clear the tabs; below
   1400px it stays a second row (the tabbar lift above still applies). */
@media (min-width: 1400px) {
  [${ATTR}] .page-content-left.page-content-right.page-content-top {
    margin-top: -57px !important;
    position: relative !important;
    z-index: 4 !important;
    pointer-events: none !important;
  }
}
[${ATTR}] .repos-pr-listing-filterbar .vss-FilterBar--list {
  justify-content: flex-end !important;
  padding-right: 260px !important;
  pointer-events: none !important;
}
[${ATTR}] .repos-pr-listing-filterbar .vss-FilterBar--item,
[${ATTR}] .repos-pr-listing-filterbar .vss-FilterBar--right-items {
  pointer-events: auto !important;
}
[${ATTR}] .repos-pr-listing-filterbar .vss-FilterBar--item-keyword-container {
  max-width: 215px !important;
}

/* "Mine" tinting (the Mine view's replacement): authored rows wash stronger
   than reviewer-assigned ones; hover variants keep the hover feedback
   (these land after the generic hover rule, so they need their own). */
[${ATTR}] a.bolt-table-row[data-adofix-mine="author"] {
  background: color-mix(in srgb, ${ACCENT} 10%, transparent) !important;
}
[${ATTR}] a.bolt-table-row[data-adofix-mine="author"]:hover {
  background: color-mix(in srgb, ${ACCENT} 14%, transparent) !important;
}
[${ATTR}] a.bolt-table-row[data-adofix-mine="reviewer"] {
  background: color-mix(in srgb, ${ACCENT} 5%, transparent) !important;
}
[${ATTR}] a.bolt-table-row[data-adofix-mine="reviewer"]:hover {
  background: color-mix(in srgb, ${ACCENT} 9%, transparent) !important;
}
`;
