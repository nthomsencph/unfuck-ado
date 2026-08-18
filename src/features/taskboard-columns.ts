import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { ACCENT, ADOFIX_ATTR, injectStyleOnce } from "../core/dom";
import { log } from "../core/log";
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
  max-width: 100%;
  min-width: 0;
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
 * CSS hiding the given columns and sharing the freed width. Empty = native.
 * Visible columns get explicit calc() shares, NOT width:auto — Firefox's
 * fixed-table-layout gives auto cols nothing here and the table shrink-wraps
 * instead of filling the pane (user-reported 2026-08-18; Chrome distributed
 * the slack). parentPx is the parent-column track (ADO's inline width).
 */
export function columnCss(hiddenNth: number[], visibleNth: number[], parentPx = 220): string {
  if (hiddenNth.length === 0 || visibleNth.length === 0) return "";
  const hideCells = hiddenNth.map((k) => `${TABLE} tr > :nth-child(${k})`).join(",\n");
  const hideCols = hiddenNth.map((k) => `${TABLE} > colgroup > col:nth-child(${k})`).join(",\n");
  const shareCols = visibleNth.map((k) => `${TABLE} > colgroup > col:nth-child(${k})`).join(",\n");
  const reserved = parentPx + 8; // parent track + the two 4px border cols
  return `
${hideCells} { display: none !important; }
${hideCols} { width: 0 !important; }
${shareCols} { width: calc((100% - ${reserved}px) / ${visibleNth.length}) !important; }
${TABLE} { min-width: 0 !important; }
${TABLE} > colgroup > col:first-child,
${TABLE} > colgroup > col:last-child { width: 4px !important; }
`;
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

function boardHeaders(): string[] {
  const table = document.querySelector(TABLE);
  if (!table) return [];
  return Array.from(table.querySelectorAll("th")).map((t) => t.textContent ?? "");
}

function parentColPx(): number {
  const col = document.querySelector(`${TABLE} > colgroup > col:nth-child(2)`);
  const match = /(\d+(?:\.\d+)?)px/.exec(col?.getAttribute("style") ?? "");
  return match ? Number(match[1]) : 220;
}

function applyColumnCss(key: string): void {
  const cols = stateColumns(boardHeaders());
  const hidden = new Set(prefs(key).hidden);
  const hiddenNth = cols.filter((c) => hidden.has(c.name)).map((c) => c.nth);
  const visibleNth = cols.filter((c) => !hidden.has(c.name)).map((c) => c.nth);
  const css = columnCss(hiddenNth, visibleNth, parentColPx());
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
  },
  dispose(): void {
    closeMenu();
  },
};
