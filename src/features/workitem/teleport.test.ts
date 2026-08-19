import { afterEach, describe, expect, it } from "vitest";
import { isInsideEdit } from "./teleport";

/**
 * isInsideEdit encodes the feature's hardest-won bug: the work item dialog's
 * root carries a "callout" class and is an ANCESTOR of everything, so it must
 * not count as the edit's own overlay.
 */
describe("isInsideEdit", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true for targets inside the control itself", () => {
    const native = document.createElement("div");
    const inner = document.createElement("input");
    native.appendChild(inner);
    document.body.appendChild(native);
    expect(isInsideEdit(inner, native)).toBe(true);
  });

  it("is true for a sibling callout/portal that does not contain the control", () => {
    const native = document.createElement("div");
    const portal = document.createElement("div");
    portal.className = "bolt-dropdown-items";
    const option = document.createElement("div");
    portal.appendChild(option);
    document.body.append(native, portal);
    expect(isInsideEdit(option, native)).toBe(true);
  });

  it("is FALSE inside the dialog root ('callout' class) that contains the control", () => {
    const dialog = document.createElement("div");
    dialog.className = "bolt-dialog-callout-content";
    const native = document.createElement("div");
    const elsewhere = document.createElement("button");
    dialog.append(native, elsewhere);
    document.body.appendChild(dialog);
    // elsewhere is inside a "callout" — but that callout contains the control,
    // so it is the dialog, not the edit's own overlay.
    expect(isInsideEdit(elsewhere, native)).toBe(false);
  });

  it("is false for plain page targets and non-elements", () => {
    const native = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(native, outside);
    expect(isInsideEdit(outside, native)).toBe(false);
    expect(isInsideEdit(null, native)).toBe(false);
    expect(isInsideEdit(document, native)).toBe(false);
  });
});
