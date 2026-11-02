import { describe, expect, it } from "vitest";
import { mix, paletteFor, parseHex, resolveColor, toTriple } from "./bridge";
import type { ThemeBlock } from "./prune";

const theme = (decls: Record<string, string>): ThemeBlock => ({ selector: "[t]", decls: new Map(Object.entries(decls)) });

const DARK = theme({
  "--bgColor-default": "#0d1117",
  "--fgColor-default": "#f0f6fc",
  "--bgColor-accent-emphasis": "#1f6feb",
  "--bgColor-danger-emphasis": "#da3633",
  "--bgColor-severe-emphasis": "#bd561d",
  "--fgColor-severe": "var(--severe-alias)",
  "--severe-alias": "#db6d28",
  "--shadow-floating-small": "0 0 0 1px #3d444d, 0 6px 12px -3px #01040966, 0 6px 18px 0 #01040966",
  "--shadow-floating-large": "0 0 0 1px #3d444d, 0 24px 48px 0 #010409",
});

describe("palette triples", () => {
  it("turns a Primer hex into ADO's 'r, g, b' form", () => {
    expect(toTriple(parseHex("#0d1117"))).toBe("13, 17, 23");
    expect(toTriple(parseHex("#fff"))).toBe("255, 255, 255");
  });

  it("follows var() aliases and composites translucent colors over the canvas", () => {
    expect(toTriple(resolveColor(DARK, "--fgColor-severe"))).toBe("219, 109, 40");
    const t = theme({ "--x": "#ffffff80" });
    expect(toTriple(resolveColor(t, "--x", parseHex("#000000")))).toBe("128, 128, 128");
  });

  it("mixes neutrals from the canvas (0) to the text color (100)", () => {
    const p = paletteFor(DARK);
    expect(p["--palette-neutral-0"]).toBe("13, 17, 23");
    expect(p["--palette-neutral-100"]).toBe("240, 246, 252");
    expect(p["--palette-neutral-8"]).toBe(toTriple(mix(parseHex("#0d1117"), parseHex("#f0f6fc"), 8)));
    expect(p["--palette-primary-tint-30"]).toBe(toTriple(mix(parseHex("#1f6feb"), parseHex("#0d1117"), 87)));
  });

  it("emits full colors for the rgba-form variables", () => {
    const p = paletteFor(DARK);
    expect(p["--palette-error"]).toBe("rgba(218, 54, 51, 1)");
    expect(p["--palette-black-alpha-20"]).toBe("rgba(240, 246, 252, 0.2)");
    expect(p["--callout-shadow-color"]).toBe("#01040966");
  });
});
