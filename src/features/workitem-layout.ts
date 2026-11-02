import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { getWorkItem, type ProjectRef } from "../core/api";
import { injectStyleOnce, stubHide } from "../core/dom";
import { createFetchCache } from "../core/fetch-cache";
import { log } from "../core/log";
import { commentCss } from "../core/comment";
import { octicon, octiconMask } from "../core/primer";
import {
  DESCRIPTION_HEADER_RE,
  formatCreatedDate,
  groupAction,
  leaf,
  planningKey,
  updatedText,
} from "./workitem/fields";
import { teleport } from "./workitem/teleport";

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
 *    views; comments render as GitHub comment boxes.
 *
 * Second pass (user request 2026-08-18, "not far enough"): Follow button,
 * comment-count link, History/Links tabs and the per-section Maximize
 * toggles removed; every rail property renders as a key: value row; and
 * State/Reason/Area/Iteration/Tags live in an adofix-owned "Details" group
 * at the top of the rail, with Created by / Created fetched via REST (the
 * reason the History tab could go).
 *
 * WHY THE FIELDS ARE REBUILT, NOT MOVED: physically reparenting the
 * React-owned subheader controls into the rail works — until any tab
 * switch re-mounts the tab content, which destroys the adopted nodes
 * WITHOUT React re-creating them (its virtual DOM believes they still
 * exist; verified live 2026-08-18 — the fields are simply gone until
 * reload). So the native controls stay exactly where React put them,
 * stub-hidden (zero-size, NOT display:none), our rows render their
 * values, and clicking a row TELEPORTS the hidden native control to the
 * row's rect (inline position:fixed, invisible) and clicks it — ADO's own
 * edit callout opens anchored at the row. position:fixed escapes the
 * zero-size ancestor's clipping. The stub styles restore on the next
 * mousedown anywhere.
 */
export const workitemLayout: Feature = {
  id: "workitem-layout",
  // "*" is deliberate: work item DIALOGS open on any hub (boards, queries,
  // dashboards) — the form-DOM checks in enhance() are the real gate.
  areas: "*",
  init(): void {
    // Resize reflows the header without DOM mutations — the promoted
    // State field's measured position must follow.
    window.addEventListener("resize", () => {
      window.requestAnimationFrame(() => {
        placeHeaderControls();
        placeStateField();
      });
    });
  },
  apply(route: Route): void {
    injectStyleOnce("workitem-layout", CSS);
    // Route.id is the work item (full page /_workitems/edit/{id} or dialog
    // ?workitem={id}) everywhere except repos-pr, where it is the PR number.
    currentId = route.area !== "repos-pr" && route.id ? Number(route.id) : null;
    enhance(route.org && route.project ? { org: route.org, project: route.project } : null);
  },
};

const FEATURE_ID = "workitem-layout";
const HOST_ID = "adofix-wi-details";

/* Coupled geometry, named once and interpolated into the CSS below. */
/** Invariant metadata-rail width — the main column gives way, never this. */
const RAIL_WIDTH = 320;
/** GH-issue-like cap for the whole form (header + grid). */
const FORM_MAX_WIDTH = 1250;
/** Bolt control height the JS placement math centers against (see the
    .adofix-wi-state-promoted rule — the CSS and the math must agree). */
const CONTROL_HEIGHT = 32;
/** The promoted State field's box; the title row reserves its width + 20. */
const STATE_WIDTH = 190;

/** Work item in view, set per apply() — async fetch guards read it live. */
let currentId: number | null = null;

interface CreatedInfo {
  by: string;
  date: string;
}
const createdCache = createFetchCache<number, CreatedInfo>();

function ensureCreated(id: number, ref: ProjectRef): void {
  createdCache.load(
    id,
    async () => {
      const res = await getWorkItem(ref, id, ["System.CreatedBy", "System.CreatedDate"]);
      if (!res.ok) {
        log(FEATURE_ID, "created-by fetch failed", res.error.message);
        return null;
      }
      const fields = res.value.fields;
      const by =
        (fields["System.CreatedBy"] as { displayName?: string } | undefined)?.displayName ?? "?";
      const date = formatCreatedDate(fields["System.CreatedDate"] as string | undefined);
      return { by, date };
    },
    // The fetch resolves between settles — patch the mounted rows now.
    () => renderCreated(id)
  );
}

function renderCreated(id: number): void {
  if (currentId !== id) return;
  const info = createdCache.get(id);
  if (!info) return;
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  const by = host.querySelector('[data-adofix-kv="created-by"] .adofix-wi-kv-value');
  const at = host.querySelector('[data-adofix-kv="created-at"] .adofix-wi-kv-value');
  if (by) by.textContent = info.by;
  if (at) at.textContent = info.date;
}

interface DetailRow {
  key: string;
  label: string;
  value: string;
  dotColor?: string;
  native?: HTMLElement;
  /** Tag names — rendered as a block row (label line, pills below). */
  tags?: string[];
}

/** The subheader's two field columns (everything but the tabbar). */
function subheaderColumns(): HTMLElement[] {
  const sub = document.querySelector(".work-item-form-subheader");
  return sub
    ? ([...sub.children] as HTMLElement[]).filter(
        (c) => !c.className.includes("wif-tabbar")
      )
    : [];
}

/**
 * Command half: restyle the rail groups by header text (English-UI matches
 * live in workitem/fields) and return the absorbed ones whose fields
 * collectRows will read. Kept apart from collectRows so collecting never
 * hides rendering side effects.
 */
function classifyRailGroups(): HTMLElement[] {
  const absorbed: HTMLElement[] = [];
  for (const group of document.querySelectorAll<HTMLElement>(
    ".work-item-form-right .work-item-form-group"
  )) {
    const label =
      group.querySelector(".work-item-form-collapsible-header")?.textContent?.trim() ?? "";
    switch (groupAction(label)) {
      case "hide":
        group.classList.add("adofix-wi-group-hide");
        break;
      case "links":
        // Related Work / Development: shown even without links (their "+"
        // is the only way to add one — 2026-11-02, D67).
        group.classList.add("adofix-wi-links");
        break;
      case "absorb":
        group.classList.add("adofix-wi-group-absorb");
        absorbed.push(group);
        break;
      case null:
        break;
    }
  }
  return absorbed;
}

/** Query half: read the Details rows from the (already classified) form. */
function collectRows(colA: HTMLElement, colB: HTMLElement, absorbed: HTMLElement[]): DetailRow[] {
  const fieldOf = (col: HTMLElement, i: number): HTMLElement | null =>
    (col.children[i] as HTMLElement | undefined) ?? null;
  const valueOf = (field: HTMLElement | null): string =>
    field?.querySelector("input")?.value ??
    field?.textContent?.trim() ??
    "";

  // State is NOT a row: it lives in the header, left of the assignee
  // (absolutely repositioned from its stub column — see the CSS).
  const reason = fieldOf(colA, 1);
  const area = fieldOf(colB, 0);
  const iteration = fieldOf(colB, 1);

  const rows: DetailRow[] = [
    { key: "reason", label: "Reason", value: valueOf(reason), native: reason ?? undefined },
    { key: "area", label: "Area", value: leaf(valueOf(area)), native: area ?? undefined },
    { key: "iteration", label: "Iteration", value: leaf(valueOf(iteration)), native: iteration ?? undefined },
  ];

  // Absorbed groups' fields join the list row-by-row (teleport-editable);
  // their native groups are zero-size stubs.
  for (const group of absorbed) {
    for (const wrapper of group.querySelectorAll<HTMLElement>(
      ".work-item-form-control-wrapper"
    )) {
      const content = wrapper.querySelector(".work-item-form-control-content-wrapper");
      const labelEl = content?.children[0] ?? null;
      const fieldLabel = labelEl?.textContent?.trim() ?? "";
      if (!fieldLabel) continue;
      const value =
        wrapper.querySelector("input")?.value ??
        (content?.children[1] as HTMLElement | undefined)?.textContent?.trim() ??
        "";
      rows.push({
        key: planningKey(fieldLabel),
        label: fieldLabel,
        value: value || "—",
        native: wrapper,
      });
    }
  }

  const created = currentId !== null ? (createdCache.get(currentId) ?? null) : null;
  rows.push({ key: "created-by", label: "Created by", value: created?.by ?? "…" });
  rows.push({ key: "created-at", label: "Created", value: created?.date ?? "…" });

  // The "Updated by X: 8h ago" line above the (hidden) tab strip becomes an
  // Updated row — read live from the DOM each pass, so it never goes stale.
  const updText = document
    .querySelector(".wif-tabbar-container .secondary-text")
    ?.textContent?.trim();
  if (updText) {
    rows.push({ key: "updated", label: "Updated", value: updatedText(updText) });
  }

  // Tags LAST, as a block (label line, pills below) — inherently a list,
  // not a key: value pair (user 2026-08-18).
  const tagPicker = document.querySelector<HTMLElement>(
    ".work-item-form-header .work-item-tag-picker"
  );
  if (tagPicker) {
    const tags = [...tagPicker.querySelectorAll(".bolt-pill-content, .tag-item")]
      .map((t) => t.textContent?.trim() ?? "")
      .filter(Boolean);
    rows.push({
      key: "tags",
      label: "Tags",
      value: tags.join(", ") || "—",
      tags,
      native: tagPicker,
    });
  }
  return rows;
}

/**
 * The tab strip is hidden, so the content tabs other than Details get icon
 * proxies in the header command bar (Attachments since 2026-08-18; History
 * back on 2026-11-02, after it had been hidden with no way in). Clicking
 * toggles tab <-> Details via the native (hidden, still clickable) tabs.
 * Rebuilt whenever a re-mount drops them; the label (and Attachments'
 * count) refreshes on every pass.
 */
const TAB_PROXIES = [
  { field: "System_History", label: "History", icon: "history", counted: false },
  { field: "System_Attachments", label: "Attachments", icon: "paperclip", counted: true },
] as const;

function ensureTabProxies(): void {
  const bar = document.querySelector<HTMLElement>(".work-item-header-command-bar");
  if (!bar) return;
  for (const tab of TAB_PROXIES) {
    const native = document.querySelector<HTMLElement>(`[id$="-${tab.field}"]`);
    if (!native) continue;
    let btn = bar.querySelector<HTMLButtonElement>(`.adofix-wi-tab-proxy[data-tab="${tab.field}"]`);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      // GitHub's invisible button, like makeToolbarButton's (D47).
      btn.className = "adofix-wi-tab-proxy gh-btn gh-btn-invisible";
      btn.dataset["tab"] = tab.field;
      btn.addEventListener("click", () => {
        const current = document.querySelector<HTMLElement>(`[id$="-${tab.field}"]`);
        if (!current) return;
        if (current.classList.contains("selected")) {
          document
            .querySelector<HTMLElement>('.wif-tabbar [aria-label="Details"]')
            ?.click();
        } else {
          current.click();
        }
      });
      bar.append(btn);
      log(FEATURE_ID, `${tab.label} proxy injected`);
    }
    const count = tab.counted ? (native.textContent?.trim() ?? "") : "";
    const label = `${tab.label}${count ? ` (${count})` : ""}`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    // Octicon + a Counter (GitHub's button-with-count), rebuilt only when
    // the count changes — this runs on every settle.
    if (btn.dataset["count"] !== count || !btn.querySelector(".octicon")) {
      btn.dataset["count"] = count;
      btn.textContent = "";
      btn.append(octicon(tab.icon));
      if (count) {
        const counter = document.createElement("span");
        counter.className = "gh-Counter";
        counter.textContent = count;
        btn.append(counter);
      }
    }
    btn.classList.toggle("adofix-wi-tab-active", native.classList.contains("selected"));
  }
  keepMoreActionsLast(bar);
}

/**
 * ⋮ (More actions) stays the bar's last item (user 2026-11-02): the tab
 * proxies go right before it, in TAB_PROXIES order. Moves nodes only when
 * the order is wrong — this runs on every settle.
 */
function keepMoreActionsLast(bar: HTMLElement): void {
  const more = bar.querySelector<HTMLElement>('button[aria-label="More actions"]');
  if (!more) return;
  const item = more.closest<HTMLElement>(".bolt-expandable-button") ?? more;
  let next: Element = item;
  const proxies = TAB_PROXIES.map((t) =>
    bar.querySelector<HTMLElement>(`.adofix-wi-tab-proxy[data-tab="${t.field}"]`)
  ).filter((b): b is HTMLElement => b !== null);
  for (const btn of proxies.reverse()) {
    if (btn.nextElementSibling !== next) next.before(btn);
    next = btn;
  }
}

/**
 * State lives in the header, left of the assignee (user 2026-08-18) —
 * absolutely positioned from its stub column against .work-item-form-page,
 * with top/left measured from the assignee row's live rect (fixed offsets
 * drift: removing content from a header row changes the row heights).
 */
function placeStateField(): void {
  const header = document.querySelector<HTMLElement>(".work-item-form-header");
  const page = document.querySelector<HTMLElement>(".work-item-form-page");
  const state = document.querySelector<HTMLElement>(
    ".work-item-form-subheader > :first-child > :first-child"
  );
  const row3 = header?.children[2] as HTMLElement | undefined;
  if (!header || !page || !state || !row3) return;
  state.classList.add("adofix-wi-state-promoted");
  // Vertically center on the ASSIGNEE cluster itself (the row's first
  // in-flow child), not the row box — they differ and misaligned.
  const assignee =
    [...row3.children].find(
      (c) => !c.classList.contains("work-item-header-command-bar")
    ) ?? row3;
  const ar = assignee.getBoundingClientRect();
  const r3 = row3.getBoundingClientRect();
  const pr = page.getBoundingClientRect();
  state.style.setProperty(
    "top",
    `${Math.round(ar.top - pr.top + (ar.height - CONTROL_HEIGHT) / 2)}px`
  );
  state.style.setProperty("left", `${Math.round(r3.left - pr.left + 8)}px`);
  fitToText(page, "--adofix-wi-state-w", state, state.querySelector("input"));
  fitToText(
    page,
    "--adofix-wi-assignee-w",
    header.querySelector(".work-item-assignment-dropdown"),
    header.querySelector(".work-item-assignment-dropdown input")
  );
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

/**
 * Sizes `box` to its input's text: State and the assignee are fixed-width
 * fields natively (190px clamp / 270px), which cut "Ready for development"
 * off and left a wide gap after short names (user 2026-11-02). Writes the
 * width as a custom property on `host` for the CSS to use; the box's other
 * content (dot, coin, chevron) is kept as the box-minus-input difference.
 * Re-fits on the input's own edits — a value change is no childList
 * mutation, so the settle pass alone would miss it.
 */
function fitToText(
  host: HTMLElement,
  prop: string,
  box: HTMLElement | null,
  input: HTMLInputElement | null
): void {
  if (!box || !input) return;
  if (!input.dataset["adofixFit"]) {
    input.dataset["adofixFit"] = "1";
    const refit = (): void => placeStateField();
    input.addEventListener("input", refit);
    input.addEventListener("blur", refit);
  }
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return;
  const cs = getComputedStyle(input);
  measureCtx.font = cs.font;
  const text = measureCtx.measureText(input.value || input.placeholder).width;
  // The box's other content (dot, coin, chevron): at every level from the
  // input up to the box, the siblings beside the input's branch plus the
  // parent's padding — measured from the siblings, not as box-minus-input,
  // so the width we set never feeds back into the next fit.
  let other = 0;
  for (let el: Element = input; el !== box && el.parentElement; el = el.parentElement) {
    const parent = el.parentElement;
    const ps = getComputedStyle(parent);
    other += parseFloat(ps.paddingLeft) + parseFloat(ps.paddingRight);
    for (const sib of parent.children) {
      if (sib !== el) other += sib.getBoundingClientRect().width;
    }
  }
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const width = `${Math.ceil(text + pad + other + 4)}px`;
  if (host.style.getPropertyValue(prop) !== width) host.style.setProperty(prop, width);
}

/**
 * The title as wrapping text (user 2026-11-02): ADO's title is a
 * single-line <input>, which can't wrap, so a long title was cut off. An
 * adofix view shows the same text, wrapping; clicking (or tabbing into) it
 * hands over to the real input, which stays in place but visually hidden
 * while not edited — still focusable, still ADO's. The view is appended
 * next to the React-owned field; the settle pass re-adds it after a
 * re-render and re-syncs its text (typing syncs it live).
 */
function ensureWrappingTitle(): void {
  const header = document.querySelector<HTMLElement>(".work-item-form-header");
  const field = header?.children[1]?.querySelector<HTMLElement>(".bolt-textfield");
  const input = field?.querySelector<HTMLInputElement>("input");
  const box = field?.parentElement;
  if (!field || !input || !box) return;
  let view = box.querySelector<HTMLElement>(":scope > .adofix-wi-title");
  if (!view) {
    view = document.createElement("div");
    view.className = "adofix-wi-title";
    view.addEventListener("click", () => {
      box.classList.add("adofix-wi-title-editing");
      box.querySelector<HTMLInputElement>(":scope > .bolt-textfield input")?.focus();
    });
    box.append(view);
  }
  if (!input.dataset["adofixTitle"]) {
    input.dataset["adofixTitle"] = "1";
    const sync = (): void => ensureWrappingTitle();
    input.addEventListener("focus", () => box.classList.add("adofix-wi-title-editing"));
    input.addEventListener("blur", () => {
      box.classList.remove("adofix-wi-title-editing");
      sync();
    });
    input.addEventListener("input", sync);
  }
  const text = input.value || input.placeholder;
  if (view.textContent !== text) view.textContent = text;
  view.classList.toggle("adofix-wi-title--empty", !input.value);
}

/**
 * The command bar and the dialog's Fullscreen/Close buttons sit on the
 * eyebrow row ("TASK 36642"), above the title, so the title gets the full
 * width (user 2026-11-02; they sat on the title row before and cut it
 * off). Vertical centers measured from the eyebrow row's live rect
 * (horizontal offsets are CSS).
 */
function placeHeaderControls(): void {
  const header = document.querySelector<HTMLElement>(".work-item-form-header");
  const eyebrow = header?.children[0] as HTMLElement | undefined;
  if (!header || !eyebrow) return;
  const hr = header.getBoundingClientRect();
  const tr = eyebrow.getBoundingClientRect();
  const top = `${Math.round(tr.top - hr.top + (tr.height - CONTROL_HEIGHT) / 2)}px`;
  const cb = header.querySelector<HTMLElement>(
    ":scope > :nth-child(3) > .work-item-header-command-bar"
  );
  cb?.style.setProperty("top", top);
  for (const sel of ['button[aria-label="Fullscreen"]', 'button[aria-label="Close"]']) {
    header.querySelector<HTMLElement>(sel)?.style.setProperty("top", top);
  }
}

/** "1 Comment" -> "1": icon + bare integer. Idempotent — React may restore
    the long text on re-render; the next settle trims it again. */
function trimCommentCount(): void {
  const commentText = document.querySelector(".wif-comment-count-link-text");
  if (!commentText) return;
  const n = commentText.textContent?.match(/\d+/)?.[0];
  if (n && commentText.textContent !== n) commentText.textContent = n;
  // No comments, no count (user 2026-11-02).
  commentText
    .closest(".wif-comment-count-link")
    ?.classList.toggle("adofix-wi-count-zero", (n ?? commentText.textContent?.trim()) === "0");
}

/** Description loses its section header (and with it ADO's 1px border and the
    collapse affordance). Text-matched: the bug form's Repro Steps / System
    Info headers in the same section keep theirs. */
function hideDescriptionHeader(): void {
  for (const h of document.querySelectorAll(
    ".work-item-form-first-section .work-item-form-collapsible-header"
  )) {
    if (DESCRIPTION_HEADER_RE.test(h.textContent?.trim() ?? "")) {
      h.classList.add("adofix-wi-header-hide");
    }
  }
}

/** MUST stay idempotent — runs on every route change and DOM settle. */
function enhance(ref: ProjectRef | null): void {
  // Before the rail check: on the Attachments view the rail is unmounted,
  // but the proxy's count/active state still needs refreshing.
  ensureTabProxies();
  ensureWrappingTitle();
  placeHeaderControls();
  placeStateField();
  trimCommentCount();
  hideDescriptionHeader();
  const rail = document.querySelector<HTMLElement>(".work-item-form-right");
  if (!rail) {
    return;
  }
  const [colA, colB] = subheaderColumns();
  if (!colA || !colB) return;
  const rows = collectRows(colA, colB, classifyRailGroups());
  if (currentId !== null && ref) ensureCreated(currentId, ref);

  const snapshot = JSON.stringify(rows.map((r) => [r.key, r.value, r.dotColor]));
  let host = document.getElementById(HOST_ID);
  if (host && host.dataset.snapshot === snapshot && rail.contains(host)) return;

  if (!host || !rail.contains(host)) {
    host?.remove();
    host = document.createElement("div");
    host.id = HOST_ID;
    rail.prepend(host);
    log(FEATURE_ID, "details rail group mounted");
  }
  host.dataset.snapshot = snapshot;
  host.textContent = "";

  for (const row of rows) {
    const el = document.createElement("div");
    el.className = row.tags ? "adofix-wi-kv adofix-wi-kv--block" : "adofix-wi-kv";
    el.dataset.adofixKv = row.key;
    const label = document.createElement("span");
    label.className = "adofix-wi-kv-label";
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "adofix-wi-kv-value";
    if (row.dotColor) {
      const dot = document.createElement("span");
      dot.className = "adofix-wi-kv-dot";
      dot.style.backgroundColor = row.dotColor;
      value.append(dot);
    }
    if (row.tags) {
      if (row.tags.length === 0) value.append(document.createTextNode("—"));
      for (const tag of row.tags) {
        // ADO's own tag pill classes, so tags match the boards' (and follow
        // whatever the bridge paints them) — user 2026-11-02.
        const pill = document.createElement("span");
        pill.className = "adofix-wi-tag bolt-pill flex-row flex-center themed-standard regular";
        const text = document.createElement("span");
        text.className = "bolt-pill-content text-ellipsis";
        text.textContent = tag;
        pill.append(text);
        value.append(pill);
      }
    } else {
      value.append(document.createTextNode(row.value));
    }
    el.append(label, value);
    if (row.native) {
      const native = row.native;
      el.classList.add("adofix-wi-kv-editable");
      el.addEventListener("click", () => teleport(native, el));
    }
    host.append(el);
  }
}

const CSS = `
/* The header rows and the State/Area subheader join the same centered
   column — full-width header over a capped body clashed (user 2026-08-18).
   The 10px work-item-type stripe on the window edge goes with it; the type
   icon and the "BUG 36636" eyebrow already carry the type. */
.work-item-form-header-type-deco {
  display: none !important;
}
.work-item-form-header,
.work-item-form-subheader {
  max-width: ${FORM_MAX_WIDTH}px !important;
  margin: 0 auto !important;
}
/* One main column + a 320px rail, capped and centered like a GH issue.
   The rail width is INVARIANT: on resize the description/discussion
   column gives way (minmax(0,1fr) shrinks below content size), never the
   metadata rail (user 2026-08-18). Wide description content (code blocks)
   scrolls inside its own box instead of widening the column, and the grid
   keeps 16px of air on the right. */
.work-item-grid {
  grid-template-columns: minmax(0, 1fr) ${RAIL_WIDTH}px !important;
  /* auto rows: ADO's fixed row heights boxed the description into a
     scrolling 207px track (user 2026-08-18). */
  grid-template-rows: auto auto !important;
  max-width: ${FORM_MAX_WIDTH}px !important;
  margin: 0 auto !important;
  /* air above the content (user 2026-08-18), and no row gap — the grid's
     16px row gap pushed the discussion away from the content above (the
     rail spans both rows, so only the description/discussion seam is
     affected; the 16px column gap stays). */
  padding-top: 20px !important;
  padding-right: 16px !important;
  box-sizing: border-box !important;
  row-gap: 0 !important;
  column-gap: 16px !important;
}
/* NO overflow-x:hidden here: pairing hidden with visible-y computes
   overflow-y to auto, which turns a height-constrained section into a
   scrollbox. Wide content is handled inside the rooster editor. */
.work-item-form-first-section {
  grid-area: 1 / 1 / 2 / 2 !important;
  min-width: 0 !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: none !important;
}
.work-item-form-discussion {
  grid-area: 2 / 1 / 3 / 2 !important;
  min-width: 0 !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: none !important;
}
.work-item-form-page .html-editor .rooster-editor {
  overflow-x: auto !important;
}
.work-item-form-right {
  grid-area: 1 / 2 / 3 / 3 !important;
  /* display:flex is LOAD-BEARING: despite its flex-row class the rail
     computes display:grid from ADO's own CSS — flex-direction alone was
     ignored, and its sections sat in fixed grid tracks (870px+), leaving
     a huge gap above Related Work (user 2026-08-18). */
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  width: ${RAIL_WIDTH}px !important;
  min-width: ${RAIL_WIDTH}px !important;
}
.work-item-form-right .work-item-form-section {
  width: 100% !important;
  max-width: none !important;
  flex: 0 0 auto !important;
  /* ADO gives sections height:100% (of the two-row rail span) — with its
     groups absorbed to zero, an empty full-height section shoved Related
     Work far down the rail (user 2026-08-18). */
  height: auto !important;
  min-height: 0 !important;
}
/* GitHub sidebar sections: muted 12px semibold headings, sections parted
   by 24px of air alone (32px until 2026-11-02, user: "reduce those gaps")
   — GitHub's 1px rule between them is gone (borderless, B2; was D66).
   Icons keep their own size. */
.work-item-form-right .work-item-form-group:not(.adofix-wi-group-absorb, .adofix-wi-group-hide) {
  padding-bottom: 0 !important;
  margin-bottom: 24px !important;
  border-bottom: var(--borderWidth-default) solid transparent !important;
}
/* ADO's 16px row gap on the rail stacked on those margins, and also
   spaced out the zero-height section holding only absorbed stubs (it must
   stay rendered for the teleport, so the gap goes instead). */
.work-item-form-right {
  row-gap: 0 !important;
}
.work-item-form-right .work-item-form-group:last-child {
  border-bottom: none !important;
}
.work-item-form-right .work-item-form-collapsible-header,
.work-item-form-right .work-item-form-collapsible-header :not([class*="icon" i]) {
  font-size: var(--text-body-size-small) !important;
  font-weight: var(--base-text-weight-semibold) !important;
  color: var(--fgColor-muted) !important;
}
.work-item-form-right .work-item-form-collapsible-header {
  border-bottom: none !important;
}
/* Main-column section headers (Description, Repro Steps, …) keep their
   height but lose ADO's 1px underline (borderless, B2). */
.work-item-form-collapsible-header {
  border-bottom-color: transparent !important;
}
/* Rail noise out. */
.work-item-form-group:has([class*="deployments"]) {
  display: none !important;
}
.links-control-zero-state {
  display: none !important;
}
/* Discussion GH-style: comments oldest-first, composer at the bottom;
   GitHub's 16px timeline gap between comment boxes. */
.work-item-form-discussion .work-item-form-collapsible-section-content {
  display: flex;
  flex-direction: column-reverse;
  gap: 16px;
}
/* Comments: the shared GitHub comment look (core/comment.ts, also on PR
   threads) in gh-Box material — a muted surface on the canvas, 6px
   corners, no border, no shadow (B1). CSS rather than the gh-Box class:
   the comment nodes are React-owned and re-rendered (D41). */
${commentCss({
  box: ".comment-item.displayed-comment",
  avatar: ".comment-item.displayed-comment .comment-item-left .bolt-coin",
  header: ".comment-item.displayed-comment .comment-header",
  meta: ".comment-item.displayed-comment .comment-header-main",
  author: ".comment-item.displayed-comment .user-display-name",
  date: ".comment-item.displayed-comment .comment-timestamp",
  actions: ".comment-item.displayed-comment .comment-viewer-toolbar",
})}
/* The comment toolbar (reactions, edit, ⋯) is invisible until hover but
   kept its ~120px in the header row, so the right-aligned date stopped
   short of the edge. It overlays the date's spot instead, and takes it
   over while the comment is hovered or focused. */
.comment-item.displayed-comment .comment-header {
  position: relative;
}
/* ADO's own 16px block margins doubled the 16px timeline gap. */
.comment-item.displayed-comment {
  margin: 0 !important;
}
.comment-item.displayed-comment .comment-viewer-toolbar {
  position: absolute !important;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}
.comment-item.displayed-comment:is(:hover, :focus-within) .comment-timestamp {
  visibility: hidden;
}
/* The comment count reads as metadata: muted, not link-blue; hidden at 0. */
.work-item-form-header .wif-comment-count-link,
.work-item-form-header .wif-comment-count-link * {
  color: var(--fgColor-muted) !important;
}
.work-item-form-header .wif-comment-count-link:hover,
.work-item-form-header .wif-comment-count-link:hover * {
  color: var(--fgColor-accent) !important;
}
.work-item-form-header .adofix-wi-count-zero {
  display: none !important;
}
/* Toolbar feedback (user 2026-11-02): the header's command buttons get
   GitHub's invisible-button hover and press tints (natively nothing). */
.work-item-header-command-bar .bolt-button:not(.disabled, :disabled):hover {
  background-color: var(--control-transparent-bgColor-hover) !important;
}
.work-item-header-command-bar .bolt-button:not(.disabled, :disabled):active {
  background-color: var(--control-transparent-bgColor-active) !important;
}
/* The header scrolls away with the page (user 2026-11-02): natively only
   the section container below it scrolls, pinning header + metadata row.
   The page is already a scroll container, so the inner one stops being
   one. The absolute State field and command bar live inside the page, so
   they scroll with it. */
.work-item-form-page > .work-item-form-expanded-section-container {
  overflow: visible !important;
  height: auto !important;
  flex-shrink: 0 !important;
}
/* Section headers out: Discussion always (Description via text-matched
   class — Repro Steps etc. keep theirs). ADO's 1px divider lives ON the
   header, so it goes too, as does the collapse affordance. */
.work-item-form-discussion .work-item-form-collapsible-header,
.adofix-wi-header-hide {
  display: none !important;
}
/* Header: the Save/refresh/undo/⋮/paperclip command bar and the dialog's
   Fullscreen/Close all sit ON the title row, right-aligned. Horizontal
   offsets are CSS; vertical tops are MEASURED per pass in enhance()
   against the title row's live rect (fixed offsets drift — absoluting
   content out of a row changes the row heights themselves). The title
   row reserves space so a long title never slides underneath. */
.work-item-form-header {
  position: relative !important;
  /* the type icon + number sat pressed against the page top (user
     2026-08-18; 12px was "substantially" too little); JS placements
     measure AFTER this applies, so the overlaid controls follow the
     shifted rows automatically */
  padding-top: 32px !important;
  /* GitHub's issue header, minus its 1px rule (borderless, B2): the
     title block and the body part by 16px of air (D65). */
  padding-bottom: 16px !important;
  border-bottom: var(--borderWidth-default) solid transparent !important;
}
/* Issue title type: GitHub's large title (32px, regular weight) on the
   title row's text field (D65, PROVISIONAL — selector is the title row
   established above, the input's own box not yet verified live). */
.work-item-form-header > :nth-child(2) input {
  font-size: var(--text-title-size-large) !important;
  font-weight: var(--base-text-weight-normal) !important;
  line-height: var(--text-title-lineHeight-large) !important;
  height: auto !important;
}
/* TWO nested elements carry this class — position only the outer (the
   row's direct child); absoluting both collapses the outer to 4px. */
.work-item-form-header > :nth-child(3) > .work-item-header-command-bar {
  position: absolute !important;
  top: 5px;
  right: 8px;
  z-index: 6;
}
.work-item-form-dialog
  .work-item-form-header
  > :nth-child(3)
  > .work-item-header-command-bar {
  right: 84px;
}
.work-item-form-dialog .work-item-form-header button[aria-label="Fullscreen"] {
  position: absolute !important;
  top: 5px;
  right: 46px;
  z-index: 6;
}
.work-item-form-dialog .work-item-form-header button[aria-label="Close"] {
  position: absolute !important;
  top: 5px;
  right: 8px;
  z-index: 6;
}
/* The command bar lives on the eyebrow row, so the title row needs no
   reserve for it (it reserved 460px / 530px in the dialog until
   2026-11-02 and cut long titles off). The eyebrow keeps the bar's room. */
.work-item-form-header > :nth-child(1) {
  padding-right: 460px !important;
  min-height: ${CONTROL_HEIGHT}px;
}
.work-item-form-dialog .work-item-form-header > :nth-child(1) {
  padding-right: 530px !important;
}
/* The wrapping title view (ensureWrappingTitle) in the title's type, and
   ADO's single-line input visually hidden while not edited. */
.adofix-wi-title {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--borderRadius-medium);
  font-size: var(--text-title-size-large);
  font-weight: var(--base-text-weight-normal);
  line-height: var(--text-title-lineHeight-large);
  color: var(--fgColor-default);
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: text;
}
.adofix-wi-title:hover {
  background: var(--bgColor-neutral-muted);
}
.adofix-wi-title--empty {
  color: var(--fgColor-muted);
}
.adofix-wi-title-editing > .adofix-wi-title {
  display: none;
}
:not(.adofix-wi-title-editing) > .bolt-textfield:has(~ .adofix-wi-title) {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip-path: inset(50%);
}
/* Assignee row makes room at its left for the promoted State field.
   NOT position:relative — that would become the absolute command bar's
   containing block and drag it down to this row's line. */
.work-item-form-header > :nth-child(3) {
  padding-left: calc(var(--adofix-wi-state-w, ${STATE_WIDTH}px) + 8px) !important;
}
/* The assignee sized to its name (fitToText); full width while editing,
   where the field is a search box. */
.work-item-form-header .work-item-assignment-dropdown {
  min-width: 0 !important;
  width: var(--adofix-wi-assignee-w, 270px) !important;
}
.work-item-form-header .work-item-assignment-dropdown:focus-within {
  width: 270px !important;
}
/* The input fills the sized box (natively it keeps an intrinsic ~207px). */
.work-item-form-header .work-item-assignment-dropdown input {
  flex: 1 1 auto !important;
  width: 0 !important;
  min-width: 0 !important;
}
/* No ID before the title: the eyebrow already carries it (user
   2026-11-02). It is a bare text node in the title row, so the row's font
   size goes to 0 and the title column brings its own back. The title's
   text lines up with the eyebrow (the view's hover padding hangs left),
   with 16px of air below the toolbar on the eyebrow row (user 2026-11-02). */
.work-item-form-header > :nth-child(2) {
  font-size: 0 !important;
  padding-top: 16px !important;
}
.work-item-form-header > :nth-child(2) > * {
  font-size: var(--text-body-size-medium);
}
.work-item-form-header > :nth-child(2) .flex-column.padding-left-8 {
  padding-left: 0 !important;
}
.work-item-form-header .adofix-wi-title {
  margin-left: -8px;
}
/* The assignee row as one centered line: assignee, comment count (and the
   promoted State, placed against the assignee's center) — natively a block
   of inline boxes on the baseline, which left the count 5px low. */
.work-item-form-header > :nth-child(3) {
  display: flex !important;
  align-items: center !important;
  margin-top: 12px; /* air between the title and this metadata row */
}
/* State promoted out of its stub column into the header, left of the
   assignee. Absolute against .work-item-form-page; it escapes the
   zero-size column's clip because the column is unpositioned (the same
   principle the teleport rides on). top/left are MEASURED per pass in
   enhance() — the assignee row's own position moves as rows reflow. */
.work-item-form-page {
  position: relative !important;
}
.adofix-wi-state-promoted {
  position: absolute !important;
  width: var(--adofix-wi-state-w, ${STATE_WIDTH}px) !important;
  height: ${CONTROL_HEIGHT}px !important;
  visibility: visible !important;
  pointer-events: auto !important;
  overflow: visible !important;
  z-index: 5;
}
/* Same clamp as teleports: the state control's inner fixed widths must
   not render wider than its box (it overlapped the assignee). */
.adofix-wi-state-promoted * {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.work-item-form-subheader .work-item-control-label {
  display: none !important;
}
/* Description expands to its content (native cap 460/500px with an inner
   scrollbar) — in edit mode too since 2026-11-02: the cap made the editor
   shrink the moment it took focus. No focus ring on the editing surface
   either (user 2026-11-02: "an ugly blue outline"); the formatting bar
   below it marks edit mode. */
.work-item-form-page .html-editor.auto-grow :is(.rooster-wrapper, .rooster-editor) {
  max-height: none !important;
}
.work-item-form-page :is(.html-editor, .rooster-wrapper, .rooster-editor, .markdown-editor, .markdown-editor textarea):is(:focus, :focus-visible, :focus-within) {
  outline: none !important;
  box-shadow: none !important;
}
/* The description's first line on the first Details row's line: ADO's
   4px editor padding stays, the first block's 14px top margin goes (HTML
   editor); the markdown preview gets 8px (natively 4px, measured live
   2026-11-02: first lines 21px low / 4px high against the "Reason" row). */
.work-item-form-first-section .rooster-editor > :first-child {
  margin-top: 0 !important;
}
.work-item-form-first-section .markdown-editor-preview {
  padding-top: 8px !important;
}
/* Short descriptions still get a real canvas (user 2026-08-18). */
.work-item-form-page .html-editor.auto-grow .rooster-editor {
  min-height: 200px !important;
}
/* The link sections' "Add link" (Related Work: a dropdown; Development: a
   plain button) becomes a "+" on the section header, right-aligned left of
   the collapse chevron (user 2026-08-18; Development since 2026-11-02). */
.adofix-wi-links {
  position: relative;
}
/* Position the BUTTON, not its wrapper: the wrapper also contains the
   .compact-links-list itself — absoluting it dragged the links into the
   header box (user 2026-08-18). */
.adofix-wi-links :is(.bolt-expandable-button, .work-item-form-control-wrapper > button.bolt-button) {
  position: absolute !important;
  top: -2px;
  right: 30px;
  z-index: 2;
}
.adofix-wi-links :is(.bolt-expandable-button .bolt-button, .work-item-form-control-wrapper > button.bolt-button) {
  min-width: 0 !important;
  padding: 2px 10px !important;
  & .bolt-button-text,
  & .fluent-icons-enabled {
    display: none !important;
  }
  &::before {
    content: "";
    display: block;
    width: 16px;
    height: 16px;
    background-color: currentColor;
    -webkit-mask: ${octiconMask("plus")} center / 16px no-repeat;
    mask: ${octiconMask("plus")} center / 16px no-repeat;
  }
}
/* Linked items (parent, related, PRs, commits) show their whole title,
   wrapping, with the type icon pinned to the first line (user 2026-11-02;
   ADO ellipsizes every line — the PR page's linked-work-items precedent). */
.work-item-form-right .artifact-link-container {
  white-space: normal !important;
}
.work-item-form-right .artifact-link-container > .flex-row.artifact-link {
  align-items: flex-start !important;
}
.work-item-form-right .artifact-link-container :is(a.artifact-link-link, .artifact-details, .artifact-details *) {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  overflow-wrap: anywhere;
}
.work-item-form-right .artifact-link-container .artifact-details {
  flex-wrap: wrap;
}
/*
 * Linked items as two lines under their type heading (user 2026-11-02):
 *   Parent
 *   [type icon] title
 *   state · updated
 * The avatar coin and the number go; the state (ADO's 2nd detail span)
 * leads the details line, which starts flush with the icon.
 */
.work-item-form-right .link-type-name {
  font-size: var(--text-body-size-small) !important;
  font-weight: var(--base-text-weight-semibold) !important;
  color: var(--fgColor-muted) !important;
  padding-bottom: 4px !important;
}
.work-item-form-right .artifact-link-container {
  padding-bottom: 12px !important;
}
.work-item-form-right .artifact-link-container .artifact-link > div:has(> .bolt-coin),
.work-item-form-right .artifact-link-container .artifact-link-id {
  display: none !important;
}
.work-item-form-right .artifact-link-container .artifact-details {
  margin: 2px 0 0 !important;
  gap: 0 8px;
  color: var(--fgColor-muted);
  font-size: var(--text-body-size-small);
}
.work-item-form-right .artifact-link-container .artifact-details > :nth-child(2) {
  order: -1;
}
.work-item-form-right .artifact-link-container .artifact-details > * {
  padding-right: 0 !important;
}
/* Commits have no state: an empty span that would lead with a gap. */
.work-item-form-right .artifact-link-container .artifact-details > :empty {
  display: none !important;
}
/* Header noise out (user 2026-08-18): the Links tab (Related Work keeps
   Add link, shown even with no links since 2026-11-02) and every
   per-section Maximize toggle. Follow and History came back 2026-11-02
   (they were the only way to follow an item or see its history; History
   is a header proxy, see ensureTabProxies). The comment-count link STAYS —
   compacted to icon + integer (its text is trimmed in enhance();
   2026-08-18 second thoughts). */
.wif-tabbar [id$="-System_Links"],
button.work-item-form-toggle[aria-label^="Maximize"] {
  display: none !important;
}
/* Follow, icon-only like the rest of the command bar (its label made the
   bar wide enough to run into the title, live 2026-11-02). The label is
   visually hidden, not display:none, so it stays the accessible name. */
#__bolt-follow .bolt-button-text {
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* The native State/Reason and Area/Iteration columns and the header tag
   picker become zero-size stubs — NOT display:none: the teleport trick
   needs them renderable (position:fixed escapes a zero-size ancestor's
   clipping; display:none would not). */
${stubHide(`.work-item-form-subheader > :not([class*="wif-tabbar"]),
.work-item-form-header .work-item-tag-picker`)}
/* Every rail property as "key: value", one pair per row (user 2026-08-18;
   natively the label stacks above the control). */
.work-item-form-right .work-item-form-control-content-wrapper {
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px;
}
.work-item-form-right .work-item-form-control-content-wrapper > :first-child {
  flex: 0 0 45% !important;
  margin: 0 !important;
}
.work-item-form-right .work-item-form-control-content-wrapper > :last-child {
  flex: 1 1 auto !important;
  min-width: 0 !important;
}
/* Groups removed or absorbed by header text (set from enhance()):
   Implementation / System Info go entirely; Planning is a
   zero-size stub — its controls stay renderable for the teleport trick
   while its rows render in the adofix Details list. */
.adofix-wi-group-hide {
  display: none !important;
}
${stubHide(".adofix-wi-group-absorb")}
/* The adofix "Details" group at the top of the rail. */
#adofix-wi-details {
  padding: 0;
  border-bottom: var(--borderWidth-default) solid transparent;
  margin-bottom: 24px;
}
/* The tab strip goes (Details is the only content tab left — Attachments
   and History are proxied into the header command bar, Links is gone), and
   with it the "Updated by …" line (now an Updated row in the KV list).
   The native tabs stay mounted: display:none elements still take .click()
   for the proxy toggling. The subheader row then collapses to nothing. */
.wif-tabbar,
.wif-tabbar-container .secondary-text {
  display: none !important;
}
.work-item-form-subheader {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 0 !important;
}
.adofix-wi-tab-proxy {
  white-space: nowrap;
  gap: 4px;
}
.adofix-wi-tab-active,
.adofix-wi-tab-active .octicon {
  color: var(--fgColor-accent) !important;
}
/* While teleported, the control's own label hides — the adofix row's key
   is replaced by the live control across the full row. */
.adofix-wi-teleport .work-item-control-label,
.adofix-wi-teleport .workitemcontrol-label,
.adofix-wi-teleport .work-item-form-control-content-wrapper > :first-child {
  display: none !important;
}
/* Nothing inside a teleported control may exceed the teleport box: ADO's
   inner controls carry their own fixed widths (the Area/Iteration
   tree-path input is the worst) and, combined with overflow:visible,
   spilled past the rail and the viewport (user screenshot 2026-08-18). */
.adofix-wi-teleport * {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.adofix-wi-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
  /* Tall enough that a teleported bolt input (~30px) fits INSIDE the row's
     own box instead of covering the row below. */
  min-height: 32px;
  font-size: var(--text-body-size-small);
}
.adofix-wi-kv-label {
  flex: 0 0 45%;
  color: var(--fgColor-muted);
}
.adofix-wi-kv-value {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  /* Long values (Updated: "name, when") wrap onto extra lines — clipping
     them hid the tail at every window width (user 2026-08-18). */
  white-space: normal;
  overflow-wrap: anywhere;
}
.adofix-wi-kv-editable {
  cursor: pointer;
  border-radius: var(--borderRadius-medium);
}
.adofix-wi-kv-editable:hover {
  background: var(--control-transparent-bgColor-hover);
}
.adofix-wi-kv-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Tags: a block at the list's end — label line, pills wrapping below. */
.adofix-wi-kv--block {
  display: block;
  min-height: 0;
  padding: 16px 0 2px;
}
.adofix-wi-kv--block .adofix-wi-kv-label {
  display: block;
  margin-bottom: 10px; /* 6px read as cramped under "Tags" (user 2026-11-02) */
}
.adofix-wi-kv--block .adofix-wi-kv-value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  white-space: normal;
  overflow: visible;
}
/* Tag pills are ADO's own themed-standard bolt-pills (the boards' look). */

/*
 * Work item form (dialog and full page, verified live 2026-08-18): the
 * shell, page, subheader, tab strip and every flat field (bolt textfields,
 * editable dropdowns, the description html-editor + rooster command bar)
 * natively paint four different greys. ADO's fields are flat by design
 * (same color as the page), so everything goes to the canvas; the
 * discussion composer and the zero-data hint boxes are content cards.
 */
.work-item-form-dialog,
.work-item-form-page,
.work-item-form-subheader,
.wif-tabbar,
.work-item-form-page .bolt-textfield,
.work-item-form-page .bolt-textfield-input,
.work-item-form-page .bolt-editable-dropdown,
.work-item-form-page .html-editor,
.work-item-form-page .rooster-editor,
.work-item-form-page .ms-CommandBar {
  background: var(--bgColor-default) !important;
}
/* The description editor's visible surface CANNOT be painted directly:
   ADO's dark-theme sanitizer (.work-item-form-section-dark-theme-override
   .html-editor [style]:not(a):not(pre):not(…)) repaints every inline-styled
   editor descendant var(--background-color) !important at unbeatable
   specificity — and the editor div carries style="user-select: text".
   Redefining the token in the editor's scope turns ADO's own hammer into
   the paintbrush. */
.work-item-form-page .html-editor {
  --background-color: var(--bgColor-default);
}
.work-item-form-page .html-command-bar-button:not(:hover):not(.is-checked) {
  background: transparent !important;
}
/* Discussion composer: flat on the canvas, and since 2026-11-02 (B15) the
   text field has no fill either — like every comment composer, the
   placeholder alone marks it (user 2026-11-02, reversing the 2026-08-18
   field box). The field's html-editor gets the same scoped
   --background-color trick as above (transparent). */
.discussion-new-comment,
.discussion-new-comment .markdown-editor,
.discussion-new-comment .bolt-textfield,
.discussion-new-comment .bolt-textfield-input {
  background: transparent !important;
  box-shadow: none !important;
}
.discussion-new-comment .html-editor {
  --background-color: transparent;
}
.discussion-new-comment .markdown-editor {
  border: var(--borderWidth-default) solid transparent !important;
}
/* (.deployments-zero-data / .links-control-zero-state card styling removed:
   workitem-layout hides both containers outright, so the rules were dead.) */
`;
