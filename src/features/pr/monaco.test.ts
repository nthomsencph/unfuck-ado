import { afterEach, describe, expect, it } from "vitest";
import { findDiffEditor, type MonacoDiffEditor } from "./monaco";

const FIBER_KEY = "__reactInternalInstance$test";

function mountDiffEditor(fiber: unknown): void {
  const host = document.createElement("div");
  const editorRoot = document.createElement("div");
  editorRoot.className = "monaco-diff-editor";
  host.appendChild(editorRoot);
  document.body.appendChild(host);
  if (fiber !== undefined) (host as unknown as Record<string, unknown>)[FIBER_KEY] = fiber;
}

function fakeEditor(): MonacoDiffEditor {
  return { getModifiedEditor: () => ({}) as never };
}

describe("findDiffEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the instance on the host fiber's stateNode", () => {
    const editor = fakeEditor();
    mountDiffEditor({ stateNode: { editor } });
    expect(findDiffEditor()).toBe(editor);
  });

  it("walks the return chain to the owning component", () => {
    const editor = fakeEditor();
    // Live shape 2026-08-19: host fiber is the DOM fiber; the class
    // component holding the editor is one `return` hop up.
    mountDiffEditor({ stateNode: null, return: { stateNode: { editor } } });
    expect(findDiffEditor()).toBe(editor);
  });

  it("survives throwing property getters", () => {
    const editor = fakeEditor();
    const state: Record<string, unknown> = { editor };
    Object.defineProperty(state, "trap", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    mountDiffEditor({ stateNode: state });
    expect(findDiffEditor()).toBe(editor);
  });

  it("returns null when no fiber key exists", () => {
    mountDiffEditor(undefined);
    expect(findDiffEditor()).toBeNull();
  });

  it("returns null when nothing in reach quacks like a diff editor", () => {
    mountDiffEditor({ stateNode: { other: {} }, return: { stateNode: {} } });
    expect(findDiffEditor()).toBeNull();
  });

  it("returns null without a Monaco root", () => {
    expect(findDiffEditor()).toBeNull();
  });
});
