import { afterEach, describe, expect, it } from "vitest";
import { injectStyleOnce, setStyle } from "./dom";

describe("injectStyleOnce", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("injects a feature's style once", () => {
    injectStyleOnce("feat", ".a { color: red; }");
    injectStyleOnce("feat", ".a { color: red; }");
    expect(document.head.querySelectorAll('style[data-adofix="feat"]')).toHaveLength(1);
  });

  it("moves our sheet after ADO sheets that loaded later", () => {
    // ADO lazy-loads CSS chunks; !important ties resolve by source order.
    injectStyleOnce("feat", ".a { color: red; }");
    const adoSheet = document.createElement("style");
    adoSheet.textContent = ".a { color: blue !important; }";
    document.head.appendChild(adoSheet);

    injectStyleOnce("feat", ".a { color: red; }");
    expect(document.head.lastElementChild?.getAttribute("data-adofix")).toBe("feat");
  });

  it("does not reshuffle when already after every foreign sheet", () => {
    const adoSheet = document.createElement("style");
    document.head.appendChild(adoSheet);
    injectStyleOnce("a", ".a {}");
    injectStyleOnce("b", ".b {}");
    const order = [...document.head.children];

    injectStyleOnce("a", ".a {}");
    injectStyleOnce("b", ".b {}");
    expect([...document.head.children]).toEqual(order);
  });
});

describe("setStyle", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("rewrites the sheet when the css changes, keeping one element", () => {
    setStyle("dyn", ".a { width: 1px; }");
    setStyle("dyn", ".a { width: 2px; }");
    const sheets = document.head.querySelectorAll('style[data-adofix="dyn"]');
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.textContent).toBe(".a { width: 2px; }");
  });

  it("self-heals like injectStyleOnce when ADO sheets load after it", () => {
    setStyle("dyn", ".a {}");
    const adoSheet = document.createElement("style");
    document.head.appendChild(adoSheet);

    setStyle("dyn", ".a {}");
    expect(document.head.lastElementChild?.getAttribute("data-adofix")).toBe("dyn");
  });
});
