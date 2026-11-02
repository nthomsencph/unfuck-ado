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
  /**
   * Page scope, for features whose CSS targets generic chrome that other
   * pages share. Evaluated by the registry on EVERY pass (a route outside
   * `areas` is out of scope without calling it) and mirrored on <html> as
   * `data-adofix-<id>`: a string becomes the attribute's value, `true` an
   * empty attribute, `false` removes it. Leaving the page — to any hub —
   * clears it, which a feature toggling its own attribute from apply()
   * cannot do: apply() never runs outside its areas. Out of scope, apply()
   * is skipped. CSS selects it via scopeSelector().
   */
  scope?(route: Route): string | boolean;
  /** MUST be idempotent, MUST NOT throw upward (registry guards anyway). */
  apply(route: Route): void;
}

/** The <html> attribute mirroring a feature's scope(). */
export const scopeAttr = (featureId: string): string => `data-adofix-${featureId}`;

/**
 * CSS selector for "this feature's page is showing" — optionally a
 * specific scope value (e.g. the sprints tab).
 */
export function scopeSelector(featureId: string, value?: string): string {
  return value === undefined
    ? `html[${scopeAttr(featureId)}]`
    : `html[${scopeAttr(featureId)}="${value}"]`;
}

export interface Registry {
  register(feature: Feature): void;
  /** Runs on every route change and every debounced DOM settle. */
  applyAll(route: Route): void;
}

/** Writes a scope() result onto <html>; returns whether it is in scope. */
function mirrorScope(feature: Feature, scope: string | boolean): boolean {
  const html = document.documentElement;
  const attr = scopeAttr(feature.id);
  if (scope === false) {
    html.removeAttribute(attr);
    return false;
  }
  const value = scope === true ? "" : scope;
  if (html.getAttribute(attr) !== value) html.setAttribute(attr, value);
  return true;
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
        const inArea = feature.areas === "*" || feature.areas.includes(route.area);
        try {
          const inScope = feature.scope ? mirrorScope(feature, inArea && feature.scope(route)) : inArea;
          if (inScope) feature.apply(route);
        } catch (err) {
          warn(`feature "${feature.id}" failed to apply`, err);
        }
      }
    },
  };
}
