/** "40 changed files" → 40 (the Files toolbar's total; verified 2026-08-19). */
export function parseChangedFiles(text: string | null | undefined): number | null {
  const match = /^\s*(\d+)\s+changed files?\s*$/.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * First unreviewed file after `anchor` in tree order, wrapping. The anchor
 * itself is reachable last — "next" lands back on the current file when it
 * is the only one left to review.
 */
export function nextUnreviewedPath(
  order: readonly string[],
  viewed: ReadonlySet<string>,
  anchor: string | null
): string | null {
  if (order.length === 0) return null;
  const start = anchor ? order.indexOf(anchor) + 1 : 0; // unknown anchor → 0
  for (let i = 0; i < order.length; i++) {
    const path = order[(start + i) % order.length]!;
    if (!viewed.has(path)) return path;
  }
  return null;
}

export function reviewButtonLabel(n: number | null, m: number | null, started: boolean): string {
  if (!started) return "Review";
  if (n === null || m === null) return "Reviewing…";
  return m > 0 && n >= m ? "Reviewed ✓" : `Reviewing · ${n}/${m}`;
}

export function counterLabel(n: number | null, m: number | null): string {
  if (n !== null && m !== null && m > 0 && n >= m) return "All files reviewed ✓";
  return `${n ?? "…"}/${m ?? "…"} files reviewed`;
}
