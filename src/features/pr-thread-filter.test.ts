import { afterEach, describe, expect, it } from "vitest";
import { shouldHide } from "./pr-thread-filter";

/** Files view: a collapsed comment site (no status in the DOM). */
function collapsedSite(): HTMLElement {
  const host = document.createElement("div");
  host.className = "repos-editor-discussion-host";
  const btn = document.createElement("button");
  btn.className = "repos-editor-discussion-expand bolt-button";
  host.appendChild(btn);
  document.body.appendChild(host);
  return host;
}

/** An expanded thread inside a site host, with the given state-button aria. */
function expandedSite(stateAria: string): HTMLElement {
  const host = document.createElement("div");
  host.className = "repos-editor-discussion-host";
  const thread = document.createElement("div");
  thread.className = "repos-discussion-thread";
  const state = document.createElement("button");
  state.setAttribute("aria-label", stateAria);
  thread.appendChild(state);
  host.appendChild(thread);
  document.body.appendChild(host);
  return host;
}

describe("shouldHide", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides confirmed resolved threads", () => {
    expect(shouldHide(expandedSite("State button Resolved mode"))).toBe(true);
  });

  it("hides confirmed closed threads", () => {
    expect(shouldHide(expandedSite("State button Closed mode"))).toBe(true);
  });

  it("keeps active threads", () => {
    expect(shouldHide(expandedSite("State button Active mode"))).toBe(false);
  });

  it("hides collapsed sites (ADO auto-collapses settled threads)", () => {
    expect(shouldHide(collapsedSite())).toBe(true);
  });

  it("keeps sites the user explicitly revealed", () => {
    const el = expandedSite("State button Resolved mode");
    el.setAttribute("data-adofix-revealed", "");
    expect(shouldHide(el)).toBe(false);
  });
});
