import { safeQuery } from "../../core/dom";

/**
 * Access to ADO's Monaco diff-editor INSTANCE (not just its DOM). All
 * verified live 2026-08-19 on dev.azure.com:
 *
 * - `window.monaco` exists but is an old API surface with no editor registry
 *   (`monaco.editor` has only getModels/getModel), so the instance is fished
 *   out of React internals: the PARENT element of `.monaco-diff-editor`
 *   carries a `__reactInternalInstance$` fiber whose `return` chain (within a
 *   few hops) reaches a class component whose stateNode holds the diff editor
 *   in a property (named `editor` today — duck-typed here, names are
 *   minified).
 * - `revealLineInCenter()` works. Synthetic wheel and keyboard events and
 *   `pushState`+popstate all do NOTHING to ADO's Monaco — the instance is the
 *   only scroll lever.
 * - View zones: `addZone()` alone leaves the dom node `display:none`;
 *   `layoutZone()` + `layout()` right after makes it render. Monaco re-reads
 *   the SAME zone descriptor object on `layoutZone`, so mutating its
 *   `heightInPx` and re-laying-out resizes a zone in place. The diff editor
 *   auto-inserts a matching spacer in the original pane — side-by-side
 *   alignment survives. A zone's domNode needs a `z-index` to receive pointer
 *   events (`.view-lines` covers it otherwise).
 */

export interface ViewZone {
  /** 0 places the zone above line 1. */
  afterLineNumber: number;
  heightInPx: number;
  domNode: HTMLElement;
  suppressMouseDown?: boolean;
}

export interface ViewZoneAccessor {
  addZone(zone: ViewZone): string;
  removeZone(id: string): void;
  layoutZone(id: string): void;
}

export interface MonacoEditor {
  getDomNode(): HTMLElement | null;
  revealLineInCenter(line: number): void;
  changeViewZones(callback: (accessor: ViewZoneAccessor) => void): void;
  layout(): void;
}

export interface MonacoDiffEditor {
  getModifiedEditor(): MonacoEditor;
}

interface FiberLike {
  stateNode?: unknown;
  return?: FiberLike;
}

function isDiffEditor(value: unknown): value is MonacoDiffEditor {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MonacoDiffEditor).getModifiedEditor === "function"
  );
}

/** The live diff-editor instance for the current single-file view, if any. */
export function findDiffEditor(): MonacoDiffEditor | null {
  const host = safeQuery<HTMLElement>(".monaco-diff-editor")?.parentElement;
  if (!host) return null;
  const fiberKey = Object.keys(host).find(
    (k) => k.startsWith("__reactInternalInstance$") || k.startsWith("__reactFiber$")
  );
  if (!fiberKey) return null;
  let fiber = (host as unknown as Record<string, FiberLike | undefined>)[fiberKey];
  for (let hops = 0; fiber && hops < 6; hops++, fiber = fiber.return) {
    const state = fiber.stateNode;
    if (typeof state !== "object" || state === null) continue;
    for (const key of Object.keys(state)) {
      try {
        const value = (state as Record<string, unknown>)[key];
        if (isDiffEditor(value)) return value;
      } catch {
        // property getters on foreign objects may throw
      }
    }
  }
  return null;
}
