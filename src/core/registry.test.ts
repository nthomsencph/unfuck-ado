import { describe, expect, it, vi } from "vitest";
import type { Route } from "./router";
import type { Hotkeys } from "./keys";
import { createRegistry } from "./registry";

const route = (area: Route["area"]): Route => ({
  org: "o",
  project: "p",
  repo: null,
  area,
  id: null,
  path: "/o/p",
});

function stubHotkeys(): Hotkeys {
  return {
    register: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
  };
}

function fresh(): { registry: ReturnType<typeof createRegistry>; hotkeys: Hotkeys } {
  const hotkeys = stubHotkeys();
  return { registry: createRegistry(hotkeys, () => route("boards")), hotkeys };
}

describe("registry", () => {
  it("filters features by area", () => {
    const { registry } = fresh();
    const boards = vi.fn();
    const pr = vi.fn();
    registry.register({ id: "a", areas: ["boards"], apply: boards });
    registry.register({ id: "b", areas: ["repos-pr"], apply: pr });

    registry.applyAll(route("boards"));
    expect(boards).toHaveBeenCalledTimes(1);
    expect(pr).not.toHaveBeenCalled();
  });

  it('runs "*" features on every area', () => {
    const { registry } = fresh();
    const fn = vi.fn();
    registry.register({ id: "a", areas: "*", apply: fn });
    registry.applyAll(route("unknown"));
    registry.applyAll(route("wiki"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("one throwing feature never kills the others", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registry } = fresh();
    const after = vi.fn();
    registry.register({
      id: "broken",
      areas: "*",
      apply: () => {
        throw new Error("boom");
      },
    });
    registry.register({ id: "healthy", areas: "*", apply: after });

    expect(() => registry.applyAll(route("boards"))).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("calls init exactly once, and ignores duplicate ids entirely", () => {
    const { registry } = fresh();
    const init = vi.fn();
    const firstApply = vi.fn();
    const secondApply = vi.fn();
    registry.register({ id: "dup", areas: "*", init, apply: firstApply });
    registry.register({ id: "dup", areas: "*", init, apply: secondApply });

    registry.applyAll(route("boards"));
    expect(init).toHaveBeenCalledTimes(1);
    expect(firstApply).toHaveBeenCalledTimes(1);
    expect(secondApply).not.toHaveBeenCalled();
  });

  it("a throwing init does not kill registration or other features", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registry } = fresh();
    const apply = vi.fn();
    registry.register({
      id: "bad-init",
      areas: "*",
      init: () => {
        throw new Error("boom");
      },
      apply,
    });
    registry.applyAll(route("boards"));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("ctx.hotkey prefixes the action with the feature id and inherits areas", () => {
    const { registry, hotkeys } = fresh();
    const handler = vi.fn();
    registry.register({
      id: "my-feature",
      areas: ["repos-pr"],
      init(ctx) {
        ctx.hotkey("do-thing", "d", "Does the thing", handler);
      },
      apply: () => {},
    });

    expect(hotkeys.register).toHaveBeenCalledWith({
      action: "my-feature.do-thing",
      defaultKey: "d",
      areas: ["repos-pr"],
      description: "Does the thing",
      handler,
    });
  });

  it("ctx.route exposes the current route to handlers", () => {
    const hotkeys = stubHotkeys();
    const registry = createRegistry(hotkeys, () => route("workitems"));
    let seen: Route | null = null;
    registry.register({
      id: "f",
      areas: "*",
      init(ctx) {
        seen = ctx.route();
      },
      apply: () => {},
    });
    expect(seen).toMatchObject({ area: "workitems" });
  });
});
