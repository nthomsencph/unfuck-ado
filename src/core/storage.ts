import { warn } from "./log";

declare const GM_getValue: ((key: string, def?: string) => string | undefined) | undefined;
declare const GM_setValue: ((key: string, value: string) => void) | undefined;

export const SCHEMA_VERSION = 1;
const NS = "adofix";

interface Envelope<T> {
  v: number;
  data: T;
}

interface Backend {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

function pickBackend(): Backend {
  if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
    return { get: (k) => GM_getValue(k), set: (k, v) => GM_setValue(k, v) };
  }
  // Dev / test fallback.
  try {
    localStorage.setItem(`${NS}.__probe`, "1");
    localStorage.removeItem(`${NS}.__probe`);
    return {
      get: (k) => localStorage.getItem(k) ?? undefined,
      set: (k, v) => localStorage.setItem(k, v),
    };
  } catch {
    const mem = new Map<string, string>();
    return { get: (k) => mem.get(k), set: (k, v) => mem.set(k, v) };
  }
}

const backend = pickBackend();

export function storageKey(feature: string, key: string): string {
  return `${NS}.${feature}.${key}`;
}

export function getValue<T>(feature: string, key: string, fallback: T): T {
  const raw = backend.get(storageKey(feature, key));
  if (raw === undefined) return fallback;
  try {
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope.v !== SCHEMA_VERSION) return fallback;
    return envelope.data;
  } catch {
    return fallback;
  }
}

export function setValue<T>(feature: string, key: string, value: T): void {
  try {
    const envelope: Envelope<T> = { v: SCHEMA_VERSION, data: value };
    backend.set(storageKey(feature, key), JSON.stringify(envelope));
  } catch (err) {
    warn("storage write failed", err);
  }
}
