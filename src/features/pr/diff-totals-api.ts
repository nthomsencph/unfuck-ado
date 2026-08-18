import { apiFetch, orgBase, type ApiResult } from "../../core/api";
import type { PrRef } from "./threads-api";

/**
 * Whole-PR added/removed line totals, computed the way ADO's own per-file
 * headers do — but across every changed file, which the UI never sums.
 *
 * Data path (all verified live 2026-08-02 against PR 6982, 425 files):
 * 1. GET  pullRequests/{id}/iterations → last iteration's commonRefCommit
 *    (diff base) and sourceRefCommit (diff target).
 * 2. GET  iterations/{last}/changes?compareTo=0 → every change entry across
 *    all iterations; renames carry originalPath.
 * 3. POST repositories/{repo}/filediffs (route has NO /diffs/ segment; the
 *    repo NAME works) → per-file lineDiffBlocks. Omitting originalPath makes
 *    the original side resolve EMPTY — an edit comes back as one whole-file
 *    "add" block — so edits/deletes/renames must always send it.
 *
 * Verified sums match the UI's per-file counts exactly: edit blocks count on
 * both sides, add blocks on the modified side, delete blocks on the original.
 */

interface IterationCommit {
  commitId: string;
}

export interface Iteration {
  id: number;
  sourceRefCommit: IterationCommit;
  commonRefCommit: IterationCommit;
}

export interface ChangeEntry {
  /** "add" | "edit" | "delete" | combos like "edit, rename". */
  changeType?: string;
  /** Pre-rename path; only present on renames. */
  originalPath?: string;
  item?: { path?: string; isFolder?: boolean };
}

export interface LineDiffBlock {
  changeType: string;
  originalLinesCount: number;
  modifiedLinesCount: number;
}

export interface FileDiff {
  path?: string;
  /** Absent for binary files. */
  lineDiffBlocks?: LineDiffBlock[];
}

/**
 * At least one side is always set. Deletes send ONLY originalPath — that is
 * the shape verified live; their change entry has no item.path at all.
 */
export interface FileDiffParam {
  path?: string;
  originalPath?: string;
}

export interface FileLineTotals {
  path: string;
  adds: number;
  dels: number;
}

/** Per-file counts are kept so the display can scope to the tree's selected
 * folder (the toolbar count scopes natively; whole-PR totals next to it read
 * as if they were the folder's — user-reported v0.7.2). */
export interface DiffTotals {
  files: FileLineTotals[];
}

/** Sum the files under `scopePath` (a folder or single file; undefined/"" = everything). */
export function scopedTotals(
  files: FileLineTotals[],
  scopePath: string | null | undefined
): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const f of files) {
    if (scopePath && f.path !== scopePath && !f.path.startsWith(`${scopePath}/`)) continue;
    adds += f.adds;
    dels += f.dels;
  }
  return { adds, dels };
}

export function buildFileDiffParams(entries: ChangeEntry[]): FileDiffParam[] {
  const params: FileDiffParam[] = [];
  for (const entry of entries) {
    if (entry.item?.isFolder) continue;
    const modified = entry.item?.path;
    const original = entry.originalPath;
    const type = (entry.changeType ?? "").toLowerCase();
    if (type.includes("add")) {
      if (modified) params.push({ path: modified });
    } else if (!modified) {
      // Deletes carry no item.path — only originalPath identifies them.
      if (original) params.push({ originalPath: original });
    } else {
      params.push({ path: modified, originalPath: original ?? modified });
    }
  }
  return params;
}

export function sumLineDiffBlocks(files: FileDiff[]): { adds: number; dels: number } {
  let adds = 0;
  let dels = 0;
  for (const file of files) {
    for (const block of file.lineDiffBlocks ?? []) {
      if (block.changeType === "add" || block.changeType === "edit") {
        adds += block.modifiedLinesCount;
      }
      if (block.changeType === "delete" || block.changeType === "edit") {
        dels += block.originalLinesCount;
      }
    }
  }
  return { adds, dels };
}

/** 842 → "842", 18255 → "18.3k", 20050 → "20.1k", 20999 → "21k". */
export function formatLineCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
  return `${rounded}k`;
}

export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** filediffs is preview-only; plain 7.1 404s. Verified live 2026-08-02. */
const FILEDIFFS_API_VERSION = "7.1-preview.1";
const CHANGES_PAGE_SIZE = 1000;
/**
 * Server-enforced cap: >10 → 400 "Number of file diffs requested must be
 * between 1 and 10" (verified live 2026-08-02, shipped as 100 in v0.6.0 and
 * flooded the console with 400s).
 */
const FILEDIFFS_BATCH_SIZE = 10;
/** 425 files = 43 batches; a small pool keeps that a few seconds, not 30. */
const FILEDIFFS_CONCURRENCY = 4;

function repoApiBase(ref: PrRef): string {
  return (
    `${orgBase(ref.org)}/${encodeURIComponent(ref.project)}` +
    `/_apis/git/repositories/${encodeURIComponent(ref.repo)}`
  );
}

export async function fetchDiffTotals(ref: PrRef): Promise<ApiResult<DiffTotals>> {
  const base = repoApiBase(ref);
  const iterations = await apiFetch<{ value: Iteration[] }>(
    `${base}/pullRequests/${ref.prId}/iterations`
  );
  if (!iterations.ok) return iterations;
  const last = iterations.value.value[iterations.value.value.length - 1];
  if (!last) return { ok: false, error: { status: 0, message: "PR has no iterations" } };

  const entries: ChangeEntry[] = [];
  for (let skip = 0; ; skip += CHANGES_PAGE_SIZE) {
    const page = await apiFetch<{ changeEntries?: ChangeEntry[] }>(
      `${base}/pullRequests/${ref.prId}/iterations/${last.id}/changes` +
        `?compareTo=0&$top=${CHANGES_PAGE_SIZE}&$skip=${skip}`
    );
    if (!page.ok) return page;
    const batch = page.value.changeEntries ?? [];
    entries.push(...batch);
    if (batch.length < CHANGES_PAGE_SIZE) break;
  }

  const params = buildFileDiffParams(entries);
  const batches = chunked(params, FILEDIFFS_BATCH_SIZE);
  const postBatch = (batch: FileDiffParam[]): Promise<ApiResult<{ value: FileDiff[] }>> =>
    apiFetch<{ value: FileDiff[] }>(`${base}/filediffs?api-version=${FILEDIFFS_API_VERSION}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseVersionCommit: last.commonRefCommit.commitId,
        targetVersionCommit: last.sourceRefCommit.commitId,
        fileDiffParams: batch,
      }),
    });

  // Fixed-size worker pool; the whole fetch fails on the first bad batch
  // (partial totals would silently lie).
  const files: FileLineTotals[] = [];
  let next = 0;
  let firstError: ApiResult<DiffTotals> | null = null;
  const worker = async (): Promise<void> => {
    while (next < batches.length && !firstError) {
      const batch = batches[next++]!;
      const res = await postBatch(batch);
      if (!res.ok) {
        firstError = res;
        return;
      }
      // Responses come back in request order (verified live 2026-08-02);
      // delete-only results carry no path, so fall back to the request param.
      res.value.value.forEach((fileDiff, i) => {
        const param = batch[i];
        const path = fileDiff.path ?? param?.path ?? param?.originalPath;
        if (!path) return;
        const sums = sumLineDiffBlocks([fileDiff]);
        files.push({ path, adds: sums.adds, dels: sums.dels });
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FILEDIFFS_CONCURRENCY, batches.length) }, () => worker())
  );
  if (firstError) return firstError;
  return { ok: true, value: { files } };
}
