import { ICONS, type OcticonName, type OcticonVariant } from "./icons.gen";

export type { OcticonName };

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * GitHub's Octicon `name` as an <svg>, colored by currentColor like on
 * github.com. Uses the 24px drawing at 24px and up, the 16px one below
 * (Octicons are hand-tuned per size, not scaled). Throws on a name missing
 * from scripts/icons.txt — the type catches literals, this catches strings.
 */
export function octicon(name: OcticonName, size = 16): SVGSVGElement {
  const icon = ICONS[name] as { 16: OcticonVariant; 24?: OcticonVariant } | undefined;
  if (!icon) throw new Error(`octicon: "${name}" is not bundled (add it to scripts/icons.txt)`);
  const h = size >= 24 && icon[24] ? 24 : 16;
  const variant = icon[h]!;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `octicon octicon-${name}`);
  svg.setAttribute("viewBox", `0 0 ${variant.w} ${h}`);
  svg.setAttribute("width", String(Math.round((variant.w * size) / h)));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  for (const attrs of variant.paths) {
    const path = document.createElementNS(SVG_NS, "path");
    for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v);
    svg.appendChild(path);
  }
  return svg;
}
