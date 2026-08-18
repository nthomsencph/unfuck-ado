import { afterEach, describe, expect, it } from "vitest";
import {
  classifyStatusText,
  getThreadElements,
  getThreadId,
  getThreadStatus,
  isThreadExpanded,
  isThreadResolved,
} from "./threads";

describe("classifyStatusText", () => {
  it.each([
    ["Resolved", "resolved"],
    ["Closed", "resolved"],
    ["Won't fix", "resolved"],
    ["Wont fix", "resolved"],
    // Real aria-label format observed live 2026-08-01
    ["State button Resolved mode", "resolved"],
    ["State button Closed mode", "resolved"],
    ["State button Active mode", "active"],
    ["Active", "active"],
    ["Pending", "active"],
  ] as const)("%s -> %s", (text, expected) => {
    expect(classifyStatusText(text)).toBe(expected);
  });

  it("does not mistake 'unresolved' for resolved", () => {
    expect(classifyStatusText("3 unresolved comments")).toBe("unknown");
  });

  it("does not mistake the 'Resolve' action button for the status", () => {
    expect(classifyStatusText("Resolve")).toBe("unknown");
  });

  it("treats empty and null as unknown", () => {
    expect(classifyStatusText("")).toBe("unknown");
    expect(classifyStatusText(null)).toBe("unknown");
    expect(classifyStatusText(undefined)).toBe("unknown");
  });
});

// --- DOM fixtures mirroring the live markup (verified 2026-08-01) ------------

/** Files view: a collapsed comment site. */
function makeCollapsedSite(): HTMLElement {
  const host = document.createElement("div");
  host.className = "repos-editor-discussion-host";
  const btn = document.createElement("button");
  btn.className = "repos-editor-discussion-expand bolt-button";
  btn.setAttribute("aria-label", "2 comments (Someone) Click to expand");
  host.appendChild(btn);
  document.body.appendChild(host);
  return host;
}

/** An expanded thread, optionally wrapped in a Files-view site host. */
function makeExpandedThread(opts: {
  stateAria?: string;
  footer?: "Resolve" | "Reactivate";
  threadId?: number;
  inHost?: boolean;
}): HTMLElement {
  const thread = document.createElement("div");
  thread.className = "repos-discussion-thread flex-column";
  if (opts.stateAria) {
    const state = document.createElement("button");
    state.setAttribute("aria-label", opts.stateAria);
    state.textContent = opts.stateAria.replace(/^State button (\w+) mode$/, "$1");
    thread.appendChild(state);
  }
  if (opts.footer) {
    const footer = document.createElement("button");
    footer.textContent = opts.footer;
    thread.appendChild(footer);
  }
  if (opts.threadId !== undefined) {
    const input = document.createElement("input");
    input.className = `threadId-${opts.threadId} bolt-textfield-input`;
    thread.appendChild(input);
  }
  let root: HTMLElement = thread;
  if (opts.inHost) {
    root = document.createElement("div");
    root.className = "repos-editor-discussion-host";
    root.appendChild(thread);
  }
  document.body.appendChild(root);
  return root;
}

describe("thread element lookup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds collapsed sites, hosted threads and standalone threads, deduped", () => {
    const collapsed = makeCollapsedSite();
    const hosted = makeExpandedThread({ stateAria: "State button Active mode", inHost: true });
    const standalone = makeExpandedThread({ stateAria: "State button Active mode" });

    const found = getThreadElements();
    expect(found).toHaveLength(3);
    expect(found).toContain(collapsed);
    expect(found).toContain(hosted); // the host, not the inner thread
    expect(found).toContain(standalone);
  });

  it("reports expansion state", () => {
    expect(isThreadExpanded(makeCollapsedSite())).toBe(false);
    expect(isThreadExpanded(makeExpandedThread({ inHost: true }))).toBe(true);
    expect(isThreadExpanded(makeExpandedThread({}))).toBe(true);
  });

  it("classifies status from the state button aria-label", () => {
    expect(getThreadStatus(makeExpandedThread({ stateAria: "State button Resolved mode" }))).toBe(
      "resolved"
    );
    expect(getThreadStatus(makeExpandedThread({ stateAria: "State button Closed mode" }))).toBe(
      "resolved"
    );
    expect(getThreadStatus(makeExpandedThread({ stateAria: "State button Active mode" }))).toBe(
      "active"
    );
  });

  it("falls back to the footer action button", () => {
    expect(getThreadStatus(makeExpandedThread({ footer: "Reactivate" }))).toBe("resolved");
    expect(getThreadStatus(makeExpandedThread({ footer: "Resolve" }))).toBe("active");
  });

  it("reports unknown for collapsed sites", () => {
    expect(getThreadStatus(makeCollapsedSite())).toBe("unknown");
  });

  it("isThreadResolved only for confirmed resolved", () => {
    expect(isThreadResolved(makeExpandedThread({ stateAria: "State button Resolved mode" }))).toBe(
      true
    );
    expect(isThreadResolved(makeExpandedThread({ stateAria: "State button Active mode" }))).toBe(
      false
    );
    expect(isThreadResolved(makeCollapsedSite())).toBe(false);
  });

  it("extracts the REST thread id from the reply input class", () => {
    expect(getThreadId(makeExpandedThread({ threadId: 50661, inHost: true }))).toBe(50661);
    expect(getThreadId(makeCollapsedSite())).toBeNull();
  });
});
