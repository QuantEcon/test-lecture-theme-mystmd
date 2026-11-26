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

// The maths markers no selector names alone (QuantEcon/project-theme-parity#65), read in errorMarkers below:
//   - an undefined macro, on MathJax: its `noundefined` package typesets `\foo` as its name in red, with no error
//     node, as <mtext mathcolor="red"> in the assistive MathML and an <mjx-mtext> coloured red whose first glyph is
//     a backslash (mjx-c5C) in the CommonHTML output;
//   - an inline maths error, on mystmd: KaTeX runs at build, an undefined macro is a parse error ("Undefined control
//     sequence"), and myst-theme shows inline maths that failed as its InlineError, a yellow span titled with KaTeX's
//     message (display maths fails as the red <pre> above). The same span marks a cross-reference or citation not
//     found, so only a title in KaTeX's words (" at position N: ", " at end of input: ") counts here;
//   - maths that never rendered: TeX left in the page's text with its delimiters, \(…\), \[…\], $$…$$ or an
//     environment. MathJax removes the delimiters Sphinx writes round each expression when it typesets it, so on
//     Sphinx every one left is an expression that never rendered (all of them when MathJax's CDN fails); mystmd
//     renders KaTeX at build, so there it is TeX the parser did not take as maths. Code, and the maths engines' own
//     output (which carries the TeX in its annotation), are not read; nor is a single `$…$`, as often a price as
//     maths. Where MathJax is told to leave text alone it is not read either, by MathJax's own rule: the closest
//     element (the text's own or an ancestor's) with one of the page's process or ignore classes decides, and a
//     process class wins. A Sphinx page puts its whole text in a section MathJax ignores, and each expression in a
//     .math element it processes, so the expressions are read and the prose round them is not.
const MATHS_MARKERS = [
  "MathJax undefined macro (red \\name)",
  "inline maths error (mystmd's yellow KaTeX message)",
  "maths left as raw TeX",
];

export const MARKER_NAMES = [...MARKERS.map(([s]) => s), ...MATHS_MARKERS, '"Unknown Directive"', '"Unknown Role"'].join(", ");

/** { count, detail }: every marker on the page, by kind, with the first few texts. */
export async function errorMarkers(page) {
  const found = await page.evaluate(([markers, maths]) => {
    const out = [];
    const short = (t) => t.replace(/\s+/g, " ").trim().slice(0, 90);
    for (const [sel, name] of markers) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length) out.push({ name, n: els.length, texts: els.slice(0, 3).map((e) => short(e.getAttribute("title") || e.textContent)) });
    }

    // MathJax's undefined macros: read from the assistive MathML where MathJax wrote it, else from the CommonHTML
    // glyphs (each an mjx-c whose class names the code point)
    const glyphs = (e) => [...e.querySelectorAll("mjx-c")].map((c) => String.fromCodePoint(parseInt(/\bmjx-c([0-9A-F]+)\b/.exec(c.className)?.[1] ?? "3F", 16))).join("");
    const macros = [];
    for (const c of document.querySelectorAll("mjx-container")) {
      const names = c.querySelector("mjx-assistive-mml")
        ? [...c.querySelectorAll('mjx-assistive-mml mtext[mathcolor="red"]')].map((t) => t.textContent)
        : [...c.querySelectorAll("mjx-mtext")].filter((t) => t.style.color === "red").map(glyphs);
      macros.push(...names.filter((t) => t.startsWith("\\")));
    }
    if (macros.length) out.push({ name: maths[0], n: macros.length, texts: macros.slice(0, 6).map(short) });

    // mystmd's inline maths errors
    const inline = [...document.querySelectorAll("span.text-yellow-600[title]")].map((e) => e.getAttribute("title")).filter((t) => / at (?:position \d+|end of input): /.test(t));
    if (inline.length) out.push({ name: maths[1], n: inline.length, texts: inline.slice(0, 3).map(short) });

    // TeX left with its delimiters in the page's text
    const skip = "script, style, code, pre, kbd, samp, template, textarea, noscript, mjx-container, .katex, math";
    const tex = /\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\\begin\{([A-Za-z]+\*?)\}[\s\S]*?\\end\{\1\}/g;
    // the page's MathJax classes: its configuration (window.MathJax before MathJax loads, MathJax.config after), else
    // the ones Sphinx and myst-nb use; a class list is a regular expression's alternatives, as MathJax reads it
    const options = (window.MathJax?.config ?? window.MathJax)?.options ?? {};
    const classes = (list, otherwise) => new RegExp(`(^|\\s)(${typeof list === "string" && list ? list : otherwise})(\\s|$)`);
    const process = classes(options.processHtmlClass, "tex2jax_process|mathjax_process|math|output_area");
    const ignore = classes(options.ignoreHtmlClass, "tex2jax_ignore|mathjax_ignore");
    const ignored = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = e.getAttribute("class") ?? "";
        if (process.test(c)) return false;
        if (ignore.test(c)) return true;
      }
      return false;
    };
    const raw = [];
    const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(skip) || ignored(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = texts.nextNode());) for (const m of n.nodeValue.matchAll(tex)) raw.push(m[0]);
    if (raw.length) {
      const rendered = document.querySelectorAll("mjx-container, .katex").length;
      const mj = window.MathJax;
      const engine = mj && typeof mj === "object" ? (mj.version ? `; MathJax ${mj.version} loaded` : "; MathJax configured, not loaded") : "";
      out.push({ name: maths[2], n: raw.length, note: `never rendered; ${rendered} rendered expression(s) on the page${engine}`, texts: raw.slice(0, 3).map(short) });
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
  }, [MARKERS, MATHS_MARKERS]);
  const count = found.reduce((s, f) => s + f.n, 0);
  return { count, detail: found.map((f) => `${f.n} ${f.name}${f.note ? ` (${f.note})` : ""}: ${f.texts.map((t) => `"${t}"`).join(", ")}`).join("; ") };
}
