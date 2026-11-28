// The families' style metrics (D19; QuantEcon/project-theme-parity#80, decisions 2 to 4): every shown surface of every
// counted family, measured in the page-wide checks' page loads, in the same evaluation as its drawn count, so the rows
// of metrics.csv for a page, family and reading number exactly that reading's `shown` in counts.csv. Raw values only:
// the ratios (to the body text, to the column) and any comparison are the visual layer's (#8), not this file's.
//
// Also here: the one colour routine, which behave.mjs's colours() uses too, and the fonts the measured text rendered
// with, for provenance's font fingerprint (decision 5).
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd. What differs
// between the two sites is in theme.mjs: the content root, the body text, the elements whose glyphs are drawn as
// generated content rather than text (`glyphs`), and where a surface's TeX, code, heading text or label sits
// (`sourceOf`).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LABEL_IDS } from "./labels.mjs";
import { harnessFiltered, harnessShown, inPage } from "./util.mjs";

/**
 * The colours a reader sees. Runs in the page. Any CSS colour is read as sRGB: `rgb()` and `rgba()` exactly, any other
 * form through a 1×1 canvas. An element's background is the first opaque background walking up from it, with the
 * translucent ones met on the way composited over it in order, or over white where none is opaque; its colour is its
 * text colour composited over that background. `paint(e)` gives both as `#rrggbb`, with the WCAG 2 contrast ratio of
 * the two, to two decimals, computed from the 8-bit values written. Background images and gradients are not read, nor
 * is `opacity`: an ancestor's opacity fades what is drawn, and the colours here are the ones the styles name. With
 * `pseudo` ("::before"), the colour is the generated content's.
 */
export function harnessPaint() {
  let cx = null;
  const rgba = (c) => {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/.exec(c);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[5] ? +m[4] / 100 : +m[4]];
    if (!cx) cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "rgba(0, 0, 0, 0)";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const background = (e) => {
    const layers = [];
    for (let x = e; x; x = x.parentElement) {
      const c = rgba(getComputedStyle(x).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    return layers.reverse().reduce((acc, l) => over(l, acc), [255, 255, 255, 1]).map(Math.round);
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return ((hi + 0.05) / (lo + 0.05)).toFixed(2); };
  return {
    background: (e) => hex(background(e)),
    paint(e, pseudo = null) {
      const bg = background(e);
      const fg = over(rgba(getComputedStyle(e, pseudo).color), bg).map(Math.round);
      return { colour: hex(fg), background: hex(bg), contrast: ratio(fg, bg) };
    },
  };
}

/** A computed length as metrics.csv writes it: px without the unit, rounded to 1/100 px; `normal` kept as written. */
export function harnessPx(v) {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  return /^-?[\d.]+px$/.test(v) ? Math.round(parseFloat(v) * 100) / 100 : v;
}

/**
 * Is what this element holds hidden from the reader, though checkVisibility() passes it? Runs in the page. It is, when
 * it or an ancestor up to `stop` (the surface) is visually hidden: a box of 1px or less in a direction it hides its
 * overflow in (the "screen-reader only" pattern, and KaTeX's MathML copy), a `clip: rect(…)` on an absolutely placed box
 * that leaves 1px or less (MathJax's assistive MathML), or a `clip-path: inset(…)` that does (its four insets read,
 * each a length or a percentage of the box: `inset(50%)` and `inset(0 0 100% 0)` hide, `inset(50% 0 0 0)` leaves half).
 * `memo` keeps each element's answer for the surface.
 */
export function harnessHidden(el, stop, memo) {
  if (!el) return false;
  if (memo.has(el)) return memo.get(el);
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  let hidden = (r.width <= 1 && s.overflowX !== "visible") || (r.height <= 1 && s.overflowY !== "visible");
  if (!hidden && (s.position === "absolute" || s.position === "fixed") && s.clip.startsWith("rect(")) {
    const [t, rt, b, l] = s.clip.slice(5, -1).split(/[\s,]+/).map((v) => (v === "auto" ? null : parseFloat(v)));
    hidden = (rt != null && l != null && rt - l <= 1) || (b != null && t != null && b - t <= 1);
  }
  if (!hidden) {
    const m = /^inset\(([^)]*)\)/.exec(s.clipPath);
    if (m) {
      const [t, rt = t, b = t, l = rt] = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
      const len = (v, of) => (v.endsWith("%") ? (parseFloat(v) / 100) * of : parseFloat(v) || 0);
      const [y, x] = [len(t, r.height) + len(b, r.height), len(rt, r.width) + len(l, r.width)];
      hidden = (y > 0 && r.height - y <= 1) || (x > 0 && r.width - x <= 1);
    }
  }
  if (!hidden && el !== stop) hidden = harnessHidden(el.parentElement, stop, memo);
  memo.set(el, hidden);
  return hidden;
}

/** How many characters a reader sees in `t`: whitespace and invisible format characters (zero-width spaces, …) not counted. */
export function harnessChars(t) {
  return Array.from(String(t).replace(/[\s\p{Cf}]+/gu, "")).length;
}

/** The text a `content` value draws: its quoted strings, joined; none for `none`, `normal` or anything else. */
export function harnessContent(c) {
  return (String(c).match(/"(?:[^"\\]|\\.)*"/g) ?? []).map((q) => q.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
}

/**
 * One shown surface's measures. Runs in the page. The box: its width and height (CSS px), and its overflow
 * (scrollWidth − clientWidth, at least 0: content wider than the box; Chrome gives a bordered table a client width
 * past its scroll width, which is no overflow; empty for an inline box, which has no client width). The
 * dominant text: of what the surface draws as text (its text nodes, and the `::before` content of any element that
 * `glyphs` names: MathJax draws its glyphs so), leaving out what is hidden (checkVisibility(), then harnessHidden),
 * grouped by the colour, font size, font family and weight it is drawn in, the group with the most characters
 * (harnessChars; the first in document order on a tie), read on the element in it that draws the most of it (the first
 * on a tie): its tag, font size and line height, and its colour, background and contrast (harnessPaint). Text in an
 * element `skip` names (theme.mjs's textSkip: a heading's section number) is not counted, so a heading reads as its
 * own text however short it is beside its number. Text drawn as generated content has no
 * line height: MathJax sets its glyphs' to 0 and places them by padding, so a CSS line height does not describe them,
 * and the column is left empty. A surface that draws no text has these empty. The element that draws the dominant
 * text is kept in `window.__harnessText`, for the font fingerprint.
 */
export function harnessMeasure(e, kit, glyphs, skip = null) {
  const r = e.getBoundingClientRect();
  const memo = new Map(), seen = new Map();
  const shown = (at) => {
    if (!seen.has(at)) seen.set(at, !(at.checkVisibility && !at.checkVisibility({ visibilityProperty: true, opacityProperty: true })) && !harnessHidden(at, e, memo));
    return seen.get(at);
  };
  const groups = new Map();
  const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walk.currentNode; n; n = walk.nextNode()) {
    let chars = 0, at = null, pseudo = null;
    if (n.nodeType === Node.TEXT_NODE) { chars = harnessChars(n.nodeValue); at = n.parentElement; }
    else if (glyphs && n.matches(glyphs)) { chars = harnessChars(harnessContent(getComputedStyle(n, "::before").content)); at = n; pseudo = "::before"; }
    if (!chars || !at || !shown(at) || (skip && Element.prototype.closest.call(at, skip))) continue;
    const s = getComputedStyle(at, pseudo);
    const key = [s.color, s.fontSize, s.fontFamily, s.fontWeight].join("|");
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { chars: 0, els: new Map() }));
    g.chars += chars;
    // each element's characters in the group, its text and its ::before apart, in the order first met
    if (!g.els.has(at)) g.els.set(at, {});
    const slot = g.els.get(at);
    (slot[pseudo ?? "text"] ??= { at, pseudo, chars: 0 }).chars += chars;
  }
  let group = null;
  for (const g of groups.values()) if (!group || g.chars > group.chars) group = g;
  let top = null;
  for (const slot of group?.els.values() ?? []) for (const x of Object.values(slot)) if (!top || x.chars > top.chars) top = x;
  const out = {
    width: harnessPx(r.width), height: harnessPx(r.height),
    overflow: getComputedStyle(e).display === "inline" ? "" : Math.max(0, e.scrollWidth - e.clientWidth),
    text: "", font_size: "", line_height: "", colour: "", background: "", contrast: "",
  };
  if (top) {
    const s = getComputedStyle(top.at, top.pseudo);
    Object.assign(out, { text: top.at.tagName.toLowerCase(), font_size: harnessPx(s.fontSize), line_height: top.pseudo ? "" : harnessPx(s.lineHeight), ...kit.paint(top.at, top.pseudo) });
    (window.__harnessText ??= new Map()).set(top.at, top.pseudo ? "before" : "text");
  }
  return out;
}

// One family on one page at one reading, in one evaluation: { drawn, shown, surfaces }, the counts as countDrawn
// (util.mjs) takes them, and each shown surface's measures, `n` (its place among the drawn matches, from 1) and
// `source` (theme.mjs's sourceOf). A surface whose measures throw keeps its row, with `fault`; one whose source
// throws keeps its measures, with no key and `keyFault`.
const SURFACES = (sourceOf) => inPage((els, { filter, content, glyphs, skip }) => {
  const kept = harnessFiltered(els, filter);
  const kit = harnessPaint();
  let root = null;
  try { root = document.querySelector(content); } catch {}
  const surfaces = [];
  let shown = 0;
  kept.forEach((e, i) => {
    if (!harnessShown(e)) return;
    shown++;
    let source = {}, keyFault = null;
    try { source = harnessSource(e, root) ?? {}; } catch (err) { keyFault = String(err?.message ?? err).slice(0, 200); }
    try { surfaces.push({ n: i + 1, ...harnessMeasure(e, kit, glyphs, skip), source, keyFault }); }
    catch (err) { surfaces.push({ n: i + 1, source, keyFault, fault: String(err?.message ?? err).slice(0, 200) }); }
  });
  return { drawn: kept.length, shown, surfaces };
}, harnessFiltered, harnessShown, harnessPaint, harnessPx, harnessHidden, harnessChars, harnessContent, harnessMeasure, declaredAs("harnessSource", sourceOf));

/** A theme's in-page function (a function, an arrow or a method), declared under the name the evaluation calls. */
function declaredAs(name, f) {
  const s = String(f).trim();
  const expr = /^(async\s+)?function\b/.test(s) || /^(async\s*)?(\([^)]*\)|[\w$]+)\s*=>/.test(s) ? s : `function ${s}`;
  return `const ${name} = (${expr});`;
}

const composed = new WeakMap();
/**
 * Count and measure a family's drawn selector on the page (drawn.yml; D18, D19): { drawn, shown, surfaces }, with
 * `drawn` and `shown` as countDrawn gives them. A selector the page cannot parse throws, as there.
 */
export async function measureDrawn(page, selector, theme) {
  if (!composed.has(theme)) composed.set(theme, SURFACES(theme.sourceOf));
  const spec = typeof selector === "string" ? { select: selector } : selector;
  const filter = spec.text != null ? { in: spec.in ?? null, text: spec.text } : null;
  return page.locator(spec.select).evaluateAll(composed.get(theme), { filter, content: theme.content, glyphs: theme.glyphs ?? null, skip: theme.textSkip ?? null });
}

// The page's reference text at this reading: its body text's font size and line height, and its width (the column),
// from the first shown element `bodyText` matches inside the content root; each empty when there is none.
const BODY = inPage(({ content, body }) => {
  const root = document.querySelector(content);
  const p = root ? [...root.querySelectorAll(body)].find(harnessShown) : null;
  if (!p) return { body_font_size: "", body_line_height: "", column: "" };
  const s = getComputedStyle(p);
  (window.__harnessText ??= new Map()).set(p, "text");
  return { body_font_size: harnessPx(s.fontSize), body_line_height: harnessPx(s.lineHeight), column: harnessPx(p.getBoundingClientRect().width) };
}, harnessShown, harnessPx);

export async function bodyText(page, theme) {
  return page.evaluate(BODY, { content: theme.content, body: theme.bodyText });
}

// ---- the pairing key (decision 3) ---------------------------------------------------------------------------------

export const KEY_KINDS = ["tex", "code", "heading", "label"];

// TeX: the wrappers each engine adds or drops (split on Sphinx; equation, align, aligned, gather, gathered),
// \tag, \label, \nonumber and \notag, the spacing commands, and whitespace, removed; a line break `\\` kept
const TEX_WRAP = /\\(?:begin|end)\{(?:split|equation\*?|align\*?|aligned|gather\*?|gathered)\}/g;
const TEX_DROP = /\\\\|\\(?:tag|label)\*?\{[^{}]*\}|\\(?:nonumber|notag|quad|qquad|thinspace|medspace|thickspace|enspace|negthinspace)(?![A-Za-z])|\\[,;:!> ]|~/g;
const texKey = (t) => t.replace(TEX_WRAP, "").replace(TEX_DROP, (m) => (m === "\\\\" ? m : "")).replace(/\s+/g, "");
// a heading's inline maths, which each theme's sourceOf writes as its TeX between U+E000 and U+E001
const HEADING_TEX = /\uE000([\s\S]*?)\uE001/g;
const NORMALISE = {
  tex: texKey,
  code: (t) => t.replace(/\s+/g, ""),
  heading: (t) => t.replace(HEADING_TEX, (m, x) => `\uE000${texKey(x)}\uE001`).replace(/\s+/g, "").toLowerCase(),
  label: (t) => t.replace(/\s+/g, " ").trim().toLowerCase(),
};

/** The rules, in words, for provenance.json. */
export const KEY_RULES = {
  order: "the first of the surface's TeX, code, heading text and label that is there and not empty once normalised (theme.mjs's sourceOf says where each sits); none: empty, and the surface pairs by `n`",
  tex: "the maths' TeX, with \\begin and \\end of split, equation, align, aligned, gather and gathered, \\tag{…}, \\label{…}, \\nonumber, \\notag, the spacing commands (\\, \; \\: \\! \\> and a backslash before a space; \\quad, \\qquad, \\thinspace and their kin; ~) and all whitespace removed; a line break \\\\ kept",
  code: "the code a cell or code block shows as its input (never its output, nor its line numbers), all whitespace removed",
  heading: "the heading's text without its number or permalink, each inline maths element in it replaced by its TeX normalised as the TeX rule does (so a heading with maths keys the same on both stacks), all whitespace removed, lower-cased",
  label: "the source label whose id is the one at the surface's own label site (the surface, or the wrapper the theme draws round it: Sphinx's div.math round a display, mystmd's block round one): a label an author wrote in the page's source (lectures/<page>.md: (label)=, :label:, :name:, a directive's YAML options' label: or name:, $$ … $$ (label), \\label{…}, a footnote's [^label]), and an id the stack gives that label (theme.mjs's labelIds, from lib/labels.mjs: docutils' make_id, `equation-` for a display and the label as written on Sphinx; mystmd's createHtmlId of normalizeIdentifier, and that identifier, which a footnote's id carries after `fn-`, on mystmd), and no label that either stack would give an id another label of the page's takes; so no generated id becomes a key, no surface takes another's label, and the same source gives the same key on both stacks and at every build. The label as written, its whitespace collapsed, trimmed and lower-cased",
  hash: "<kind>:<the first 12 hexadecimal digits of the SHA-256 of the normalised text, as UTF-8>",
};

/**
 * The surface's key, `<kind>:<12 hex>`, from the first source that is not empty once normalised; a label only where
 * `sites` (labelSites: the ids the page's source labels take) has its id, as the source label it stands for; "" for
 * none.
 */
export function keyOf(source, sites = new Map()) {
  for (const kind of KEY_KINDS) {
    const raw = source?.[kind];
    if (typeof raw !== "string") continue;
    const norm = kind === "label" ? (sites.get(raw) ?? "") : NORMALISE[kind](raw);
    if (!norm) continue;
    return `${kind}:${createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 12)}`;
  }
  return "";
}

/**
 * A page's label sites: a Map from each id this stack gives one of the page's source labels (`idsOf`, theme.mjs's
 * labelIds) to that label, normalised. A label that either stack (`stacks`, lib/labels.mjs's rules) would give an id
 * another of the page's labels also takes is left out on both (docutils makes `10-step` and `step` both `step`;
 * mystmd makes `Größe` and `Grüße` both `gr-e`), so no surface takes a label that may be another's, and a label keys
 * on both stacks or on neither.
 */
export function labelSites(labels, idsOf = (l) => [l], stacks = Object.values(LABEL_IDS)) {
  const all = [...new Set((labels ?? []).map(String))].filter((l) => labelOf(l));
  const unsure = new Set();
  for (const rule of [idsOf, ...stacks]) {
    const by = new Map();
    for (const l of all) for (const id of new Set(rule(l))) if (id) { if (!by.has(id)) by.set(id, new Set()); by.get(id).add(labelOf(l)); }
    for (const s of by.values()) if (s.size > 1) for (const label of s) unsure.add(label);
  }
  const sites = new Map();
  for (const l of all) if (!unsure.has(labelOf(l))) for (const id of idsOf(l)) if (id) sites.set(id, labelOf(l));
  return sites;
}

// The labels an author writes in a MyST page: a target `(label)=`, a directive's `:label:` or `:name:`, an equation's
// `$$ … $$ (label)`, a `\label{…}` in TeX, and a footnote's definition `[^label]:`; and, in a directive's options written
// as YAML (a `---` block straight after its opening line), a `label:` or `name:` at any depth (a code cell's
// `mystnb.figure.name`). A page's front matter is no directive's: its kernelspec `name:` is no label.
const OPTION_BLOCK = /^[ \t]*(?:`{3,}|:{3,}|~{3,})\{[^}\n]+\}[^\n]*\n[ \t]*---[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*---[ \t]*\r?$/gm;
const OPTION_LABEL = /^[ \t]*(?:label|name):[ \t]*["']?([^"'\s#]+)["']?(?:[ \t]+#.*)?[ \t]*\r?$/gm;
const LABEL_SYNTAX = [/^\s*\(([^()\s]+)\)=\s*$/gm, /^\s*:(?:label|name):\s*"?([^"\s]+)"?\s*$/gm, /\$\$\s*\(([^()\s]+)\)\s*$/gm, /\\label\{([^{}]+)\}/g, /^\[\^([^\]\s]+)\]:/gm];

/** A label as the key writes it: the normalisation of `label` above. */
export const labelOf = (t) => NORMALISE.label(String(t));

/** A page's source labels, as written, from its MyST text. */
export function labelsIn(text) {
  const out = new Set();
  const add = (l) => { if (labelOf(l)) out.add(l); };
  for (const re of LABEL_SYNTAX) for (const m of String(text).matchAll(re)) add(m[1]);
  for (const b of String(text).matchAll(OPTION_BLOCK)) for (const m of b[1].matchAll(OPTION_LABEL)) add(m[1]);
  return out;
}

/**
 * Every page's source labels, from `<dir>/<page>.md`: { labels: { page: [label, …] }, missing: [page, …],
 * unreadable: [{ page, why }, …] }. A page with no such file has none, and is named in `missing` (no page of either
 * corpus is a notebook today); one whose file is there and cannot be read (EACCES, EISDIR, EIO, …) has none, and is
 * named in `unreadable`.
 */
export async function sourceLabels(dir, pages) {
  const labels = {}, missing = [], unreadable = [];
  for (const p of pages) {
    let text = "";
    try { text = await readFile(join(dir, `${p}.md`), "utf8"); }
    catch (e) { if (e?.code === "ENOENT") missing.push(p); else unreadable.push({ page: p, why: String(e?.message ?? e) }); }
    labels[p] = [...labelsIn(text)].sort();
  }
  return { labels, missing, unreadable };
}

/** One row of metrics.csv, from a reading, a family, a surface, the page's body text and its source labels. */
export function metricRow(where, family, s, body, labels) {
  const { source, fault, keyFault, ...m } = s;
  return {
    page: where.page, family, viewport: where.viewport, scheme: where.scheme, n: s.n, key: keyOf(source, labels),
    width: m.width ?? "", height: m.height ?? "", column: body?.column ?? "", overflow: m.overflow ?? "",
    text: m.text ?? "", font_size: m.font_size ?? "", line_height: m.line_height ?? "",
    body_font_size: body?.body_font_size ?? "", body_line_height: body?.body_line_height ?? "",
    colour: m.colour ?? "", background: m.background ?? "", contrast: m.contrast ?? "",
    crop: "", sha256: "",
  };
}

const countKey = (r) => [r.page, r.family, r.viewport, r.scheme].join("|");
/**
 * Do the metrics tie to the counts? { ok, readings, surfaces, off }: every reading whose count was taken must have as
 * many metrics rows as its `shown`, and a reading not counted none; `readings` the page readings counted, `surfaces`
 * the sum of `shown`, `off` each reading that does not tie.
 */
export function tieOf(counts, metrics) {
  const rows = new Map();
  for (const m of metrics) rows.set(countKey(m), (rows.get(countKey(m)) ?? 0) + 1);
  const off = [], taken = new Set();
  let surfaces = 0;
  for (const c of counts) {
    const want = c.shown === "" ? 0 : Number(c.shown);
    if (c.shown !== "") { surfaces += want; taken.add(`${c.page}|${c.viewport}|${c.scheme}`); }
    const got = rows.get(countKey(c)) ?? 0;
    rows.delete(countKey(c));
    if (got !== want) off.push(`${countKey(c)}: ${got} rows, shown ${c.shown === "" ? "empty" : c.shown}`);
  }
  for (const [k, n] of rows) off.push(`${k}: ${n} rows, and no count`);
  return { ok: !off.length, readings: taken.size, surfaces, off };
}

// ---- the environment: fonts and the maths engines (decision 5, design 6.3) ---------------------------------------

/**
 * The fonts the page's measured text rendered with: for every element that drew a surface's dominant text, or the
 * body text, the platform fonts Chromium drew it in (DevTools' CSS.getPlatformFontsForNode, on its text, or on its
 * `::before` where its glyphs are generated content), each as "family (PostScript name), web|system". The main
 * frame's document only. Chromium only.
 */
export async function renderedFonts(page) {
  const marked = await page.evaluate(() => {
    let n = 0;
    for (const [e, how] of window.__harnessText ?? []) if (e.isConnected) { e.setAttribute("data-harness-text", how); n++; }
    return n;
  });
  const out = new Set();
  if (!marked) return out;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const read = async (nodeId) => {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      for (const f of fonts) out.add(`${f.familyName} (${f.postScriptName || "?"}), ${f.isCustomFont ? "web" : "system"}`);
    };
    for (const how of ["text", "before"]) {
      const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: `[data-harness-text="${how}"]` });
      if (how === "text") { for (const nodeId of nodeIds) await read(nodeId); continue; }
      // a glyph's font is its ::before's: the pseudo-element's own node
      const backend = [];
      for (const nodeId of nodeIds) {
        const { node } = await cdp.send("DOM.describeNode", { nodeId, depth: 1 });
        for (const ps of node.pseudoElements ?? []) if (ps.pseudoType === "before") backend.push(ps.backendNodeId);
      }
      if (backend.length) {
        const { nodeIds: pseudos } = await cdp.send("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: backend });
        for (const nodeId of pseudos) if (nodeId) await read(nodeId);
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  return out;
}

/**
 * A font file's address as the fingerprint keeps it: on the site itself, its path under the base; a font written
 * into the page as a data URL, its type and a hash; elsewhere, whole.
 */
export function fontFile(url, site) {
  if (url.startsWith("data:")) return `data:${url.slice(5, url.search(/[;,]/))} ${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
  const u = new URL(url);
  if (u.origin === site.origin && u.pathname.startsWith(site.base)) return u.pathname.slice(site.base.length);
  return `${u.origin}${u.pathname}`;
}

/**
 * The page's maths engines, where it has them: MathJax's version (MathJax.version), and KaTeX's, which mystmd renders
 * at build and leaves no script for, read from KaTeX's stylesheet (its `.katex .katex-version::after` content) on a
 * probe element added for the moment. Runs in the page; each null where there is none.
 */
export function harnessMathsEngines() {
  const mathjax = typeof window.MathJax?.version === "string" ? window.MathJax.version : null;
  const probe = document.createElement("span");
  probe.className = "katex";
  probe.style.cssText = "position:absolute;visibility:hidden";
  const v = document.createElement("span");
  v.className = "katex-version";
  probe.append(v);
  document.body.append(probe);
  const katex = harnessContent(getComputedStyle(v, "::after").content) || null;
  probe.remove();
  return { mathjax, katex };
}
const ENGINES = inPage(() => harnessMathsEngines(), harnessContent, harnessMathsEngines);
export async function mathsEngines(page) {
  return page.evaluate(ENGINES);
}

/**
 * The fingerprint (design 6.3): SHA-256 of the installed fonts (fc-list's lines, each with its family, style, version
 * and file, and a hash of the file's bytes), the font files the pages' main frames loaded (each with a hash of its
 * bytes), and the fonts the measured text rendered with, sorted, one per line. It is the union over the pages run, so
 * a run on fewer pages (--pages) fingerprints only what those pages used.
 */
export function fingerprint(rendered, files, installed = []) {
  const lines = [...[...installed].sort().map((f) => `installed ${f}`), ...[...files].sort().map((f) => `file ${f}`), ...[...rendered].sort().map((f) => `font ${f}`)];
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}
