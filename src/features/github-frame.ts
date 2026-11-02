import type { Feature } from "../core/registry";
import { injectStyleOnce, safeQuery, safeQueryAll } from "../core/dom";
import { closePopover, isPopoverOpen, openPopover } from "../core/popover";
import { octicon, octiconMask, type OcticonName } from "../core/primer/icons";
import { contributionId, FABRIC_ICONS, GROUP_ICONS, readHubLinks, type HubLink } from "./frame/hubs";

/**
 * GitHub makeover stage 2, the global frame (spec
 * docs/specs/2026-11-02-github-frame-design.md, decisions F1–F…): ADO's top
 * header and left rail restyled as GitHub's app header and a NavList-like
 * rail — header material, "owner / repo" breadcrumbs, filled icon
 * buttons, Octicons for the rail's hubs, GitHub's selected/hover states, a
 * gh-menu dropdown of each rail group's sub-pages (built from ADO's own
 * links), and GitHub's "Type / to search" box over ADO's own search with a
 * `/` hotkey. Layout and heights stay ADO's (F3). Selectors verified live
 * 2026-11-02 (dark) on the PR list, PR files, repo files, Kanban board and
 * work item pages.
 */

const MENU_ID = "frame-hubs";
/** Hover-to-open delay: long enough that sweeping across the rail opens nothing. */
const OPEN_DELAY_MS = 250;
/** Grace period to travel from the rail item into its menu. */
const CLOSE_DELAY_MS = 300;
/** How long ADO gets to render a flyout after a synthetic hover. */
const FLYOUT_WAIT_MS = 1000;

/* ---- Icons ------------------------------------------------------------ */

/*
 * The rail's and header's Octicons are pure CSS, generated from the hubs.ts
 * tables: each mapped host hides ADO's <img>/font glyph and paints the
 * Octicon as a currentColor mask on its ::after. Our sheet is in <head>
 * before ADO renders the rail (measured 2026-11-02: script start ~100ms
 * ahead of the first rail icon), so the Octicon is there in ADO's first
 * frame. The JS version (an <svg> appended per settle) landed ~0.7s
 * later — the settle debounce keeps restarting while ADO's first render
 * streams in — and the old icons blinked on every reload. CSS also follows
 * ADO's own re-renders for free (the rail toggle's glyph flips Right ↔
 * Left by class).
 */
const FABRIC_SCOPES = [
  ".project-navigation #__bolt-create-action",
  ".project-navigation #__bolt-settings-link",
  ".project-navigation #project-expansion-toggle",
  ".region-header-menubar .bolt-button.icon-only",
  ".region-header #__bolt-breadcrumb-extra-content",
  ".region-header .expandable-search-header .search-icon",
];

/** Mapped host selector → Octicon: rail groups by contribution id, glyphs by name. */
function iconHosts(): [string, OcticonName][] {
  const groups = Object.entries(GROUP_ICONS).map(
    ([id, name]): [string, OcticonName] => [
      `.project-navigation a.hub-group[id="__bolt-${id}-link"] .navigation-icon`,
      name,
    ]
  );
  const glyphs = Object.entries(FABRIC_ICONS).map(([glyph, name]): [string, OcticonName] => [
    fabricHosts(FABRIC_SCOPES, glyph),
    name,
  ]);
  return [...groups, ...glyphs];
}

/** The ms-Icon--<glyph> hosts under any of `scopes` (all mapped glyphs if none given). */
function fabricHosts(scopes: string[], glyph?: string): string {
  const glyphs = glyph ? [glyph] : Object.keys(FABRIC_ICONS);
  return `:is(${scopes.join(", ")}) :is(${glyphs.map((g) => `.ms-Icon--${g}`).join(", ")})`;
}

function iconCss(): string {
  return iconHosts()
    .map(
      ([host, name]) => `${host} {
  align-items: center;
  justify-content: center;
}
${host}::before {
  content: none !important;
}
${host} > * {
  display: none !important;
}
${host}::after {
  content: "";
  display: block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  background-color: currentColor;
  -webkit-mask: ${octiconMask(name)} center / contain no-repeat;
  mask: ${octiconMask(name)} center / contain no-repeat;
}`
    )
    .join("\n");
}

let cssText: string | undefined;
const css = (): string => CSS + iconCss();

const CSS = `
/* ---- Header material (F5) -------------------------------------------- */
/* Specificity beats chrome-density's canvas pin on the same elements. */
.project-header.project-header,
.project-header .region-header.region-header,
.project-header .region-header-menubar.region-header-menubar {
  background: var(--bgColor-inset) !important;
}
/* No bottom hairline (borderless, B5): the inset material already differs
   from the canvas. */
.project-header .region-header.region-header,
.project-header .region-header-menubar.region-header-menubar {
  box-shadow: none !important;
}

/* Logo: ADO's own mark, monochrome (F2) — the image becomes a mask. */
.region-header a.suite-logo.adofix-frame-logo {
  position: relative;
}
.region-header a.suite-logo.adofix-frame-logo .suite-image {
  visibility: hidden;
}
.region-header a.suite-logo.adofix-frame-logo::after {
  content: "";
  position: absolute;
  inset: 12px;
  background-color: var(--fgColor-default);
  mask: var(--adofix-frame-logo) center / contain no-repeat;
}

/* ---- Breadcrumbs: GitHub's "owner / repo" ------------------------------ */
.region-header .bolt-breadcrumb-item a,
.region-header .bolt-breadcrumb-item a:visited {
  color: var(--fgColor-default) !important;
  text-decoration: none !important;
}
.region-header .bolt-breadcrumb-item-text {
  font-size: var(--text-body-size-medium);
  font-weight: var(--base-text-weight-normal);
}
.region-header .bolt-breadcrumb-item a:hover .bolt-breadcrumb-item-text {
  text-decoration: underline;
}
/* Last crumb semibold; with a selector in the trail (repo, team), the
   selector is the "repo" and takes the weight instead. */
.region-header .bolt-breadcrumb-list-item:not(#__bolt-breadcrumb-extra-content):last-child .bolt-breadcrumb-item-text {
  font-weight: var(--base-text-weight-semibold);
}
.region-header .bolt-breadcrumb-divider {
  color: var(--fgColor-muted) !important;
}
/* Selectors living in the breadcrumb (repo, team, …): flat text buttons. */
.region-header #__bolt-breadcrumb-extra-content .bolt-button {
  color: var(--fgColor-default) !important;
  font-weight: var(--base-text-weight-semibold);
  background: transparent !important;
  border-radius: var(--borderRadius-medium) !important;
}
.region-header #__bolt-breadcrumb-extra-content .bolt-button:hover {
  background: var(--control-transparent-bgColor-hover) !important;
}
${fabricHosts([".region-header #__bolt-breadcrumb-extra-content"])} {
  color: var(--fgColor-muted);
}

/* ---- Header icon buttons: GitHub's 32px squares, filled not bordered --- */
.region-header-menubar .bolt-button.icon-only {
  box-sizing: border-box;
  width: var(--control-medium-size) !important;
  min-width: var(--control-medium-size) !important;
  height: var(--control-medium-size) !important;
  margin: 0 4px !important;
  padding: 0 !important;
  justify-content: center;
  color: var(--fgColor-muted) !important;
  background: var(--button-default-bgColor-rest) !important;
  border: var(--borderWidth-default) solid transparent !important;
  border-radius: var(--borderRadius-medium) !important;
}
.region-header-menubar .bolt-button.icon-only:hover {
  background: var(--button-default-bgColor-hover) !important;
}
/* Avatar: GitHub's round 32px. */
.region-header-menubar #mectrl_headerPicture {
  border-radius: 50% !important;
}

/* ---- Rail: GitHub NavList states (F6) ---------------------------------- */
.navigation-container .project-navigation.project-navigation {
  background: var(--bgColor-inset) !important;
  box-shadow: none;
}
/* Group separators: space only (borderless, B5). */
.project-navigation .separator {
  background: transparent !important;
}
/* ADO's selected look: a tinted container + 3px ::before bar. */
.project-navigation .hub-group-container,
.project-navigation .bolt-expandable-container {
  background: transparent !important;
}
.project-navigation .hub-group-container::before {
  display: none !important;
}
/* The current group's inline sub-page list — the dropdown replaces it. */
.project-navigation .hub-group-container > [role="menu"] {
  display: none !important;
}
.project-navigation .navigation-link,
.project-navigation #__bolt-create-action,
.project-navigation #project-expansion-toggle {
  position: relative;
  color: var(--fgColor-muted) !important;
  background: transparent !important;
}
.project-navigation .navigation-link::before,
.project-navigation #__bolt-create-action::before,
.project-navigation #project-expansion-toggle::before {
  content: "";
  position: absolute;
  inset: 4px 6px;
  border-radius: var(--borderRadius-medium);
  pointer-events: none;
}
.project-navigation .navigation-link:hover::before,
.project-navigation #__bolt-create-action:hover::before,
.project-navigation #project-expansion-toggle:hover::before,
.project-navigation .adofix-frame-open > .navigation-link::before,
.project-navigation .adofix-frame-open > .bolt-expandable-container > .navigation-link::before {
  background: var(--control-transparent-bgColor-hover);
}
.project-navigation a.hub-group.displayed::before {
  background: var(--control-transparent-bgColor-selected);
}
.project-navigation a.hub-group.displayed::after {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 4px;
  height: 24px;
  transform: translateY(-50%);
  border-radius: var(--borderRadius-medium);
  background: var(--borderColor-accent-emphasis);
}
/* Above the ::before plate (positioned content paints over in-flow). */
.project-navigation .navigation-icon,
.project-navigation .navigation-text {
  position: relative;
}
.project-navigation a.hub-group.displayed .navigation-icon,
.project-navigation a.hub-group.displayed .navigation-text {
  color: var(--fgColor-default);
}

/* The caret: click (or Enter) opens the group's dropdown. */
.project-navigation .adofix-frame-caret {
  position: absolute;
  top: 50%;
  right: 0;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 24px;
  padding: 0;
  transform: translateY(-50%);
  color: var(--fgColor-muted);
  background: transparent;
  border: none;
  border-radius: var(--borderRadius-small);
  cursor: pointer;
  opacity: 0;
}
.project-navigation .hub-group-container:hover > .adofix-frame-caret,
.project-navigation .adofix-frame-caret:focus-visible,
.project-navigation .adofix-frame-open > .adofix-frame-caret {
  opacity: 1;
}
.project-navigation .adofix-frame-caret:hover {
  color: var(--fgColor-default);
}
.project-navigation .adofix-frame-caret:focus-visible {
  outline: var(--focus-outline-width) solid var(--focus-outlineColor);
}

/* ADO's own hover flyout stays mounted (its links are the menu's source
   and click targets) but is never seen or hit. */
.bolt-callout[id^="__bolt-menu-"][id$="-hub-group-callout"] {
  visibility: hidden !important;
  pointer-events: none !important;
}

/* ---- The sub-page dropdown (gh-menu via core/popover) ----------------- */
.adofix-frame-menu {
  min-width: 220px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
}
.adofix-frame-menu .adofix-frame-menu-heading {
  padding: 6px 16px;
  font-size: var(--text-body-size-small);
  font-weight: var(--base-text-weight-semibold);
  color: var(--fgColor-muted);
}
.adofix-frame-menu a.gh-menu-item,
.adofix-frame-menu a.gh-menu-item:visited,
.adofix-frame-menu a.gh-menu-item:hover {
  color: var(--fgColor-default);
  text-decoration: none;
}
.adofix-frame-menu .gh-menu-item--selected {
  position: relative;
}
.adofix-frame-menu .gh-menu-item--selected::after {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  width: 4px;
  height: 24px;
  transform: translateY(-50%);
  border-radius: var(--borderRadius-medium);
  background: var(--borderColor-accent-emphasis);
}
.adofix-frame-menu .gh-menu-item--selected .octicon {
  color: var(--fgColor-default);
}
.adofix-frame-menu .adofix-frame-native-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  overflow: hidden;
  color: var(--fgColor-muted);
  font-size: 14px;
}
.adofix-frame-menu .adofix-frame-native-icon img {
  width: 16px;
  height: 16px;
}

/* ---- Search: GitHub's "Type / to search" over ADO's own box ----------- */
.region-header .expandable-search-header {
  align-self: stretch;
  align-items: center;
  padding: 0 8px;
}
.region-header .expandable-search-header .search {
  position: relative;
  box-sizing: border-box;
  width: 272px !important;
  height: var(--control-medium-size) !important;
  /* ADO stretches the cell, which pins a fixed-height box to the top. */
  align-self: center !important;
  align-items: center;
  color: var(--fgColor-default);
  /* The translucent field fill on the inset header, no outline (B6). */
  background: var(--bgColor-neutral-muted) !important;
  border: var(--borderWidth-default) solid transparent !important;
  border-radius: var(--borderRadius-medium) !important;
  cursor: text;
}
.region-header .expandable-search-header .search:focus-within {
  border-color: var(--focus-outlineColor) !important;
  outline: var(--borderWidth-default) solid var(--focus-outlineColor);
  outline-offset: calc(-1 * var(--borderWidth-default));
}
.region-header .expandable-search-header .search-icon {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  color: var(--fgColor-muted) !important;
}
.region-header .expandable-search-header .search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px 0 0;
  color: var(--fgColor-default) !important;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  font-size: var(--text-body-size-medium);
}
.region-header .adofix-frame-search-hint {
  position: absolute;
  left: 32px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 4px;
  transform: translateY(-50%);
  color: var(--fgColor-muted);
  font-size: var(--text-body-size-medium);
  pointer-events: none;
  white-space: nowrap;
}
.region-header .adofix-frame-search-hint kbd {
  display: inline-block;
  box-sizing: border-box;
  min-width: 16px;
  padding: 0 4px;
  font: var(--text-body-size-small) / 16px var(--fontStack-sansSerif);
  text-align: center;
  color: var(--fgColor-muted);
  background: var(--bgColor-neutral-muted);
  border: var(--borderWidth-default) solid transparent;
  border-radius: var(--borderRadius-small);
  box-shadow: none;
}
.region-header .search:focus-within .adofix-frame-search-hint,
.region-header .search:has(.search-input:not(:placeholder-shown)) .adofix-frame-search-hint {
  display: none;
}
`;

export const githubFrame: Feature = {
  id: "github-frame",
  areas: "*",
  init(ctx): void {
    ctx.hotkey("search", "/", "Focus the header search box", () => focusSearch());
  },
  apply(): void {
    injectStyleOnce("github-frame", (cssText ??= css()));
    decorateLogo();
    decorateSearch();
    bindRailGroups();
  },
};

/** ADO's logo, monochrome: its own image URL becomes a CSS mask (F2). */
function decorateLogo(): void {
  const a = safeQuery<HTMLAnchorElement>(".region-header a.suite-logo");
  const src = a?.querySelector<HTMLImageElement>(".suite-image")?.src;
  if (!a || !src) return;
  const value = `url("${src.replace(/"/g, "%22")}")`;
  if (a.style.getPropertyValue("--adofix-frame-logo") !== value)
    a.style.setProperty("--adofix-frame-logo", value);
  a.classList.add("adofix-frame-logo");
}

/* ---- Search ------------------------------------------------------------ */

const SEARCH_INPUT = ".region-header .expandable-search-header input.search-input";

/**
 * GitHub's "Type [/] to search" hint over ADO's own search input, which
 * keeps ADO's suggestions and submit (→ ADO's search page). A blank
 * placeholder keeps :placeholder-shown working for the hint's CSS.
 */
function decorateSearch(): void {
  const input = safeQuery<HTMLInputElement>(SEARCH_INPUT);
  const box = input?.closest(".search");
  if (!input || !box) return;
  if (input.placeholder !== " ") input.placeholder = " ";
  if (!box.querySelector(":scope > .adofix-frame-search-hint")) {
    const hint = document.createElement("span");
    hint.className = "adofix-frame-search-hint";
    hint.setAttribute("aria-hidden", "true");
    const kbd = document.createElement("kbd");
    kbd.textContent = "/";
    hint.append("Type ", kbd, " to search");
    box.appendChild(hint);
  }
  if (!input.dataset["adofixFrame"]) {
    input.dataset["adofixFrame"] = "1";
    // Escape leaves the box (GitHub); ADO's own handler still sees it.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") input.blur();
    });
  }
}

function focusSearch(): void {
  let input = safeQuery<HTMLInputElement>(SEARCH_INPUT);
  // A narrow window collapses ADO's box to its icon; the icon expands it.
  if (input && input.getBoundingClientRect().width === 0) {
    safeQuery(".region-header .expandable-search-header .search-icon")?.click();
    input = safeQuery<HTMLInputElement>(SEARCH_INPUT);
  }
  input?.focus();
  input?.select();
}

/* ---- Rail dropdowns ---------------------------------------------------- */

interface RailGroup {
  link: HTMLAnchorElement;
  container: HTMLElement;
  /** Contribution id, e.g. "ms-vss-work-web-work-hub-group". */
  id: string;
}

function railGroup(container: Element): RailGroup | null {
  const link = container.querySelector<HTMLAnchorElement>("a.hub-group");
  const id = link ? contributionId(link.id) : null;
  if (!link || !id || !(container instanceof HTMLElement)) return null;
  return { link, container, id };
}

/** The current group's inline list (hidden by CSS, still clickable). */
function inlineList(group: RailGroup): Element | null {
  return group.container.querySelector(':scope > [role="menu"]');
}

/** The element whose hover makes ADO render the group's flyout. */
function flyoutTrigger(group: RailGroup): HTMLElement | null {
  return group.container.querySelector<HTMLElement>(":scope > .bolt-expandable-container");
}

function flyout(group: RailGroup): HTMLElement | null {
  return document.getElementById(`__bolt-menu-${group.id}-callout`);
}

function hover(el: HTMLElement, on: boolean): void {
  const types = on ? ["mouseenter", "mouseover"] : ["mouseleave", "mouseout"];
  for (const type of types)
    el.dispatchEvent(new MouseEvent(type, { bubbles: type.endsWith("over") || type.endsWith("out") }));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Makes ADO render the group's (invisible) flyout by a synthetic hover and
 * waits for its links. Null for groups without one (single-hub groups such
 * as Artifacts) or when ADO never renders it.
 */
async function renderFlyout(group: RailGroup): Promise<HTMLElement | null> {
  const trigger = flyoutTrigger(group);
  if (!trigger) return null;
  hover(trigger, true);
  for (let waited = 0; waited < FLYOUT_WAIT_MS; waited += 50) {
    const callout = flyout(group);
    if (callout && readHubLinks(callout).length > 0) return callout;
    await sleep(50);
  }
  return null;
}

async function groupLinks(group: RailGroup): Promise<HubLink[]> {
  const inline = inlineList(group);
  if (inline) return readHubLinks(inline);
  const existing = flyout(group);
  const links = existing ? readHubLinks(existing) : [];
  if (links.length > 0) return links;
  const callout = await renderFlyout(group);
  return callout ? readHubLinks(callout) : [];
}

function hasDropdown(group: RailGroup): boolean {
  return inlineList(group) !== null || flyoutTrigger(group) !== null;
}

/**
 * Navigates the way ADO would: clicks ADO's own link (inline list or
 * flyout row, resolved by id at click time — ADO re-renders both) so its
 * router does an in-app navigation. Falls back to a page load.
 */
async function navigate(group: RailGroup, link: HubLink): Promise<void> {
  let native = document.getElementById(link.elementId);
  if (!native && !inlineList(group)) {
    await renderFlyout(group);
    native = document.getElementById(link.elementId);
  }
  if (native) native.click();
  else location.assign(link.href);
  const trigger = flyoutTrigger(group);
  if (trigger) hover(trigger, false);
}

let openGroupId: string | null = null;
let hoverOpened = false;
let openTimer: ReturnType<typeof setTimeout> | undefined;
/** The group a hover-open is pending for (mousemove must not restart it). */
let pendingGroupId: string | null = null;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped per open request, so a slow flyout can't open a stale menu. */
let openSeq = 0;

function markOpen(id: string | null): void {
  for (const c of safeQueryAll(".project-navigation .adofix-frame-open")) c.classList.remove("adofix-frame-open");
  if (!id) return;
  for (const container of safeQueryAll(".project-navigation .hub-group-container")) {
    if (railGroup(container)?.id === id) container.classList.add("adofix-frame-open");
  }
}

function menuIsOpen(): boolean {
  const open = openGroupId !== null && isPopoverOpen(MENU_ID);
  if (!open && openGroupId !== null) {
    openGroupId = null;
    markOpen(null);
  }
  return open;
}

async function openMenu(group: RailGroup, takeFocus: boolean): Promise<void> {
  const seq = ++openSeq;
  const links = await groupLinks(group);
  if (seq !== openSeq || links.length === 0) return;
  // ADO's flyout was only needed for its links; the rail keeps the hover.
  const label = group.link.getAttribute("aria-label") ?? group.link.textContent?.trim() ?? "";
  openPopover({
    id: MENU_ID,
    anchor: group.link,
    className: "adofix-frame-menu",
    placement: "right-start",
    takeFocus,
    keepOpenWithin: ".adofix-frame-caret",
    render(menu, ctx) {
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", label);
      if (label) {
        const heading = document.createElement("div");
        heading.className = "adofix-frame-menu-heading";
        heading.textContent = label;
        menu.appendChild(heading);
      }
      for (const link of links) menu.appendChild(menuLink(group, link, ctx.close));
      menu.addEventListener("mouseenter", () => clearTimeout(closeTimer));
      menu.addEventListener("mouseleave", scheduleClose);
    },
  });
  openGroupId = group.id;
  hoverOpened = !takeFocus;
  markOpen(group.id);
  if (takeFocus) {
    const items = safeQueryAll<HTMLElement>(`[data-adofix="${MENU_ID}"] .adofix-menu-item`);
    (items.find((i) => i.classList.contains("gh-menu-item--selected")) ?? items[0])?.focus();
  }
}

function menuLink(group: RailGroup, link: HubLink, close: () => void): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "adofix-menu-item gh-menu-item";
  a.href = link.href;
  a.setAttribute("role", "menuitem");
  if (link.current) {
    a.classList.add("gh-menu-item--selected");
    a.setAttribute("aria-current", "page");
  }
  if (link.icon) a.appendChild(octicon(link.icon));
  else {
    const slot = document.createElement("span");
    slot.className = "adofix-frame-native-icon";
    if (link.nativeIcon) slot.appendChild(link.nativeIcon.cloneNode(true));
    a.appendChild(slot);
  }
  const text = document.createElement("span");
  text.textContent = link.label;
  a.appendChild(text);
  a.addEventListener("click", (e) => {
    // New-tab clicks keep the browser's own handling of the real href.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    void navigate(group, link);
  });
  return a;
}

function scheduleOpen(group: RailGroup): void {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  pendingGroupId = null;
  if (menuIsOpen() && openGroupId === group.id) return;
  // A keyboard-opened menu is the user's; hovering past doesn't replace it.
  if (menuIsOpen() && !hoverOpened) return;
  pendingGroupId = group.id;
  openTimer = setTimeout(() => {
    pendingGroupId = null;
    void openMenu(group, false);
  }, OPEN_DELAY_MS);
}

function scheduleClose(): void {
  clearTimeout(openTimer);
  pendingGroupId = null;
  openSeq++;
  if (!menuIsOpen() || !hoverOpened) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (hoverOpened && menuIsOpen()) {
      closePopover();
      menuIsOpen();
    }
  }, CLOSE_DELAY_MS);
}

function toggleFromKeyboardOrClick(group: RailGroup): void {
  clearTimeout(openTimer);
  pendingGroupId = null;
  clearTimeout(closeTimer);
  if (menuIsOpen() && openGroupId === group.id) {
    closePopover();
    menuIsOpen();
    return;
  }
  void openMenu(group, true);
}

/**
 * Per rail group with sub-pages: hover (after a delay) opens the dropdown
 * like ADO's own flyout did; the caret button and ArrowRight on the item
 * open it with focus. A plain click on the item still navigates to the
 * group's default page (ADO's behavior). Listeners bind once per container
 * element; the caret is re-added when React drops it.
 */
function bindRailGroups(): void {
  for (const container of safeQueryAll(".project-navigation .hub-group-container")) {
    const group = railGroup(container);
    if (!group || !hasDropdown(group)) continue;
    if (!container.querySelector(":scope > .adofix-frame-caret")) {
      const caret = document.createElement("button");
      caret.type = "button";
      caret.className = "adofix-frame-caret";
      caret.tabIndex = -1;
      caret.setAttribute("aria-label", `${group.link.getAttribute("aria-label") ?? ""} pages`.trim());
      caret.setAttribute("aria-haspopup", "menu");
      caret.appendChild(octicon("chevron-right", 12));
      caret.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = railGroup(container);
        if (current) toggleFromKeyboardOrClick(current);
      });
      container.appendChild(caret);
    }
    if (container.dataset["adofixFrame"]) continue;
    container.dataset["adofixFrame"] = "1";
    // Group re-resolved per event: React may swap the link element.
    // mousemove too: a pointer already resting on the item when the page
    // settles never fires mouseenter.
    const onEnter = (): void => {
      const current = railGroup(container);
      if (current && pendingGroupId !== current.id) scheduleOpen(current);
    };
    container.addEventListener("mouseenter", onEnter);
    container.addEventListener("mousemove", onEnter);
    container.addEventListener("mouseleave", scheduleClose);
    container.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "ArrowRight" || !(e.target instanceof Element) || !e.target.matches("a.hub-group")) return;
        const current = railGroup(container);
        if (!current) return;
        // Before ADO's focus zone, which would move focus into its (hidden) flyout.
        e.preventDefault();
        e.stopPropagation();
        toggleFromKeyboardOrClick(current);
      },
      true
    );
  }
}
