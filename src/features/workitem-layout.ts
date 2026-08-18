import type { Feature } from "../core/registry";
import { injectStyleOnce } from "../core/dom";
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
  areas: "*",
  apply(): void {
    injectStyleOnce("workitem-layout", CSS);
    enhance();
  },
};

const FEATURE_ID = "workitem-layout";
const HOST_ID = "adofix-wi-details";

/** "/{org}/{project}/…" → REST base, from the encoded pathname. */
function restBase(): string | null {
  const seg = location.pathname.split("/").filter(Boolean);
  return seg.length >= 2 ? `${location.origin}/${seg[0]}/${seg[1]}` : null;
}

/** Work item id: full page /_workitems/edit/{id} or dialog ?workitem={id}. */
function workItemId(): number | null {
  const m =
    location.pathname.match(/_workitems\/edit\/(\d+)/) ??
    location.search.match(/[?&]workitem=(\d+)/);
  return m ? Number(m[1]) : null;
}

interface CreatedInfo {
  by: string;
  date: string;
}
const createdCache = new Map<number, CreatedInfo | "pending" | "failed">();

function ensureCreated(id: number): void {
  if (createdCache.has(id)) return;
  const base = restBase();
  if (!base) return;
  createdCache.set(id, "pending");
  fetch(
    `${base}/_apis/wit/workitems/${id}?fields=System.CreatedBy,System.CreatedDate&api-version=7.1`,
    { headers: { Accept: "application/json" }, credentials: "include" }
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j) => {
      const by = j.fields?.["System.CreatedBy"]?.displayName ?? "?";
      const raw = j.fields?.["System.CreatedDate"];
      const date = raw
        ? new Date(raw).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "?";
      createdCache.set(id, { by, date });
      // The fetch resolves between settles — patch the mounted rows now.
      renderCreated(id);
    })
    .catch((err) => {
      createdCache.set(id, "failed");
      log(FEATURE_ID, "created-by fetch failed", err);
    });
}

function renderCreated(id: number): void {
  if (workItemId() !== id) return;
  const info = createdCache.get(id);
  if (!info || info === "pending" || info === "failed") return;
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
function teleport(native: HTMLElement, row: HTMLElement): void {
  const r = row.getBoundingClientRect();
  const s = native.style;
  s.setProperty("position", "fixed", "important");
  s.setProperty("left", `${r.left}px`, "important");
  s.setProperty("top", `${r.top}px`, "important");
  s.setProperty("width", `${r.width}px`, "important");
  s.setProperty("height", `${r.height}px`, "important");
  s.setProperty("opacity", "0", "important");
  s.setProperty("z-index", "2000", "important");
  /* none, not auto: the click is programmatic, and an invisible hit target
     over the row would swallow the user's next click after an Esc-close. */
  s.setProperty("pointer-events", "none", "important");
  const input = native.querySelector<HTMLElement>("input") ?? native;
  input.click();
  input.focus();
  window.setTimeout(() => {
    document.addEventListener(
      "mousedown",
      () => native.removeAttribute("style"),
      { once: true, capture: true }
    );
  }, 0);
}

interface DetailRow {
  key: string;
  label: string;
  value: string;
  dotColor?: string;
  native?: HTMLElement;
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

  const state = fieldOf(colA, 0);
  const reason = fieldOf(colA, 1);
  const area = fieldOf(colB, 0);
  const iteration = fieldOf(colB, 1);
  const dot = state?.querySelector<HTMLElement>('[class*="state" i][class*="c" i]');
  const dotColor = dot ? getComputedStyle(dot).backgroundColor : undefined;

  const rows: DetailRow[] = [
    { key: "state", label: "State", value: valueOf(state), dotColor, native: state ?? undefined },
    { key: "reason", label: "Reason", value: valueOf(reason), native: reason ?? undefined },
    { key: "area", label: "Area", value: leaf(valueOf(area)), native: area ?? undefined },
    { key: "iteration", label: "Iteration", value: leaf(valueOf(iteration)), native: iteration ?? undefined },
  ];

  const tagPicker = document.querySelector<HTMLElement>(
    ".work-item-form-header .work-item-tag-picker"
  );
  if (tagPicker) {
    const tags = [...tagPicker.querySelectorAll(".bolt-pill-content, .tag-item")]
      .map((t) => t.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(", ");
    rows.push({ key: "tags", label: "Tags", value: tags || "—", native: tagPicker });
  }

  const id = workItemId();
  const info = id !== null ? createdCache.get(id) : undefined;
  const created = info && info !== "pending" && info !== "failed" ? info : null;
  rows.push({ key: "created-by", label: "Created by", value: created?.by ?? "…" });
  rows.push({ key: "created-at", label: "Created", value: created?.date ?? "…" });
  return rows;
}

/** MUST stay idempotent — runs on every route change and DOM settle. */
function enhance(): void {
  const rail = document.querySelector<HTMLElement>(".work-item-form-right");
  if (!rail) {
    return;
  }
  const rows = collectRows();
  if (!rows) return;
  const id = workItemId();
  if (id !== null) ensureCreated(id);

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

  const title = document.createElement("div");
  title.className = "adofix-wi-details-label";
  title.textContent = "Details";
  host.append(title);

  for (const row of rows) {
    const el = document.createElement("div");
    el.className = "adofix-wi-kv";
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
    value.append(document.createTextNode(row.value));
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
/* Header noise out (user 2026-08-18): Follow, the redundant comment-count
   link (the discussion is right below), the History and Links tabs (Created
   by/Created live in the rail; Related Work keeps Add link), and every
   per-section Maximize toggle. */
.work-item-form-header .bolt-split-button:has(> #__bolt-follow),
.wif-comment-count-link,
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
  opacity: 0;
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
/* The adofix "Details" group at the top of the rail. */
#adofix-wi-details {
  padding: 0 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.adofix-wi-details-label {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0;
}
.adofix-wi-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
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
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
`;
