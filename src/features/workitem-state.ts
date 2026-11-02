import type { Feature } from "../core/registry";
import type { Route } from "../core/router";
import {
  getWorkItem,
  getWorkItemTypeStates,
  setWorkItemState,
  type WorkItemTypeState,
} from "../core/api";
import { ADOFIX_ATTR, injectStyleOnce, showToast } from "../core/dom";
import { octicon } from "../core/primer";
import { log } from "../core/log";

const FEATURE_ID = "workitem-state";
const PICKER_ID = `${FEATURE_ID}-picker`;

const PICKER_CSS = `
.adofix-picker-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-bgColor);
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
}
/* Material and items come from the gh-menu component (GitHub's
   SelectMenu); only the header and the state dots are ours. */
.adofix-picker {
  min-width: 280px;
  overflow: hidden;
}
.adofix-picker-title {
  padding: 8px 16px;
  margin-bottom: 8px;
  font-weight: var(--base-text-weight-semibold);
  font-size: var(--text-body-size-medium);
}
/* Fixed-width slot for the selected check so names stay aligned. */
.adofix-picker-check {
  display: inline-flex;
  width: 16px;
  flex-shrink: 0;
}
.gh-menu-item .adofix-picker-check .octicon {
  color: var(--fgColor-default);
}
/* State dots in GitHub Projects' default status colours (D60). */
.gh-menu-item .adofix-state-dot { color: var(--fgColor-muted); }
.gh-menu-item .adofix-state-dot[data-category="Proposed"] { color: var(--fgColor-success); }
.gh-menu-item .adofix-state-dot[data-category="InProgress"] { color: var(--fgColor-attention); }
.gh-menu-item .adofix-state-dot[data-category="Resolved"] { color: var(--fgColor-accent); }
.gh-menu-item .adofix-state-dot[data-category="Completed"] { color: var(--fgColor-done); }
`;

function renderPicker(
  entries: WorkItemTypeState[],
  current: string,
  onPick: (state: string) => Promise<void>
): void {
  if (document.querySelector(`[${ADOFIX_ATTR}="${PICKER_ID}"]`)) return;
  injectStyleOnce(PICKER_ID, PICKER_CSS);
  const states = entries.map((s) => s.name);

  const overlay = document.createElement("div");
  overlay.setAttribute(ADOFIX_ATTR, PICKER_ID);
  // Suspends global hotkeys while open — see keys.ts.
  overlay.setAttribute("data-adofix-modal", "");
  overlay.className = "adofix-picker-overlay";
  overlay.tabIndex = -1;

  const box = document.createElement("div");
  box.className = "adofix-picker gh-menu";
  box.setAttribute("role", "menu");
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

  for (const { name: state, stateCategory } of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gh-menu-item";
    btn.setAttribute("role", "menuitemradio");
    btn.setAttribute("aria-checked", String(state === current));
    // GitHub marks the current choice with a leading check, not a suffix.
    const check = document.createElement("span");
    check.className = "adofix-picker-check";
    if (state === current) check.append(octicon("check"));
    const dot = octicon("dot-fill");
    dot.classList.add("adofix-state-dot");
    if (stateCategory) dot.dataset["category"] = stateCategory;
    const label = document.createElement("span");
    label.textContent = state;
    btn.append(check, dot, label);
    btn.addEventListener("click", () => pick(state));
    buttons.push(btn);
    box.appendChild(btn);
  }

  const highlight = (): void =>
    buttons.forEach((b, i) => {
      b.classList.toggle("adofix-selected", i === selected);
      b.classList.toggle("gh-menu-item--active", i === selected);
    });
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
  const entries = states.value.value;
  if (entries.length === 0) {
    showToast(`adofix: no states found for type "${type}"`);
    return;
  }

  renderPicker(entries, currentState, async (state) => {
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
