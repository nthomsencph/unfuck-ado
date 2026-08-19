import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import { getWorkItem, getWorkItemTypeStates, setWorkItemState } from "../core/api";
import { ADOFIX_ATTR, injectStyleOnce, showToast } from "../core/dom";
import { log } from "../core/log";

const FEATURE_ID = "workitem-state";
const PICKER_ID = `${FEATURE_ID}-picker`;

const PICKER_CSS = `
.adofix-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
}
/* Surface material comes from .adofix-surface (core BASE_CSS) — this block
   was the one light-hardcoded surface in the repo and rendered as a white
   box on ADO dark. */
.adofix-picker {
  min-width: 280px;
  overflow: hidden;
}
.adofix-picker-title {
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--border-subtle-color, rgba(128, 128, 128, 0.25));
}
.adofix-picker button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.adofix-picker button:hover { background: rgba(128, 128, 128, 0.12); }
.adofix-picker button.adofix-selected { background: rgba(130, 80, 223, 0.22); }
`;

function renderPicker(
  states: string[],
  current: string,
  onPick: (state: string) => Promise<void>
): void {
  if (document.querySelector(`[${ADOFIX_ATTR}="${PICKER_ID}"]`)) return;
  injectStyleOnce(PICKER_ID, PICKER_CSS);

  const overlay = document.createElement("div");
  overlay.setAttribute(ADOFIX_ATTR, PICKER_ID);
  // Suspends global hotkeys while open — see keys.ts.
  overlay.setAttribute("data-adofix-modal", "");
  overlay.className = "adofix-picker-overlay";
  overlay.tabIndex = -1;

  const box = document.createElement("div");
  box.className = "adofix-picker adofix-surface";
  const title = document.createElement("div");
  title.className = "adofix-picker-title";
  title.textContent = "Set state";
  box.appendChild(title);

  let selected = Math.max(0, states.indexOf(current));
  const buttons: HTMLButtonElement[] = [];

  const close = (): void => overlay.remove();
  const pick = (state: string): void => {
    close();
    void onPick(state);
  };

  for (const state of states) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = state === current ? `${state} (current)` : state;
    btn.addEventListener("click", () => pick(state));
    buttons.push(btn);
    box.appendChild(btn);
  }

  const highlight = (): void =>
    buttons.forEach((b, i) => b.classList.toggle("adofix-selected", i === selected));
  highlight();

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = (selected + 1) % states.length;
      highlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = (selected - 1 + states.length) % states.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const state = states[selected];
      if (state) pick(state);
    }
    e.stopPropagation();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.focus();
}

async function openPicker(route: Route): Promise<void> {
  if (!route.org || !route.project || !route.id) {
    showToast("adofix: no work item in the current view");
    return;
  }
  const ref = { org: route.org, project: route.project };
  const id = route.id;

  const wi = await getWorkItem(ref, id);
  if (!wi.ok) {
    showToast(`adofix: failed to load #${id} (${wi.error.message})`);
    return;
  }
  const type = String(wi.value.fields["System.WorkItemType"] ?? "");
  const currentState = String(wi.value.fields["System.State"] ?? "");

  const states = await getWorkItemTypeStates(ref, type);
  if (!states.ok) {
    showToast(`adofix: failed to load states (${states.error.message})`);
    return;
  }
  const names = states.value.value.map((s) => s.name);
  if (names.length === 0) {
    showToast(`adofix: no states found for type "${type}"`);
    return;
  }

  renderPicker(names, currentState, async (state) => {
    const res = await setWorkItemState(ref, id, state);
    if (!res.ok) {
      showToast(`adofix: state change failed (${res.error.message})`);
      return;
    }
    showToast(`#${id} → ${state}`);
    log(FEATURE_ID, `work item ${id} set to ${state}`);
    // TODO: smarter in-place refresh; a reload is crude but always correct.
    setTimeout(() => location.reload(), 400);
  });
}

export const workitemState: Feature = {
  id: FEATURE_ID,
  areas: ["workitems", "boards"],
  init(ctx): void {
    ctx.hotkey("pick", "s", "Change work item state", () => {
      void openPicker(ctx.route());
    });
  },
  apply(): void {
    // No per-settle work; the feature is hotkey-driven.
  },
};
