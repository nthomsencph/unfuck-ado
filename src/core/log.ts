const PREFIX = "[adofix]";

let enabled = false;
try {
  enabled = localStorage.getItem("adofix.debug") === "1";
} catch {
  // storage unavailable — stay silent
}

export function setLogEnabled(value: boolean): void {
  enabled = value;
}

export function log(ns: string, ...args: unknown[]): void {
  if (enabled) console.log(`${PREFIX}[${ns}]`, ...args);
}

/** Errors always surface, debug flag or not. */
export function warn(...args: unknown[]): void {
  console.warn(PREFIX, ...args);
}

/**
 * Always prints — reserved for the one boot line that proves which build is
 * running. Everything chattier goes through log() behind the debug flag.
 */
export function info(...args: unknown[]): void {
  console.info(PREFIX, ...args);
}
