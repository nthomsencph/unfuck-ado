import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_ATTR, BRIDGE_SHEET_ID, detectTheme, luminance, parseCssColor, syncTheme } from "./theme";

const html = document.documentElement;

function mockComputed(backgroundColor: string, backgroundVar = ""): void {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    backgroundColor,
    getPropertyValue: (name: string) => (name === "--background-color" ? backgroundVar : ""),
  } as unknown as CSSStyleDeclaration);
}

describe("detectTheme", () => {
  afterEach(() => {
    document.body.className = "";
    document.head.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("reads ADO's dark theme class", () => {
    document.body.className = "fluent-icons-enabled ms-vss-web-vsts-theme-dark";
    expect(detectTheme()).toEqual({ mode: "dark", highContrast: false });
  });

  it("treats a non-dark theme class as light", () => {
    document.body.className = "ms-vss-web-vsts-theme";
    expect(detectTheme()).toEqual({ mode: "light", highContrast: false });
  });

  it("flags high contrast and still picks dark/light", () => {
    document.body.className = "ms-vss-web-vsts-theme-hc-dark";
    expect(detectTheme()).toEqual({ mode: "dark", highContrast: true });
    document.body.className = "ms-vss-web-vsts-theme-hc-light";
    expect(detectTheme()).toEqual({ mode: "light", highContrast: true });
  });

  it("falls back to the luminance of ADO's body background", () => {
    mockComputed("rgb(32, 31, 30)");
    expect(detectTheme().mode).toBe("dark");
    vi.restoreAllMocks();
    mockComputed("rgb(255, 255, 255)");
    expect(detectTheme().mode).toBe("light");
  });

  it("uses --background-color when the body background is transparent", () => {
    mockComputed("rgba(0, 0, 0, 0)", "rgba(32, 31, 30, 1)");
    expect(detectTheme().mode).toBe("dark");
  });

  it("reads ADO's background with the bridge sheet disabled, then restores it", () => {
    const sheet = document.createElement("style");
    sheet.setAttribute("data-adofix", BRIDGE_SHEET_ID);
    document.head.appendChild(sheet);
    let disabledDuringRead: boolean | undefined;
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      disabledDuringRead = sheet.disabled;
      return { backgroundColor: "rgb(0, 0, 0)", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration;
    });
    detectTheme();
    expect(disabledDuringRead).toBe(true);
    expect(sheet.disabled).toBe(false);
  });
});

describe("syncTheme", () => {
  beforeEach(() => {
    for (const a of ["data-color-mode", "data-dark-theme", "data-light-theme", BRIDGE_ATTR]) html.removeAttribute(a);
  });
  afterEach(() => {
    document.body.className = "";
    vi.restoreAllMocks();
  });

  it("writes Primer's theme attributes and the bridge marker", () => {
    document.body.className = "ms-vss-web-vsts-theme-dark";
    syncTheme();
    expect(html.getAttribute("data-color-mode")).toBe("dark");
    expect(html.getAttribute("data-dark-theme")).toBe("dark");
    expect(html.getAttribute("data-light-theme")).toBe("light");
    expect(html.hasAttribute(BRIDGE_ATTR)).toBe(true);
  });

  it("drops the bridge marker in high contrast but keeps the color mode", () => {
    document.body.className = "ms-vss-web-vsts-theme-hc-dark";
    syncTheme();
    expect(html.hasAttribute(BRIDGE_ATTR)).toBe(false);
    expect(html.getAttribute("data-color-mode")).toBe("dark");
  });

  it("writes attributes only when they change", () => {
    document.body.className = "ms-vss-web-vsts-theme-dark";
    syncTheme();
    const set = vi.spyOn(html, "setAttribute");
    syncTheme();
    expect(set).not.toHaveBeenCalled();

    document.body.className = "ms-vss-web-vsts-theme";
    syncTheme();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("data-color-mode", "light");
  });
});

describe("color helpers", () => {
  it("parses rgb, rgba and hex; transparent is null", () => {
    expect(parseCssColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3]);
    expect(parseCssColor("#0d1117")).toEqual([13, 17, 23]);
    expect(parseCssColor("rgba(0, 0, 0, 0)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });

  it("puts the threshold at relative luminance 0.5", () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(128, 128, 128)).toBeLessThan(0.5); // mid-grey reads dark
  });
});
