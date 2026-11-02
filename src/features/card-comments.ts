import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { getWorkItems, type ProjectRef } from "../core/api";
import { injectStyleOnce } from "../core/dom";
import { octicon } from "../core/primer";
import { createFetchCache } from "../core/fetch-cache";
import { log } from "../core/log";

/**
 * Comment counts on board cards (user request 2026-08-18): every .wit-card
 * (sprint taskboard + kanban) whose first line carries a numeric id gets a
 * comment-octicon + count chip right-aligned on that line — only when n > 0
 * (GitHub Projects' card comment indicator: muted icon, Counter count).
 *
 * ADO renders no comment info on cards, so counts come from REST:
 * `_apis/wit/workitems?ids=…&fields=System.CommentCount` (batched, the
 * documented 200-id cap per call). Counts cache per session; ids fetch at
 * most once, and cards mounting later (scroll, drag, column changes) are
 * picked up on subsequent settles. Card anatomy (verified live
 * 2026-08-18): first line `.flex-row.full-width` >
 * [`.rhythm-horizontal-8` (type icon, id span
 * `.font-weight-semibold.selectable-text`, title link),
 * `.card-context-menu`] — the chip inserts before the context menu.
 */
export const cardComments: Feature = {
  id: "card-comments",
  // Cards exist only on boards surfaces (_boards, _backlogs, _sprints).
  areas: ["boards"],
  apply(route: Route): void {
    injectStyleOnce("card-comments", CSS);
    enhance(route.org && route.project ? { org: route.org, project: route.project } : null);
  },
};

const FEATURE_ID = "card-comments";
const CHIP_CLASS = "adofix-card-comments";
const BATCH = 200;

// id -> comment count. Retry policy: a failed chunk is forgotten so a later
// settle refetches it (counts are worth a second request; see fetch-cache).
const counts = createFetchCache<number, number>({ onFailure: "retry" });

function cardId(card: Element): number | null {
  const el = card.querySelector(".font-weight-semibold.selectable-text");
  const n = Number(el?.textContent?.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fetchCounts(ids: number[], ref: ProjectRef): void {
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = counts.begin(ids.slice(i, i + BATCH));
    if (chunk.length === 0) continue;
    void getWorkItems(ref, chunk, ["System.CommentCount"]).then((res) => {
      if (!res.ok) {
        counts.fail(chunk);
        log(FEATURE_ID, "comment-count fetch failed", res.error.message);
        return;
      }
      for (const item of res.value.value ?? []) {
        const n = item.fields["System.CommentCount"];
        counts.settle(item.id, typeof n === "number" ? n : 0);
      }
      // Deleted/permission-filtered ids never come back — stop retrying.
      for (const id of chunk) {
        if (counts.get(id) === undefined) counts.settle(id, 0);
      }
      render();
    });
  }
}

function render(): void {
  for (const card of document.querySelectorAll(".wit-card")) {
    const id = cardId(card);
    if (id === null) continue;
    const n = counts.get(id);
    const line = card.querySelector(".flex-row.full-width");
    let chip = card.querySelector(`.${CHIP_CLASS}`);
    if (typeof n !== "number" || n === 0 || !line) {
      chip?.remove();
      continue;
    }
    if (!chip) {
      chip = document.createElement("span");
      chip.className = CHIP_CLASS;
      const num = document.createElement("span");
      num.className = "gh-Counter";
      chip.append(octicon("comment"), num);
      // Upper right corner of the card (user 2026-08-18), IN FLOW as the
      // ID line's last flex item: an absolutely anchored chip sat on top
      // of long Kanban titles, which share that line (2026-11-02). The ⋮
      // menu is absolute (live 2026-11-02), so it reserves nothing. The
      // chip fades on card hover so the ⋮ takes over.
      line.append(chip);
    }
    const num = chip.lastElementChild;
    if (num && num.textContent !== String(n)) num.textContent = String(n);
  }
}

/** MUST stay idempotent — runs on every route change and DOM settle. */
function enhance(ref: ProjectRef | null): void {
  const cards = document.querySelectorAll(".wit-card");
  if (cards.length === 0) return;
  const unknown: number[] = [];
  for (const card of cards) {
    const id = cardId(card);
    if (id !== null && !counts.known(id)) unknown.push(id);
  }
  if (unknown.length > 0 && ref) fetchCounts(unknown, ref);
  render();
}

const CSS = `
.wit-card {
  position: relative;
}
.${CHIP_CLASS} {
  /* The ID line's last flex item: pushed to the right edge, and the
     title beside it shrinks/wraps instead of running underneath. The
     -2px block margins keep the 20px Counter from growing the 16px line. */
  flex-shrink: 0;
  align-self: flex-start;
  margin: -2px 0 -2px auto;
  padding-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--fgColor-muted);
  font-size: var(--text-body-size-small);
}
/* The hover-only ⋮ menu owns the corner while the pointer is on the card. */
.wit-card:hover .${CHIP_CLASS} {
  opacity: 0;
}
`;
