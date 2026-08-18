import type { Area, Route } from "./router";
import { log } from "./log";

export interface HotkeyRegistration {
  /** "<feature>.<name>" — built by the registry's FeatureContext. */
  action: string;
  /** Default combo; travels with the registration, not with core. */
  defaultKey: string;
  areas: Area[] | "*";
  description: string;
  handler: (e: KeyboardEvent) => void;
}

export interface Hotkeys {
  register(reg: HotkeyRegistration): void;
  /**
   * User overrides, action -> combo. The single hook Phase 3's config panel
   * needs; defaults always come from the registrations themselves.
   */
  setBindings(overrides: Record<string, string>): void;
  /** All registrations — Phase 3's config panel enumerates hotkeys from here. */
  list(): ReadonlyArray<HotkeyRegistration>;
  install(): void;
  uninstall(): void;
}

/**
 * Normalized combo: "ctrl+alt+meta+shift+key". Shift is only included for
 * non-printable keys — printable chars already encode it ("[" vs "{").
 */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  if (e.shiftKey && e.key.length > 1) parts.push("shift");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  return target.closest('[contenteditable="true"]') !== null;
}

export function createHotkeys(getRoute: () => Route): Hotkeys {
  const registrations = new Map<string, HotkeyRegistration>();
  let overrides: Record<string, string> = {};
  let installed = false;

  const bindingFor = (action: string): string | undefined =>
    overrides[action] ?? registrations.get(action)?.defaultKey;

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    if (isEditableTarget(e.target)) return;
    // Our own modals (e.g. the state picker) own their keyboard while open.
    if (e.target instanceof Element && e.target.closest("[data-adofix-modal]")) return;

    const combo = comboFromEvent(e);
    const route = getRoute();
    for (const reg of registrations.values()) {
      if (bindingFor(reg.action) !== combo) continue;
      if (reg.areas !== "*" && !reg.areas.includes(route.area)) continue;
      e.preventDefault();
      e.stopPropagation();
      log("keys", `${combo} -> ${reg.action}`);
      reg.handler(e);
      return;
    }
  };

  return {
    register(reg) {
      registrations.set(reg.action, reg);
    },
    setBindings(o) {
      overrides = { ...o };
    },
    list() {
      return [...registrations.values()];
    },
    install() {
      if (installed) return;
      installed = true;
      // Capture phase so ADO's own handlers can't swallow our combos first.
      window.addEventListener("keydown", onKeydown, true);
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      window.removeEventListener("keydown", onKeydown, true);
    },
  };
}
