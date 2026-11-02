import { afterEach, describe, expect, it } from "vitest";
import { boardDensity } from "./board-density";
import type { Route } from "../core/router";

const route = {} as Route;

describe("board-density card-style rules", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("copies a card-style rule's inline background into --adofix-card-rule", () => {
    document.body.innerHTML = `<div class="wit-card" style="background-color: rgb(240, 102, 115)"></div><div class="wit-card"></div>`;
    boardDensity.apply(route);
    const [ruled, plain] = document.querySelectorAll<HTMLElement>(".wit-card");
    expect(ruled!.style.getPropertyValue("--adofix-card-rule")).toBe("rgb(240, 102, 115)");
    expect(plain!.getAttribute("style")).toBeNull();
  });

  it("follows a rule that changes or goes away", () => {
    document.body.innerHTML = `<div class="wit-card" style="background-color: rgb(240, 102, 115)"></div>`;
    const card = document.querySelector<HTMLElement>(".wit-card")!;
    boardDensity.apply(route);
    card.style.backgroundColor = "rgb(1, 2, 3)";
    boardDensity.apply(route);
    expect(card.style.getPropertyValue("--adofix-card-rule")).toBe("rgb(1, 2, 3)");
    card.style.removeProperty("background-color");
    boardDensity.apply(route);
    expect(card.style.getPropertyValue("--adofix-card-rule")).toBe("");
  });
});
