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
