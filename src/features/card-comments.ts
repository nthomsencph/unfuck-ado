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
      // Upper right CORNER of the card (user 2026-08-18, third take):
      // absolutely anchored — flex-end placement stopped short of the
      // corner because the hover-only ⋮ menu reserves it. The chip
      // fades on card hover so the ⋮ takes over.
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
  position: absolute;
  /* aligned with the ID line: .wit-card .card-content pads 20px 14px
     (density.css); the 20px Counter centers on the ~19px id text as-is
     (the old 16px glyph chip needed +2px — user screenshot 2026-08-18:
     top:10px floated above the line) */
  top: 20px;
  right: 14px;
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
