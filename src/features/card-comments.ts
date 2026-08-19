import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";
import { log } from "../core/log";

/**
 * Comment counts on board cards (user request 2026-08-18): every .wit-card
 * (sprint taskboard + kanban) whose first line carries a numeric id gets a
 * "💬-icon n" chip right-aligned on that line — only when n > 0.
 *
 * ADO renders no comment info on cards, so counts come from REST:
 * `_apis/wit/workitems?ids=…&fields=System.CommentCount` (batched, the
 * documented 200-id cap per call). Counts cache per session; ids fetch at
 * most once, and cards mounting later (scroll, drag, column changes) are
 * picked up on subsequent settles. Card anatomy (verified live
 * 2026-08-18): first line `.flex-row.full-width` >
 * [`.rhythm-horizontal-8` (type icon, id span
 * `.font-weight-semibold.selectable-text`, title link),
 * `.card-context-menu`] — the chip inserts before the context menu. The
 * icon reuses ADO's own fabric comment glyph.
 */
export const cardComments: Feature = {
  id: "card-comments",
  areas: "*",
  apply(): void {
    injectStyleOnce("card-comments", CSS);
    enhance();
  },
};

const FEATURE_ID = "card-comments";
const CHIP_CLASS = "adofix-card-comments";
const BATCH = 200;

/** id -> comment count; "pending" while a batch containing it is in flight. */
const counts = new Map<number, number | "pending">();

function restBase(): string | null {
  const seg = location.pathname.split("/").filter(Boolean);
  return seg.length >= 2 ? `${location.origin}/${seg[0]}/${seg[1]}` : null;
}

function cardId(card: Element): number | null {
  const el = card.querySelector(".font-weight-semibold.selectable-text");
  const n = Number(el?.textContent?.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fetchCounts(ids: number[]): void {
  const base = restBase();
  if (!base) return;
  for (const id of ids) counts.set(id, "pending");
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    fetch(
      `${base}/_apis/wit/workitems?ids=${chunk.join(",")}&fields=System.CommentCount&api-version=7.1`,
      { headers: { Accept: "application/json" }, credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { value?: Array<{ id: number; fields?: Record<string, number> }> }) => {
        for (const item of j.value ?? []) {
          counts.set(item.id, item.fields?.["System.CommentCount"] ?? 0);
        }
        // Deleted/permission-filtered ids never come back — stop retrying.
        for (const id of chunk) {
          if (counts.get(id) === "pending") counts.set(id, 0);
        }
        render();
      })
      .catch((err) => {
        // Forget the chunk so a later settle can retry.
        for (const id of chunk) counts.delete(id);
        log(FEATURE_ID, "comment-count fetch failed", err);
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
      const icon = document.createElement("span");
      icon.className = "fabric-icon ms-Icon--Comment";
      chip.append(icon, document.createElement("span"));
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
function enhance(): void {
  const cards = document.querySelectorAll(".wit-card");
  if (cards.length === 0) return;
  const unknown: number[] = [];
  for (const card of cards) {
    const id = cardId(card);
    if (id !== null && !counts.has(id)) unknown.push(id);
  }
  if (unknown.length > 0) fetchCounts(unknown);
  render();
}

const CSS = `
.wit-card {
  position: relative;
}
.${CHIP_CLASS} {
  position: absolute;
  /* aligned with the ID line: .wit-card .card-content pads 20px 14px
     (chrome.css), +2px optically centers the 16px chip on the ~19px id
     text (user screenshot 2026-08-18: top:10px floated above the line) */
  top: 22px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-secondary-color, #a19f9d);
  font-size: 12px;
}
.${CHIP_CLASS} .fabric-icon {
  font-size: 12px;
}
/* The hover-only ⋮ menu owns the corner while the pointer is on the card. */
.wit-card:hover .${CHIP_CLASS} {
  opacity: 0;
}
`;
