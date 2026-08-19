import type { Area, Route } from "./router";
import type { Hotkeys } from "./keys";
import { warn } from "./log";

export interface FeatureContext {
  /**
   * Registers a hotkey owned by this feature: the action id becomes
   * "<feature-id>.<name>" and areas inherit the feature's own.
   */
  hotkey(
    name: string,
    defaultKey: string,
    description: string,
    handler: (e: KeyboardEvent) => void
  ): void;
  route(): Route;
}

export interface Feature {
  id: string;
  areas: Area[] | "*";
  /** Called exactly once, at registration. One-time setup lives here. */
  init?(ctx: FeatureContext): void;
  /** MUST be idempotent, MUST NOT throw upward (registry guards anyway). */
  apply(route: Route): void;
}

export interface Registry {
  register(feature: Feature): void;
  /** Runs on every route change and every debounced DOM settle. */
  applyAll(route: Route): void;
}

export function createRegistry(hotkeys: Hotkeys, getRoute: () => Route): Registry {
  const features: Feature[] = [];

  const contextFor = (feature: Feature): FeatureContext => ({
    hotkey(name, defaultKey, description, handler) {
      hotkeys.register({
        action: `${feature.id}.${name}`,
        defaultKey,
        areas: feature.areas,
        description,
        handler,
      });
    },
    route: getRoute,
  });

  return {
    register(feature) {
      if (features.some((f) => f.id === feature.id)) return;
      features.push(feature);
      try {
        feature.init?.(contextFor(feature));
      } catch (err) {
        warn(`feature "${feature.id}" failed to init`, err);
      }
    },
    applyAll(route) {
      for (const feature of features) {
        if (feature.areas !== "*" && !feature.areas.includes(route.area)) continue;
        try {
          feature.apply(route);
        } catch (err) {
          warn(`feature "${feature.id}" failed to apply`, err);
        }
      }
    },
  };
}
