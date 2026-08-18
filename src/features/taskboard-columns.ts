import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { ACCENT, ADOFIX_ATTR, injectStyleOnce } from "../core/dom";
import { log } from "../core/log";
import { debounce } from "../core/observe";
import { getValue, setValue } from "../core/storage";
import { sprintTab } from "./sprint-header";

/**
 * Taskboard column chooser + multi-card rows (user request 2026-08-18: ADO
 * has no way to hide taskboard state columns, and cards always stack 1-wide).
 *  - An adofix-owned icon button in the taskboard header opens a checklist
 *    of the board's state columns; unchecked columns disappear and the rest
 *    share the freed width. Preferences persist per org/project/team.
 *  - "2-up cards": cards get flex-basis 150px inside ADO's own flex-wrap
 *    cell container, so they pack 2-up (or more) wherever a column is wide
 *    enough and fall back to 1-up in narrow columns. The load-bearing pieces
 *    (verified live 2026-08-18): the cells' card container is already
 *    flex-row/flex-wrap; cards need min-width:0 because min-width:auto
 *    (flex min-content) otherwise forces 1-per-row; and the taskboard table
 *    carries an inline min-width (11 columns × 204px) that must be zeroed
 *    before hidden columns free any width. Column tracks are <col>s with
 *    inline percent widths — our stylesheet !important overrides them, with
 *    the 0%-width border cols pinned to 4px because fixed-layout treats 0%
 *    as auto and would hand them a full share.
 * All hiding is per-nth-child CSS generated from the CURRENT header texts,
 * with preferences stored by state NAME so a process/board reconfiguration
 * cannot hide the wrong column.
 */
const FEATURE_ID = "taskboard-columns";

const BTN_CLASS = "adofix-columns-btn";
const MENU_ATTR = `${FEATURE_ID}-menu`;
const TWO_UP_ATTR = "data-adofix-taskboard-2up";
const TABLE = "table:has(td.taskboard-expanded-cell)";

interface Prefs {
  hidden: string[];
  twoUp: boolean;
}

const DEFAULT_PREFS: Prefs = { hidden: [], twoUp: true };

const CSS = `
.${BTN_CLASS} { position: relative; }
.${BTN_CLASS}[data-filtering="true"]::after {
  content: "";
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${ACCENT};
}
html[${TWO_UP_ATTR}] .taskboard-expanded-cell .flex-row.flex-wrap > .taskboard-card {
  flex: 1 1 150px;
  box-sizing: border-box;
  /* single-file cards stop growing at 280px — with the fill regime's
     150-330px tracks a 360px cap never bound (v0.16.1), so 1-up cards
     still filled their column */
  max-width: min(100%, 280px);
  min-width: 0;
}
/* Airier cards (user request 2026-08-18; native padding is 12px all round). */
.taskboard-card .card-content {
  padding: 16px 12px !important;
}
/* Card layout: line 1 = type icon + id (+ ⋮), the title on its own line(s). */
.taskboard-card a.title {
  display: block;
  margin: 4px 0 0 !important;
}
/* Board surface flat + the PR-overview card material (chrome.css language:
   page-surface bg, heavy double shadow, --adofix-radius corners; overflow
   hidden clips the state stripe to the rounded corners). */
.taskboard-expanded-cell {
  background: var(--adofix-lane, #1d1c1b) !important;
}
.taskboard-card {
  background: var(--adofix-card, #252423) !important;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    0 1px 4px rgba(0, 0, 0, 0.5) !important;
  border-radius: var(--adofix-radius, 10px) !important;
  overflow: hidden;
}
/* Breathing room inside every board cell — natively cards sit ~5px from the
   row edge (1px cell padding + 4px card margin). */
.taskboard-expanded-cell,
.taskboard-parent-cell {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
/* Count pinned to the header's right edge, same line — never wrapping under
   a long state name (absolute, with the th reserving room for it). */
th:has(> .adofix-col-count) {
  position: relative;
  padding-right: 40px !important;
}
.adofix-col-count {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary-color, #a19f9d);
  white-space: nowrap;
}
/* The assignment/parent column is capped (PARENT_MAX in colTargets) — let
   long names wrap instead of ellipsizing at the cap. TWO nowrap+ellipsis
   layers: .identity-view AND its inner .identity-display-name (verified
   live 2026-08-18; unwrapping only the outer still ellipsized). */
.taskboard-parent-cell .identity-view,
.taskboard-parent-cell .identity-display-name {
  white-space: normal !important;
}
/* Same surface language as the pr-comments menu. */
.adofix-columns-menu {
  position: fixed;
  z-index: 100000;
  min-width: 240px;
  background: var(--callout-background-color, #201f1e);
  color: var(--text-primary-color, #fff);
  border: 1px solid var(--border-subtle-color, rgba(128, 128, 128, 0.25));
  border-radius: var(--adofix-radius, 10px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  padding: 6px;
  font-size: 13px;
}
.adofix-columns-status {
  padding: 6px 10px;
  color: var(--text-secondary-color, #a19f9d);
}
.adofix-columns-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.adofix-columns-item:hover { background: rgba(128, 128, 128, 0.12); }
.adofix-columns-item[disabled] { opacity: 0.5; cursor: default; }
.adofix-columns-item[disabled]:hover { background: transparent; }
.adofix-columns-check {
  width: 18px;
  flex-shrink: 0;
  color: ${ACCENT};
}
.adofix-columns-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--border-subtle-color, rgba(128, 128, 128, 0.25));
}
`;

/** Header texts → the state columns as {name, nth} (nth-child is 1-based). */
export function stateColumns(headerTexts: string[]): Array<{ name: string; nth: number }> {
  // Structure: [left border, parent "Collapse all", ...states, right border].
  if (headerTexts.length < 4) return [];
  return headerTexts
    .slice(2, headerTexts.length - 1)
    .map((name, i) => ({ name: name.trim(), nth: i + 3 }))
    .filter((c) => c.name.length > 0);
}

/**
 * CSS hiding the given columns' cells and unlocking the table width. Empty =
 * native. Column WIDTHS are deliberately not set here: Firefox's fixed table
 * layout ignores both width:auto (v0.15.0 — the table shrink-wrapped) and
 * percentage/calc widths (v0.15.1 — same symptom) on <col> elements, while
 * Chrome resolves both. Widths are written as inline PIXELS by
 * applyColWidths, the mechanism backlog-grid already proved in Firefox.
 */
/**
 * Two-regime fit (both thresholds set by live user feedback, 2026-08-18):
 * fill the pane exactly whenever the equal share stays usable (≥ FILL_MIN,
 * the card's flex basis — 107px columns read as "the table shrank"), and
 * below that render NATIVE-width columns with a reduced h-scroll instead of
 * sub-native slivers (156px was expected to fill; 8×204 with scroll while
 * the pane could fit 8×156 read as "they don't widen").
 */
export const FILL_MIN = 150;
export const NATIVE_COL = 204;
/** The assignment/parent column auto-sizes to the longest name — cap it
    (user request 2026-08-18); the wrap CSS lets capped names break. */
export const PARENT_MAX = 180;

export function columnCss(hiddenNth: number[], visibleNth: number[], tableMin: number): string {
  if (hiddenNth.length === 0 || visibleNth.length === 0) return "";
  const hideCells = hiddenNth.map((k) => `${TABLE} tr > :nth-child(${k})`).join(",\n");
  // The exact computed sum, NOT 0: overrides ADO's inline min-width (2464)
  // deterministically in both engines, and keeps the reduced h-scroll honest
  // when the visible columns can't all fit at MIN_COL.
  return `
${hideCells} { display: none !important; }
${TABLE} { min-width: ${tableMin}px !important; }
`;
}

export interface ColPlan {
  /** 1-based nth → px. Parent col keeps ADO's own width, absent here. */
  widths: Map<number, number>;
  /** Exact table width: container when the shares fit, else the col sum. */
  tableMin: number;
}

/**
 * Pixel plan for the current container width, keyed by COLUMN TRACK (1-based
 * <col> position), laid out COMPACTLY: border, parent (untouched, absent
 * here), the n visible shares in order, the trailing border, then zeros.
 * Track positions deliberately do NOT correspond to the hidden columns'
 * original positions: display:none'd cells make every later cell in the row
 * SHIFT LEFT into earlier tracks (cells map to tracks by rendered order,
 * not index). Zeroing tracks in place — v0.15.4 — worked only when the
 * hidden columns were trailing; hiding MIDDLE columns bunched the shifted
 * header labels into the zeroed tracks and left the freed tracks as dead
 * space at the right (user screenshot 2026-08-18).
 * Widths: equal shares when that keeps columns usable (≥ FILL_MIN),
 * otherwise native width plus a reduced h-scroll.
 */
export function colTargets(
  visibleCount: number,
  colCount: number,
  containerW: number,
  parentPx: number
): ColPlan {
  const widths = new Map<number, number>();
  const n = visibleCount;
  if (n === 0 || containerW <= 0) return { widths, tableMin: 0 };
  const parent = Math.min(parentPx, PARENT_MAX);
  const avail = Math.max(0, containerW - parent - 8);
  const share = Math.floor(avail / n);
  const fill = share >= FILL_MIN;
  widths.set(1, 4);
  widths.set(2, parent);
  for (let i = 0; i < n; i++) {
    widths.set(3 + i, fill ? (i === n - 1 ? avail - share * (n - 1) : share) : NATIVE_COL);
  }
  widths.set(3 + n, 4); // the right border cell shifts here
  for (let track = 4 + n; track <= colCount; track++) widths.set(track, 0);
  return { widths, tableMin: fill ? containerW : parent + 8 + NATIVE_COL * n };
}

/** "/{org}/{project}/_sprints/{tab}/{team}/…" → "org/project/team". */
export function taskboardTeamKey(path: string): string | null {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const hub = segments.indexOf("_sprints");
  if (hub < 1) return null;
  const team = segments[hub + 2];
  if (!team) return null;
  return `${segments[0]}/${segments[hub - 1]}/${team}`;
}

function prefs(key: string): Prefs {
  return getValue<Prefs>(FEATURE_ID, key, DEFAULT_PREFS);
}

const COUNT_CLASS = "adofix-col-count";

/** The header's own name, with our appended " (n)" count stripped back out. */
export function headerName(th: Element): string {
  const count = th.querySelector(`.${COUNT_CLASS}`);
  const full = th.textContent ?? "";
  return count?.textContent ? full.replace(count.textContent, "") : full;
}

function boardHeaders(): string[] {
  const table = document.querySelector(TABLE);
  if (!table) return [];
  return Array.from(table.querySelectorAll("th")).map(headerName);
}

/** "New (7)" — card count per state column, appended as an adofix span. */
function applyCounts(): void {
  const table = document.querySelector(TABLE);
  if (!table) return;
  const ths = Array.from(table.querySelectorAll("th"));
  for (const col of stateColumns(ths.map(headerName))) {
    const th = ths[col.nth - 1];
    if (!th) continue;
    // Hidden cells stay in the DOM (display:none), so the original nth
    // mapping counts correctly for hidden columns too.
    const n = table.querySelectorAll(`tbody tr > td:nth-child(${col.nth}) .taskboard-card`).length;
    let span = th.querySelector<HTMLElement>(`.${COUNT_CLASS}`);
    if (!span) {
      span = document.createElement("span");
      span.className = COUNT_CLASS;
      th.appendChild(span);
    }
    const text = ` (${n})`;
    if (span.textContent !== text) span.textContent = text;
  }
}

/** Original inline styles, remembered so "Show all columns" restores them. */
const originalColStyle = new WeakMap<HTMLTableColElement, string>();
const observedContainers = new WeakSet<Element>();
let refitKey: string | null = null;

function parentColPx(cols: HTMLTableColElement[]): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(cols[1]?.getAttribute("style") ?? "");
  return match ? Number(match[1]) : 220;
}

function applyColWidths(hiddenNth: number[], visibleNth: number[]): number {
  const table = document.querySelector<HTMLTableElement>(TABLE);
  const container = table?.closest<HTMLElement>(".bolt-table-container");
  if (!table || !container) return 0;
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"));
  if (cols.length === 0) return 0;

  if (hiddenNth.length === 0) {
    // Back to native: restore whatever ADO had written before our first fit —
    // except the parent column, which stays capped even on an unmodified
    // board (its auto-size-to-longest-name is the thing being fixed).
    for (const col of cols) {
      const original = originalColStyle.get(col);
      if (original !== undefined && col.getAttribute("style") !== original) {
        col.setAttribute("style", original);
      }
    }
    const parentCol = cols[1];
    if (parentCol) {
      const cap = Math.min(parentColPx(cols), PARENT_MAX);
      if (!originalColStyle.has(parentCol)) {
        originalColStyle.set(parentCol, parentCol.getAttribute("style") ?? "");
      }
      if (parentCol.style.width !== `${cap}px`) parentCol.style.width = `${cap}px`;
    }
    return 0;
  }

  const { widths, tableMin } = colTargets(
    visibleNth.length,
    cols.length,
    container.clientWidth,
    parentColPx(cols)
  );
  widths.forEach((px, nth) => {
    const col = cols[nth - 1];
    if (!col) return;
    if (!originalColStyle.has(col)) originalColStyle.set(col, col.getAttribute("style") ?? "");
    // Compare the ATTRIBUTE, never the rendered width: ADO's 9.09% tracks
    // can render within 1px of the target, which left the percentages in
    // place (the v0.15.2 Firefox bug — percentages must always give way to
    // deterministic pixels).
    if (col.style.width !== `${px}px`) col.style.width = `${px}px`;
  });

  // Splitter drags and window resizes never reach the childList-only settle
  // observer — refit from a ResizeObserver, same as backlog-grid.
  if (!observedContainers.has(container)) {
    observedContainers.add(container);
    const refit = debounce(() => {
      if (refitKey) applyColumnCss(refitKey);
    }, 100);
    new ResizeObserver(refit).observe(container);
  }
  return tableMin;
}

function applyColumnCss(key: string): void {
  refitKey = key;
  const cols = stateColumns(boardHeaders());
  const hidden = new Set(prefs(key).hidden);
  const hiddenNth = cols.filter((c) => hidden.has(c.name)).map((c) => c.nth);
  const visibleNth = cols.filter((c) => !hidden.has(c.name)).map((c) => c.nth);
  const tableMin = applyColWidths(hiddenNth, visibleNth);
  const css = tableMin > 0 ? columnCss(hiddenNth, visibleNth, tableMin) : "";
  let style = document.querySelector<HTMLStyleElement>(
    `style[${ADOFIX_ATTR}="${FEATURE_ID}-dynamic"]`
  );
  if (!style) {
    style = document.createElement("style");
    style.setAttribute(ADOFIX_ATTR, `${FEATURE_ID}-dynamic`);
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  const btn = document.querySelector<HTMLElement>(`.${BTN_CLASS}`);
  btn?.setAttribute("data-filtering", String(hiddenNth.length > 0));
}

function closeMenu(): void {
  document.querySelector(`[${ADOFIX_ATTR}="${MENU_ATTR}"]`)?.remove();
  document.removeEventListener("mousedown", onOutsideMouseDown, true);
  document.removeEventListener("keydown", onMenuKeyDown, true);
}

function onOutsideMouseDown(e: MouseEvent): void {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(`[${ADOFIX_ATTR}="${MENU_ATTR}"], .${BTN_CLASS}`)) return;
  closeMenu();
}

function onMenuKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") closeMenu();
}

function menuItem(
  label: string,
  opts: { checked?: boolean; disabled?: boolean },
  onClick?: () => void
): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "adofix-columns-item";
  const check = document.createElement("span");
  check.className = "adofix-columns-check";
  check.textContent = opts.checked ? "✓" : "";
  item.append(check, label);
  if (opts.disabled) item.disabled = true;
  if (onClick && !opts.disabled) {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return item;
}

function openMenu(anchor: HTMLElement, key: string): void {
  closeMenu();
  const menu = document.createElement("div");
  menu.setAttribute(ADOFIX_ATTR, MENU_ATTR);
  menu.className = "adofix-columns-menu";

  const current = prefs(key);
  const cols = stateColumns(boardHeaders());
  const hidden = new Set(current.hidden);
  const visibleCount = cols.filter((c) => !hidden.has(c.name)).length;

  const status = document.createElement("div");
  status.className = "adofix-columns-status";
  status.textContent = "Board columns";
  menu.appendChild(status);

  for (const col of cols) {
    const isVisible = !hidden.has(col.name);
    menu.appendChild(
      // The last visible column cannot be hidden — an all-hidden board would
      // leave nothing to click our button back from.
      menuItem(col.name, { checked: isVisible, disabled: isVisible && visibleCount === 1 }, () => {
        const next = new Set(current.hidden);
        if (isVisible) next.add(col.name);
        else next.delete(col.name);
        setValue<Prefs>(FEATURE_ID, key, { ...current, hidden: [...next] });
        applyColumnCss(key);
        openMenu(anchor, key); // re-render in place
      })
    );
  }

  const divider = document.createElement("div");
  divider.className = "adofix-columns-divider";
  menu.appendChild(divider);

  menu.appendChild(
    menuItem("2-up cards where they fit", { checked: current.twoUp }, () => {
      const next = { ...current, twoUp: !current.twoUp };
      setValue<Prefs>(FEATURE_ID, key, next);
      document.documentElement.toggleAttribute(TWO_UP_ATTR, next.twoUp);
      openMenu(anchor, key);
    })
  );
  menu.appendChild(
    menuItem("Show all columns", { disabled: hidden.size === 0 }, () => {
      setValue<Prefs>(FEATURE_ID, key, { ...current, hidden: [] });
      applyColumnCss(key);
      openMenu(anchor, key);
    })
  );

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  document.addEventListener("mousedown", onOutsideMouseDown, true);
  document.addEventListener("keydown", onMenuKeyDown, true);
}

/** Columns glyph, currentColor so it follows bolt's subtle-button styling. */
function columnsIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  for (const [x, opacity] of [
    [1, "1"],
    [6, "1"],
    [11, "0.45"],
  ] as const) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", "2");
    rect.setAttribute("width", "4");
    rect.setAttribute("height", "12");
    rect.setAttribute("rx", "1");
    rect.setAttribute("opacity", opacity);
    svg.appendChild(rect);
  }
  return svg;
}

function ensureButton(key: string): void {
  const filter = document.getElementById("__bolt-filter");
  const bar = filter?.parentElement;
  if (!filter || !bar || bar.querySelector(`.${BTN_CLASS}`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    `${BTN_CLASS} bolt-header-command-item-button bolt-button ` +
    "bolt-icon-button enabled subtle icon-only bolt-focus-treatment";
  btn.setAttribute("aria-label", "Show or hide board columns");
  btn.title = "Show/hide board columns (ado-unfuck)";
  btn.appendChild(columnsIcon());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (document.querySelector(`[${ADOFIX_ATTR}="${MENU_ATTR}"]`)) closeMenu();
    else openMenu(btn, key);
  });
  filter.insertAdjacentElement("afterend", btn);
  log(FEATURE_ID, "button injected");
}

export const taskboardColumns: Feature = {
  id: FEATURE_ID,
  areas: ["boards"],
  apply(route: Route): void {
    injectStyleOnce(FEATURE_ID, CSS);
    const onTaskboard = sprintTab(route.path) === "taskboard";
    const key = onTaskboard ? taskboardTeamKey(route.path) : null;
    if (!key) {
      document.documentElement.removeAttribute(TWO_UP_ATTR);
      closeMenu();
      return;
    }
    document.documentElement.toggleAttribute(TWO_UP_ATTR, prefs(key).twoUp);
    if (!document.querySelector(TABLE)) return;
    applyColumnCss(key);
    ensureButton(key);
    applyCounts();
  },
  dispose(): void {
    closeMenu();
  },
};
