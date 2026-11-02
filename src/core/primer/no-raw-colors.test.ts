import { describe, expect, it } from "vitest";

// vitest (Vite) rewrites import.meta.glob at transform time; vite's own types
// aren't resolvable under pnpm's strict layout, so declare the one overload used.
declare global {
  interface ImportMeta {
    glob(patterns: string[], opts: { query: "?raw"; import: "default"; eager: true }): Record<string, unknown>;
  }
}

/*
 * Guard: colors live in the Primer foundation only. Every feature, style
 * sheet and core module outside core/primer must use Primer tokens
 * (var(--fgColor-…) etc.), so the GitHub look — and dark/light — stays in one
 * place. Tests are exempt (fixtures may carry ADO's literal colors).
 */
const SOURCES = import.meta.glob(
  ["../../features/**/*.{ts,css}", "../../styles/**/*.css", "../*.ts", "!../../**/*.test.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

// #rgb/#rgba/#rrggbb/#rrggbbaa as a CSS value (after ':' / ',' / '(' / space), rgb()/rgba()/hsl()/hsla().
const RAW_COLOR = /(?:[:\s,(]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b)|\b(?:rgba?|hsla?)\(/;

describe("no raw colors outside core/primer", () => {
  it("scans the feature, style and core sources", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(30);
  });

  it("every feature/style/core file uses Primer tokens only", () => {
    const offenders = Object.entries(SOURCES).flatMap(([path, text]) =>
      text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_COLOR.test(line))
        .map(({ line, n }) => `${path}:${n}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
