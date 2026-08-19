import { afterEach, describe, expect, it, vi } from "vitest";
import type { Route } from "./router";
import { comboFromEvent, createHotkeys, isEditableTarget, type Hotkeys } from "./keys";

const route = (area: Route["area"] = "unknown"): Route => ({
  org: "o",
  project: "p",
  repo: null,
  area,
  id: null,
  path: "/o/p",
});

const key = (init: KeyboardEventInit) =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("comboFromEvent", () => {
  it("normalizes plain printable keys", () => {
    expect(comboFromEvent(key({ key: "J" }))).toBe("j");
  });

  it("ignores shift for printable keys (the char encodes it)", () => {
    expect(comboFromEvent(key({ key: "{", shiftKey: true }))).toBe("{");
  });

  it("includes shift for non-printable keys", () => {
    expect(comboFromEvent(key({ key: "Enter", shiftKey: true }))).toBe("shift+enter");
  });

  it("orders modifiers deterministically", () => {
    expect(comboFromEvent(key({ key: "s", ctrlKey: true, altKey: true }))).toBe("ctrl+alt+s");
  });
});

describe("isEditableTarget", () => {
  it("flags inputs, textareas and selects", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }
  });

  it("flags contenteditable containers", () => {
    const outer = document.createElement("div");
    outer.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    expect(isEditableTarget(inner)).toBe(true);
    outer.remove();
  });

  it("flags aria textbox roles", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "textbox");
    expect(isEditableTarget(div)).toBe(true);
  });

  it("passes plain elements", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
  });
});

describe("hotkey dispatch", () => {
  // Each test constructs a fresh instance — no shared state to route around.
  let hk: Hotkeys | null = null;

  function freshHotkeys(area: Route["area"] = "unknown"): Hotkeys {
    hk = createHotkeys(() => route(area));
    hk.install();
    return hk;
  }

  afterEach(() => {
    hk?.uninstall();
    hk = null;
    document.body.innerHTML = "";
  });

  const reg = (handler: () => void, areas: Route["area"][] | "*" = "*") => ({
    action: "test.fire",
    defaultKey: "x",
    areas,
    description: "",
    handler,
  });

  it("fires the handler bound to the default key", () => {
    const handler = vi.fn();
    freshHotkeys().register(reg(handler));
    document.body.dispatchEvent(key({ key: "x" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects the registration's areas against the current route", () => {
    const handler = vi.fn();
    freshHotkeys("boards").register(reg(handler, ["repos-pr"]));
    document.body.dispatchEvent(key({ key: "x" }));
    expect(handler).not.toHaveBeenCalled();

    hk?.uninstall();
    freshHotkeys("repos-pr").register(reg(handler, ["repos-pr"]));
    document.body.dispatchEvent(key({ key: "x" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire while typing in an input", () => {
    const handler = vi.fn();
    freshHotkeys().register(reg(handler));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(key({ key: "x" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire inside an adofix modal", () => {
    const handler = vi.fn();
    freshHotkeys().register(reg(handler));
    const modal = document.createElement("div");
    modal.setAttribute("data-adofix-modal", "");
    const child = document.createElement("div");
    modal.appendChild(child);
    document.body.appendChild(modal);
    child.dispatchEvent(key({ key: "x" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
