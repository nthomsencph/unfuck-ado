/**
 * Teleport-edit machinery: place a stub-hidden native control over the
 * clicked KV row (visible, position:fixed), click its input so ADO's callout
 * opens anchored there, and restore the stub on the next mousedown, page
 * scroll, Escape or focus loss OUTSIDE the edit (the callout itself handles
 * that interaction before the anchor snaps back).
 */

const OVERLAY_SELECTOR =
  '[class*="callout"], [class*="portal"], [class*="flyout"], [class*="dropdown-items"]';

/** Teleported controls never shrink below a usable bolt-input height. */
const TELEPORT_MIN_HEIGHT = 28;

/**
 * Does `target` belong to the live edit — the control itself or its own
 * callout? An overlay counts as the edit's callout only when it does NOT
 * contain the control: a dropdown's portal is a SIBLING tree, while the work
 * item DIALOG's root (class bolt-dialog-callout-content — "callout"!) is an
 * ANCESTOR of everything, which made every click, scroll and focus look
 * "inside" and no restore ever fire (the stuck-fixed-controls bug, dialog
 * rendering only).
 */
export function isInsideEdit(target: EventTarget | null, native: HTMLElement): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (native.contains(target)) return true;
  const overlay = target.closest(OVERLAY_SELECTOR);
  return overlay !== null && !overlay.contains(native);
}

/** At most one teleport is live; whatever ends it runs this. */
let endTeleport: (() => void) | null = null;

export function teleport(native: HTMLElement, row: HTMLElement): void {
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
  const height = Math.max(block ? valRect.height : rowRect.height, TELEPORT_MIN_HEIGHT);
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
  const onDown = (e: MouseEvent): void => {
    // Clicks inside the control or its callout keep the edit alive.
    if (!isInsideEdit(e.target, native)) cleanup();
  };
  const onScroll = (e: Event): void => {
    // Page scroll while fixed = the control sticks to the viewport — end
    // the edit. Scrolling INSIDE the callout list stays alive.
    if (!isInsideEdit(e.target, native)) cleanup();
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
      if (isInsideEdit(document.activeElement, native)) return;
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
