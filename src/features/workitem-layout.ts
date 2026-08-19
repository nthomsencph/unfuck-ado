import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { getWorkItem, type ProjectRef } from "../core/api";
import { injectStyleOnce } from "../core/dom";
import { createFetchCache } from "../core/fetch-cache";
import { log } from "../core/log";

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

/** Work item in view, set per apply() — async fetch guards read it live. */
let currentId: number | null = null;

interface CreatedInfo {
  by: string;
  date: string;
}
const createdCache = createFetchCache<number, CreatedInfo>();

function ensureCreated(id: number, ref: ProjectRef): void {
  if (createdCache.begin([id]).length === 0) return;
  void getWorkItem(ref, id, ["System.CreatedBy", "System.CreatedDate"]).then((res) => {
    if (!res.ok) {
      createdCache.fail([id]);
      log(FEATURE_ID, "created-by fetch failed", res.error.message);
      return;
    }
    const fields = res.value.fields;
    const by =
      (fields["System.CreatedBy"] as { displayName?: string } | undefined)?.displayName ?? "?";
    const raw = fields["System.CreatedDate"] as string | undefined;
    const date = raw
      ? new Date(raw).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "?";
    createdCache.settle(id, { by, date });
    // The fetch resolves between settles — patch the mounted rows now.
    renderCreated(id);
  });
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

/**
 * Teleport-edit: place the stub-hidden native control over the clicked row
 * (invisible), click its input so ADO's callout opens anchored there, and
 * restore the stub on the next mousedown anywhere (the callout itself
 * handles that click before the anchor snaps back).
 */
const OVERLAY_SELECTOR = '[class*="callout"], [class*="portal"], [class*="flyout"], [class*="dropdown-items"]';

/** At most one teleport is live; whatever ends it runs this. */
let endTeleport: (() => void) | null = null;

function teleport(native: HTMLElement, row: HTMLElement): void {
  endTeleport?.();
  // Anchor on the VALUE column, not the whole row: the control then lands
  // exactly where the value text sits (its own label is hidden via the
  // teleport class), so nothing shifts. Height is the row's EXACT height —
  // min-height/auto let tall controls cover the row below.
  const rowRect = row.getBoundingClientRect();
  const valRect = (row.querySelector(".adofix-wi-kv-value") ?? row).getBoundingClientRect();
  // Every teleport spans the FULL row width — one consistent length that
  // respects the rail's padding (the value column alone was too tight for
  // path fields, whose inner controls then spilled past the viewport).
  // Block rows (tags) anchor on the value block's y instead of the row's.
  const block = row.classList.contains("adofix-wi-kv--block");
  const top = block ? valRect.top : rowRect.top;
  const height = Math.max(block ? valRect.height : rowRect.height, 28);
  native.classList.add("adofix-wi-teleport");
  const s = native.style;
  s.setProperty("position", "fixed", "important");
  s.setProperty("left", `${rowRect.left}px`, "important");
  s.setProperty("top", `${top}px`, "important");
  s.setProperty("width", `${rowRect.width}px`, "important");
  s.setProperty("height", `${height}px`, "important");
  s.setProperty("min-height", "0", "important");
  /* VISIBLE while editing: the live control replaces the row in place —
     fields without a callout (e.g. Story Points) are typed into directly. */
  s.setProperty("opacity", "1", "important");
  s.setProperty("visibility", "visible", "important");
  s.setProperty("overflow", "visible", "important");
  s.setProperty("background", "var(--adofix-bg, #141414)", "important");
  s.setProperty("z-index", "2000", "important");
  s.setProperty("pointer-events", "auto", "important");

  const cleanup = (): void => {
    endTeleport = null;
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("keydown", onKey, true);
    native.removeEventListener("focusout", onFocusOut);
    native.removeAttribute("style");
    native.classList.remove("adofix-wi-teleport");
  };
  const isInside = (t: EventTarget | null): boolean => {
    if (!(t instanceof HTMLElement)) return false;
    if (native.contains(t)) return true;
    // An overlay counts as the edit's own callout only when it does NOT
    // contain the control: a dropdown's portal is a SIBLING tree, while
    // the work item DIALOG's root (class bolt-dialog-callout-content —
    // "callout"!) is an ANCESTOR of everything, which made every click,
    // scroll and focus look "inside" and no restore ever fire (the
    // stuck-fixed-controls bug, dialog rendering only).
    const overlay = t.closest(OVERLAY_SELECTOR);
    return overlay !== null && !overlay.contains(native);
  };
  const onDown = (e: MouseEvent): void => {
    // Clicks inside the control or its callout keep the edit alive.
    if (!isInside(e.target)) cleanup();
  };
  const onScroll = (e: Event): void => {
    // Page scroll while fixed = the control sticks to the viewport — end
    // the edit. Scrolling INSIDE the callout list stays alive.
    if (!isInside(e.target)) cleanup();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") cleanup();
  };
  const onFocusOut = (): void => {
    // A dropdown pick closes the callout and drops focus — restore then,
    // not on some later unrelated click. Deferred: focus may be moving
    // WITHIN the control or into its callout.
    window.setTimeout(() => {
      if (endTeleport !== cleanup) return;
      if (isInside(document.activeElement)) return;
      cleanup();
    }, 100);
  };
  endTeleport = cleanup;

  const input = native.querySelector<HTMLElement>("input") ?? native;
  input.click();
  input.focus();
  window.setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey, true);
    native.addEventListener("focusout", onFocusOut);
  }, 0);
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

function collectRows(): DetailRow[] | null {
  const cols = subheaderColumns();
  const [colA, colB] = cols;
  if (!colA || !colB) return null;
  const fieldOf = (col: HTMLElement, i: number): HTMLElement | null =>
    (col.children[i] as HTMLElement | undefined) ?? null;
  const valueOf = (field: HTMLElement | null): string =>
    field?.querySelector("input")?.value ??
    field?.textContent?.trim() ??
    "";
  const leaf = (path: string): string => path.split("\\").pop() ?? path;

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

  // Rail groups are matched by their header text (English-UI assumption,
  // like the ledger's other label matches): Development and Implementation
  // (bugs name it "System Info") disappear outright; Planning is absorbed —
  // its fields join this list row-by-row (teleport-editable) and the native
  // group becomes a zero-size stub.
  for (const group of document.querySelectorAll<HTMLElement>(
    ".work-item-form-right .work-item-form-group"
  )) {
    const label =
      group
        .querySelector(".work-item-form-collapsible-header")
        ?.textContent?.trim() ?? "";
    if (/^(Development|Implementation|System Info)/.test(label)) {
      group.classList.add("adofix-wi-group-hide");
      continue;
    }
    // Related Work only earns its place with actual links (user 2026-08-18).
    if (/^Related Work/.test(label)) {
      group.classList.add("adofix-wi-relwork");
      group.classList.toggle(
        "adofix-wi-group-hide",
        !group.querySelector(".compact-links-list a")
      );
      continue;
    }
    if (!/^(Planning|Classification|Effort)/.test(label)) continue;
    group.classList.add("adofix-wi-group-absorb");
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
        key: `planning-${fieldLabel.toLowerCase().replace(/\W+/g, "-")}`,
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
    rows.push({
      key: "updated",
      label: "Updated",
      value: updText.replace(/^Updated by /, "").replace(/:\s*/, ", "),
    });
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
 * The tab strip is hidden (Details is the only content tab left), so the
 * Attachments tab gets an icon proxy in the header command bar. Clicking
 * toggles Attachments <-> Details via the native (hidden, still clickable)
 * tabs. Rebuilt whenever a re-mount drops it; the count label refreshes on
 * every pass.
 */
function ensureAttachmentsProxy(): void {
  const bar = document.querySelector<HTMLElement>(".work-item-header-command-bar");
  const attachTab = document.querySelector<HTMLElement>('[id$="-System_Attachments"]');
  if (!bar || !attachTab) return;
  let btn = bar.querySelector<HTMLButtonElement>(".adofix-wi-attach-proxy");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "adofix-wi-attach-proxy bolt-button bolt-icon-button enabled subtle";
    btn.addEventListener("click", () => {
      const attach = document.querySelector<HTMLElement>('[id$="-System_Attachments"]');
      if (!attach) return;
      if (attach.classList.contains("selected")) {
        document
          .querySelector<HTMLElement>('.wif-tabbar [aria-label="Details"]')
          ?.click();
      } else {
        attach.click();
      }
    });
    bar.append(btn);
    log(FEATURE_ID, "attachments proxy injected");
  }
  const count = attachTab.textContent?.trim() ?? "";
  const label = `Attachments${count ? ` (${count})` : ""}`;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.textContent = `📎 ${count}`.trim();
  btn.classList.toggle("adofix-wi-attach-active", attachTab.classList.contains("selected"));
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
  state.style.setProperty("top", `${Math.round(ar.top - pr.top + (ar.height - 32) / 2)}px`);
  state.style.setProperty("left", `${Math.round(r3.left - pr.left + 8)}px`);
}

/**
 * The command bar and the dialog's Fullscreen/Close buttons sit ON the
 * title row — vertical centers measured from the title row's live rect
 * (horizontal offsets are CSS).
 */
function placeHeaderControls(): void {
  const header = document.querySelector<HTMLElement>(".work-item-form-header");
  const title = header?.children[1] as HTMLElement | undefined;
  if (!header || !title) return;
  const hr = header.getBoundingClientRect();
  const tr = title.getBoundingClientRect();
  const top = `${Math.round(tr.top - hr.top + (tr.height - 32) / 2)}px`;
  const cb = header.querySelector<HTMLElement>(
    ":scope > :nth-child(3) > .work-item-header-command-bar"
  );
  cb?.style.setProperty("top", top);
  for (const sel of ['button[aria-label="Fullscreen"]', 'button[aria-label="Close"]']) {
    header.querySelector<HTMLElement>(sel)?.style.setProperty("top", top);
  }
}

/** MUST stay idempotent — runs on every route change and DOM settle. */
function enhance(ref: ProjectRef | null): void {
  // Before the rail check: on the Attachments view the rail is unmounted,
  // but the proxy's count/active state still needs refreshing.
  ensureAttachmentsProxy();
  placeHeaderControls();
  placeStateField();
  // "1 Comment" -> "1": icon + bare integer. Idempotent — React may
  // restore the long text on re-render; the next settle trims it again.
  const commentText = document.querySelector(".wif-comment-count-link-text");
  if (commentText) {
    const n = commentText.textContent?.match(/\d+/)?.[0];
    if (n && commentText.textContent !== n) commentText.textContent = n;
  }
  // Description loses its section header (and with it the 1px border and
  // the collapse affordance). Text-matched: the bug form's Repro Steps /
  // System Info headers in the same section keep theirs.
  for (const h of document.querySelectorAll(
    ".work-item-form-first-section .work-item-form-collapsible-header"
  )) {
    if (/^Description/.test(h.textContent?.trim() ?? "")) {
      h.classList.add("adofix-wi-header-hide");
    }
  }
  const rail = document.querySelector<HTMLElement>(".work-item-form-right");
  if (!rail) {
    return;
  }
  const rows = collectRows();
  if (!rows) return;
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
        const pill = document.createElement("span");
        pill.className = "adofix-wi-tag";
        pill.textContent = tag;
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
  max-width: 1250px !important;
  margin: 0 auto !important;
}
/* One main column + a 320px rail, capped and centered like a GH issue.
   The rail width is INVARIANT: on resize the description/discussion
   column gives way (minmax(0,1fr) shrinks below content size), never the
   metadata rail (user 2026-08-18). Wide description content (code blocks)
   scrolls inside its own box instead of widening the column, and the grid
   keeps 16px of air on the right. */
.work-item-grid {
  grid-template-columns: minmax(0, 1fr) 320px !important;
  /* auto rows: ADO's fixed row heights boxed the description into a
     scrolling 207px track (user 2026-08-18). */
  grid-template-rows: auto auto !important;
  max-width: 1250px !important;
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
  width: 320px !important;
  min-width: 320px !important;
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
/* Comments sit flat on the canvas (user 2026-08-18); the composer's text
   field carries the card color instead — see chrome.css. */
.comment-item.displayed-comment {
  background: transparent !important;
  box-shadow: none !important;
}
/* Section headers out: Discussion always (Description via text-matched
   class — Repro Steps etc. keep theirs). The 1px divider lives ON the
   header, so it goes too, as does the collapse affordance. */
.work-item-form-discussion .work-item-form-collapsible-header,
.adofix-wi-header-hide {
  display: none !important;
}
/* Header: the Save/refresh/undo/⋮/📎 command bar and the dialog's
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
.work-item-form-header > :nth-child(2) {
  padding-right: 400px !important;
}
.work-item-form-dialog .work-item-form-header > :nth-child(2) {
  padding-right: 470px !important;
}
/* Assignee row makes room at its left for the promoted State field.
   NOT position:relative — that would become the absolute command bar's
   containing block and drag it down to this row's line. */
.work-item-form-header > :nth-child(3) {
  padding-left: 210px !important;
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
  width: 190px !important;
  height: 32px !important;
  visibility: visible !important;
  pointer-events: auto !important;
  overflow: visible !important;
  z-index: 5;
}
/* Same clamp as teleports: the state control's inner fixed widths must
   not render wider than the 190px box (it overlapped the assignee). */
.adofix-wi-state-promoted * {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.work-item-form-subheader .work-item-control-label {
  display: none !important;
}
/* Description expands to its content in view mode (native cap 460/500px
   with an inner scrollbar); editing keeps ADO's cap. */
.work-item-form-page .html-editor.auto-grow .rooster-wrapper {
  max-height: none !important;
}
.work-item-form-page .html-editor.auto-grow .rooster-editor.view-mode {
  max-height: none !important;
}
/* Short descriptions still get a real canvas (user 2026-08-18). */
.work-item-form-page .html-editor.auto-grow .rooster-editor {
  min-height: 200px !important;
}
/* Related Work's "Add link" becomes a "+" on the group header, right-
   aligned left of the collapse chevron (user 2026-08-18). */
.adofix-wi-relwork {
  position: relative;
}
/* Position the BUTTON, not its wrapper: the wrapper also contains the
   .compact-links-list itself — absoluting it dragged the links into the
   header box (user 2026-08-18). */
.adofix-wi-relwork .bolt-expandable-button {
  position: absolute !important;
  top: -2px;
  right: 30px;
  z-index: 2;
}
.adofix-wi-relwork .bolt-expandable-button .bolt-button-text,
.adofix-wi-relwork .bolt-expandable-button .fluent-icons-enabled {
  display: none !important;
}
.adofix-wi-relwork .bolt-expandable-button .bolt-button {
  min-width: 0 !important;
  padding: 2px 10px !important;
}
.adofix-wi-relwork .bolt-expandable-button .bolt-button::before {
  content: "+";
  font-size: 18px;
  line-height: 1.2;
}
/* Header noise out (user 2026-08-18): Follow, the History and Links tabs
   (Created by/Created live in the rail; Related Work keeps Add link), and
   every per-section Maximize toggle. The comment-count link STAYS —
   compacted to icon + integer (its text is trimmed in enhance();
   2026-08-18 second thoughts). */
.work-item-form-header .bolt-split-button:has(> #__bolt-follow),
.wif-tabbar [id$="-System_History"],
.wif-tabbar [id$="-System_Links"],
button.work-item-form-toggle[aria-label^="Maximize"] {
  display: none !important;
}
/* The native State/Reason and Area/Iteration columns and the header tag
   picker become zero-size stubs — NOT display:none: the teleport trick
   needs them renderable (position:fixed escapes a zero-size ancestor's
   clipping; display:none would not). */
.work-item-form-subheader > :not([class*="wif-tabbar"]),
.work-item-form-header .work-item-tag-picker {
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  overflow: hidden !important;
  padding: 0 !important;
  margin: 0 !important;
  /* visibility, NOT opacity: opacity:0 on the ancestor renders even
     position:fixed descendants invisible (opacity affects the whole
     subtree); visibility is overridable per-descendant, which the teleport
     relies on. */
  visibility: hidden;
  pointer-events: none;
}
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
   Development / Implementation / System Info go entirely; Planning is a
   zero-size stub — its controls stay renderable for the teleport trick
   while its rows render in the adofix Details list. */
.adofix-wi-group-hide {
  display: none !important;
}
.adofix-wi-group-absorb {
  height: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  visibility: hidden;
  pointer-events: none;
}
/* The adofix "Details" group at the top of the rail. */
#adofix-wi-details {
  padding: 0 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
/* The tab strip goes (Details is the only content tab left — Attachments
   is proxied into the header command bar and History/Links are gone), and
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
.adofix-wi-attach-proxy {
  white-space: nowrap;
}
.adofix-wi-attach-active {
  color: var(--communication-foreground, #4fa3ff) !important;
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
  font-size: 13px;
}
.adofix-wi-kv-label {
  flex: 0 0 45%;
  color: var(--text-secondary-color, #a19f9d);
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
  border-radius: 4px;
}
.adofix-wi-kv-editable:hover {
  background: rgba(255, 255, 255, 0.06);
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
  padding: 6px 0 2px;
}
.adofix-wi-kv--block .adofix-wi-kv-label {
  display: block;
  margin-bottom: 6px;
}
.adofix-wi-kv--block .adofix-wi-kv-value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  white-space: normal;
  overflow: visible;
}
.adofix-wi-tag {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 2px 10px;
  font-size: 12px;
}
`;
