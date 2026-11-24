// The error markers (QuantEcon/project-theme-parity#15): what a page shows where an engine or a theme failed to
// render something. One list for both sites, the contract the two corpora share; a marker of the other stack would
// be a finding too.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.

export const MARKERS = [
  ["mjx-merror", "MathJax error (mjx-merror)"],
  [".katex-error", "KaTeX error (.katex-error)"],
  // mystmd renders a KaTeX parse error as red text in a <pre> titled with the message, without `.katex-error`
  // (the design notes on QuantEcon/project-theme-parity#15; the maths page, 2026-11-22)
  ["pre[title] > span.text-red-500", "maths error text (mystmd's red KaTeX message)"],
  [".system-message", "docutils system message (.system-message)"],
  [".problematic", "docutils problematic (.problematic)"],
];

export const MARKER_NAMES = [...MARKERS.map(([s]) => s), '"Unknown Directive"', '"Unknown Role"'].join(", ");

/** { count, detail }: every marker on the page, by kind, with the first few texts. */
export async function errorMarkers(page) {
  const found = await page.evaluate((markers) => {
    const out = [];
    const short = (t) => t.replace(/\s+/g, " ").trim().slice(0, 90);
    for (const [sel, name] of markers) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length) out.push({ name, n: els.length, texts: els.slice(0, 3).map((e) => short(e.getAttribute("title") || e.textContent)) });
    }
    // mystmd titles an unknown directive's box "<name> - Unknown Directive"; Sphinx stops the build instead
    const unknown = { Directive: [], Role: [] };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest("script, style, code, pre, template, textarea") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = walk.nextNode());) {
      const m = n.nodeValue.match(/\bUnknown (Directive|Role)\s*$/);
      if (m) unknown[m[1]].push(short(n.parentElement.textContent));
    }
    for (const [k, texts] of Object.entries(unknown)) if (texts.length) out.push({ name: `"Unknown ${k}"`, n: texts.length, texts: texts.slice(0, 6) });
    return out;
  }, MARKERS);
  const count = found.reduce((s, f) => s + f.n, 0);
  return { count, detail: found.map((f) => `${f.n} ${f.name}: ${f.texts.map((t) => `"${t}"`).join(", ")}`).join("; ") };
}
