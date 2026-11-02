import { describe, expect, it } from "vitest";
import { SEMANTIC } from "./bridge";
import { buildPrimerCss } from "./build-css";
import { assertKnown, collectRefs, parseTheme, pruneTheme, stripComments } from "./prune";

const DARK = `/** header */
[data-color-mode="dark"][data-dark-theme="dark"],
[data-color-mode="auto"][data-light-theme="dark"] {
  --fgColor-default: #f0f6fc; /** text */
  --fgColor-muted: #9198a1;
  --focus-outline-color: var(--borderColor-accent-emphasis);
  --focus-outlineColor: var(--focus-outline-color);
  --borderColor-accent-emphasis: #1f6feb;
}
@media (prefers-color-scheme: dark) {
  [data-color-mode][data-color-mode="auto"][data-dark-theme="dark"] { --fgColor-default: #f0f6fc; }
}`;
const LIGHT = DARK.replace(/dark/g, "light").replace("#f0f6fc", "#1f2328");

describe("prune", () => {
  it("strips comments", () => {
    expect(stripComments("a /* x */ b /** y\n z */ c")).toBe("a  b  c");
  });

  it("collects var() references, fallbacks included", () => {
    expect(collectRefs(["color: var(--a, var(--b)); x: var( --c)"])).toEqual(new Set(["--a", "--b", "--c"]));
  });

  it("parses the first theme block only, keeping its selectors", () => {
    const theme = parseTheme(DARK);
    expect(theme.selector).toContain('[data-color-mode="dark"][data-dark-theme="dark"]');
    expect(theme.decls.get("--fgColor-default")).toBe("#f0f6fc");
    expect(theme.decls.size).toBe(5);
  });

  it("keeps referenced tokens with their transitive dependencies, drops the rest", () => {
    const pruned = pruneTheme(parseTheme(DARK), ["--fgColor-default", "--focus-outlineColor"]);
    expect([...pruned.decls.keys()]).toEqual([
      "--fgColor-default",
      "--focus-outline-color",
      "--focus-outlineColor",
      "--borderColor-accent-emphasis",
    ]);
  });

  it("throws on a Primer-looking name Primer doesn't define", () => {
    const known = new Set(["--fgColor-muted"]);
    expect(() => assertKnown(["--fgColor-mute"], known, new Set())).toThrow(/--fgColor-mute/);
    // ADO's own variables share heads with Primer's; exempt ones pass.
    expect(() => assertKnown(["--text-primary-color"], known, new Set(["--text-primary-color"]))).not.toThrow();
    // Not Primer-looking at all: ignored.
    expect(() => assertKnown(["--adofix-ink"], known, new Set())).not.toThrow();
  });
});

describe("buildPrimerCss", () => {
  // The bridge resolves real tokens, so these fixtures carry the ones it needs.
  const extra = `
  --bgColor-default: #0d1117;
  --bgColor-accent-emphasis: #1f6feb;
  --bgColor-danger-emphasis: #da3633;
  --bgColor-severe-emphasis: #bd561d;
  --fgColor-severe: #db6d28;
  --shadow-floating-small: 0 0 0 1px #3d444d, 0 6px 12px -3px #01040966, 0 6px 18px 0 #01040966;
  --shadow-floating-large: 0 0 0 1px #3d444d, 0 24px 48px 0 #010409;
  --unused-token: #123456;
${[...new Set(Object.values(SEMANTIC))]
  .map((v) => v.slice(4, -1))
  .filter((n) => !["--fgColor-muted", "--focus-outlineColor"].includes(n))
  .map((n) => `  ${n}: #000000;`)
  .join("\n")}
`;
  const withExtra = (css: string): string => css.replace("--fgColor-muted: #9198a1;", `--fgColor-muted: #9198a1;${extra}`);

  it("ships referenced tokens in both themes and drops unreferenced ones", () => {
    const { tokens } = buildPrimerCss({
      dark: withExtra(DARK),
      light: withExtra(LIGHT),
      whole: [":root { --borderRadius-medium: 0.375rem; } /* c */"],
      sources: [".a { color: var(--fgColor-muted); border-radius: var(--borderRadius-medium); }"],
    });
    expect(tokens.match(/--fgColor-muted:/g)).toHaveLength(2);
    expect(tokens).not.toContain("--unused-token");
    expect(tokens).toContain("--borderRadius-medium: 6px;");
    expect(tokens).not.toContain("/*");
    expect(tokens).not.toContain("@media (prefers-color-scheme");
  });

  it("fails on a misspelled token", () => {
    expect(() =>
      buildPrimerCss({
        dark: withExtra(DARK),
        light: withExtra(LIGHT),
        whole: [],
        sources: [".a { color: var(--fgColor-mute); }"],
      })
    ).toThrow(/Primer token\(s\) referenced in src\/: --fgColor-mute\. /);
  });
});

describe("remToPx", () => {
  it("pins Primer's rem sizes to GitHub's 16px root", async () => {
    const { remToPx } = await import("./build-css");
    expect(remToPx("--borderWidth-thin: 0.0625rem; --x: 1.5rem; --y: -.5rem;")).toBe(
      "--borderWidth-thin: 1px; --x: 24px; --y: -8px;",
    );
    expect(remToPx("--lineHeight: 1.5; --a: 2em;")).toBe("--lineHeight: 1.5; --a: 2em;");
  });
});
