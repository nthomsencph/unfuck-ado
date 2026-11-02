import { afterEach, describe, expect, it } from "vitest";
import { injectStyleOnce, setStyle, syncCommandProxies } from "./dom";

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

describe("syncCommandProxies", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function setup(natives: string[]): HTMLElement {
    for (const id of natives) {
      const n = document.createElement("button");
      n.id = id;
      n.innerHTML = '<span class="bolt-button-icon"></span>';
      document.body.appendChild(n);
    }
    const row = document.createElement("div");
    row.innerHTML = '<button id="filter"></button><button id="settings"></button>';
    document.body.appendChild(row);
    return row;
  }
  const ids = (row: Element): string[] =>
    Array.from(row.children).map((c) => (c as HTMLElement).dataset["native"] ?? c.id);

  it("inserts proxies in order after the anchor, once", () => {
    const row = setup(["nwi", "opts"]);
    const specs = [["nwi", "New"], ["opts", "Options"]] as const;
    expect(syncCommandProxies(row.firstElementChild!, specs)).toBe(true);
    expect(syncCommandProxies(row.firstElementChild!, specs)).toBe(false);
    expect(ids(row)).toEqual(["filter", "nwi", "opts", "settings"]);
  });

  it("skips missing natives and drops proxies no longer wanted", () => {
    const row = setup(["nwi", "opts"]);
    syncCommandProxies(row.firstElementChild!, [["nwi", "New"], ["opts", "Options"], ["gone", "X"]]);
    syncCommandProxies(row.firstElementChild!, [["opts", "Options"]]);
    expect(ids(row)).toEqual(["filter", "opts", "settings"]);
  });

  it("leaves another feature's button next to the anchor in place", () => {
    const row = setup(["nwi"]);
    syncCommandProxies(row.firstElementChild!, [["nwi", "New"]]);
    const other = document.createElement("button");
    other.id = "columns";
    row.firstElementChild!.after(other);
    syncCommandProxies(row.firstElementChild!, [["nwi", "New"]]);
    expect(ids(row)).toEqual(["filter", "columns", "nwi", "settings"]);
  });
});
