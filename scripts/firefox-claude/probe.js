// Read-only page probes for the Firefox javascript tool on CSP-strict sites
// (dev.azure.com, github.com block eval, which the port's Runtime.evaluate
// shim relies on). setup.sh splices this into firefox-compat.js: when the
// tool's code contains  __PROBE__{json}__END__  the shim runs adofixProbe
// in the page instead of eval. Ops:
//   {op:"vars", sel}                 custom properties on the first match
//   {op:"css", sel, props, max}      computed props + tag/classes/rect/text per match
//   {op:"html", sel, max}            outerHTML of the first match, truncated
//   {op:"count", sel}                number of matches
//   {op:"rules", match, max}         same-origin CSS rules whose text contains `match`
//   {op:"attr", sel, name}           an attribute of each match
//   {op:"reload"}                     reload the extension itself (picks up setup.sh rebuilds;
//                                    handled in the shim, not here)
function adofixProbe(q) {
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const max = q.max || 20;
  switch (q.op) {
    case 'vars': {
      const el = document.querySelector(q.sel);
      if (!el) return null;
      const cs = getComputedStyle(el), out = {};
      for (let i = 0; i < cs.length; i++) {
        const n = cs[i];
        if (n.startsWith('--') && (!q.prefix || n.startsWith(q.prefix))) out[n] = cs.getPropertyValue(n).trim();
      }
      return out;
    }
    case 'css':
      return all(q.sel).slice(0, max).map((el) => {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect(), props = {};
        for (const p of q.props || []) props[p] = cs.getPropertyValue(p);
        return { tag: el.tagName.toLowerCase(), cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 160),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80), props };
      });
    case 'html': {
      const el = document.querySelector(q.sel);
      return el ? el.outerHTML.slice(0, q.max || 4000) : null;
    }
    case 'count':
      return all(q.sel).length;
    case 'attr':
      return all(q.sel).slice(0, max).map((el) => el.getAttribute(q.name));
    case 'rules': {
      const out = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        for (const r of Array.from(rules)) {
          if (r.cssText.includes(q.match)) out.push(r.cssText.slice(0, 600));
          if (out.length >= (q.max || 30)) return out;
        }
      }
      return out;
    }
    default:
      return 'unknown op';
  }
}
