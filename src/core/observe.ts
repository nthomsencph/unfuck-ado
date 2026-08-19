export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
}

const resizeObserved = new WeakMap<Element, Set<string>>();

/**
 * One debounced ResizeObserver per (caller, container) — the settle observer
 * is childList-only, so splitter drags and window resizes never reach it.
 * Keyed by caller id because two features can legitimately refit the same
 * container (backlog-grid and taskboard-columns share .bolt-table-container).
 */
export function observeResize(id: string, container: Element, refit: () => void, ms = 100): void {
  let ids = resizeObserved.get(container);
  if (!ids) {
    ids = new Set();
    resizeObserved.set(container, ids);
  }
  if (ids.has(id)) return;
  ids.add(id);
  new ResizeObserver(debounce(refit, ms)).observe(container);
}

/**
 * One observer on body, debounced. Our own injections re-trigger it; that is
 * fine because every feature apply() is idempotent and early-returns.
 */
export function startObserver(onSettle: () => void, ms = 100): () => void {
  const scheduled = debounce(onSettle, ms);
  const target = document.body ?? document.documentElement;
  const observer = new MutationObserver(scheduled);
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}
