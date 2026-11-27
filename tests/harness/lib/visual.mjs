// The families' style metrics (D19; QuantEcon/project-theme-parity#80, decisions 2 to 4): every shown surface of every
// counted family, measured in the page-wide checks' page loads, in the same evaluation as its drawn count, so the rows
// of metrics.csv for a page, family and reading number exactly that reading's `shown` in counts.csv. Raw values only:
// the ratios (to the body text, to the column) and any comparison are the visual layer's (#8), not this file's.
//
// Also here: the one colour routine, which behave.mjs's colours() uses too, and the fonts the measured text rendered
// with, for provenance's font fingerprint (decision 5).
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd. What differs
// between the two sites is in theme.mjs: the content root, the body text, and where a surface's TeX, code, heading
// text or label sits (`sourceOf`).
import { createHash } from "node:crypto";
import { harnessFiltered, harnessShown, inPage } from "./util.mjs";

/**
 * The colours a reader sees. Runs in the page. Any CSS colour is read as sRGB: `rgb()` and `rgba()` exactly, any other
 * form through a 1×1 canvas. An element's background is the first opaque background walking up from it, with the
 * translucent ones met on the way composited over it in order, or over white where none is opaque; its colour is its
 * text colour composited over that background. `paint(e)` gives both as `#rrggbb`, with the WCAG 2 contrast ratio of
 * the two, to two decimals, computed from the 8-bit values written. Background images and gradients are not read.
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
    paint(e) {
      const bg = background(e);
      const fg = over(rgba(getComputedStyle(e).color), bg).map(Math.round);
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
 * One shown surface's measures. Runs in the page. The box: its width and height (CSS px), and its overflow
 * (scrollWidth − clientWidth: content wider than the box; empty for an inline box, which has no client width). The
 * dominant text: of the surface's visible text nodes, grouped by their element's colour, font size, font family and
 * weight, the group with the most characters (whitespace not counted; the first in document order on a tie), read on
 * the first element that holds it: its tag, font size and line height, and its colour, background and contrast
 * (harnessPaint). A surface with no visible text has these empty. The element holding the dominant text is kept in
 * `window.__harnessText`, for the font fingerprint.
 */
export function harnessMeasure(e, kit) {
  const r = e.getBoundingClientRect();
  const groups = new Map();
  const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const chars = n.nodeValue.replace(/\s+/g, "").length;
    const at = n.parentElement;
    if (!chars || !at || (at.checkVisibility && !at.checkVisibility({ visibilityProperty: true, opacityProperty: true }))) continue;
    const s = getComputedStyle(at);
    const key = [s.color, s.fontSize, s.fontFamily, s.fontWeight].join("|");
    const g = groups.get(key);
    if (g) g.chars += chars; else groups.set(key, { chars, at });
  }
  let top = null;
  for (const g of groups.values()) if (!top || g.chars > top.chars) top = g;
  const out = {
    width: harnessPx(r.width), height: harnessPx(r.height),
    overflow: getComputedStyle(e).display === "inline" ? "" : e.scrollWidth - e.clientWidth,
    text: "", font_size: "", line_height: "", colour: "", background: "", contrast: "",
  };
  if (top) {
    const s = getComputedStyle(top.at);
    Object.assign(out, { text: top.at.tagName.toLowerCase(), font_size: harnessPx(s.fontSize), line_height: harnessPx(s.lineHeight), ...kit.paint(top.at) });
    (window.__harnessText ??= new Set()).add(top.at);
  }
  return out;
}

// One family on one page at one reading, in one evaluation: { drawn, shown, surfaces }, the counts as countDrawn
// (util.mjs) takes them, and each shown surface's measures, `n` (its place among the drawn matches, from 1) and
// `source` (theme.mjs's sourceOf). A surface whose measures throw keeps its row, with `fault`.
const SURFACES = (sourceOf) => inPage((els, { filter, content }) => {
  const kept = harnessFiltered(els, filter);
  const kit = harnessPaint();
  const root = document.querySelector(content);
  const surfaces = [];
  let shown = 0;
  kept.forEach((e, i) => {
    if (!harnessShown(e)) return;
    shown++;
    let source = {};
    try { source = harnessSource(e, root) ?? {}; } catch {}
    try { surfaces.push({ n: i + 1, ...harnessMeasure(e, kit), source }); }
    catch (err) { surfaces.push({ n: i + 1, source, fault: String(err?.message ?? err).slice(0, 200) }); }
  });
  return { drawn: kept.length, shown, surfaces };
}, harnessFiltered, harnessShown, harnessPaint, harnessPx, harnessMeasure, declaredAs("harnessSource", sourceOf));

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
  return page.locator(spec.select).evaluateAll(composed.get(theme), { filter, content: theme.content });
}

// The page's reference text at this reading: its body text's font size and line height, and its width (the column),
// from the first shown element `bodyText` matches inside the content root; each empty when there is none.
const BODY = inPage(({ content, body }) => {
  const root = document.querySelector(content);
  const p = root ? [...root.querySelectorAll(body)].find(harnessShown) : null;
  if (!p) return { body_font_size: "", body_line_height: "", column: "" };
  const s = getComputedStyle(p);
  (window.__harnessText ??= new Set()).add(p);
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
const NORMALISE = {
  tex: (t) => t.replace(TEX_WRAP, "").replace(TEX_DROP, (m) => (m === "\\\\" ? m : "")).replace(/\s+/g, ""),
  code: (t) => t.replace(/\s+/g, ""),
  heading: (t) => t.replace(/\s+/g, "").toLowerCase(),
  label: (t) => t.trim().toLowerCase().replace(/[_:]/g, "-").replace(/^equation-/, ""),
};

/** The rules, in words, for provenance.json. */
export const KEY_RULES = {
  order: "the first of the surface's TeX, code, heading text and label that is there and not empty once normalised (theme.mjs's sourceOf says where each sits); none: empty, and the surface pairs by `n`",
  tex: "the maths' TeX, with \\begin and \\end of split, equation, align, aligned, gather and gathered, \\tag{…}, \\label{…}, \\nonumber, \\notag, the spacing commands (\\, \\; \\: \\! \\> and a backslash before a space; \\quad, \\qquad, \\thinspace and their kin; ~) and all whitespace removed; a line break \\\\ kept",
  code: "the code a cell or code block shows as its input (never its output), all whitespace removed",
  heading: "the heading's text without its number or permalink, all whitespace removed, lower-cased",
  label: "the nearest label at or above the surface (an id an author gave, not one the build generated), lower-cased, `_` and `:` as `-`, and Sphinx's `equation-` dropped",
  hash: "<kind>:<the first 12 hexadecimal digits of the SHA-256 of the normalised text, as UTF-8>",
};

/** The surface's key, `<kind>:<12 hex>`, from the first source that is not empty once normalised; "" for none. */
export function keyOf(source) {
  for (const kind of KEY_KINDS) {
    const raw = source?.[kind];
    if (typeof raw !== "string") continue;
    const norm = NORMALISE[kind](raw);
    if (norm) return `${kind}:${createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 12)}`;
  }
  return "";
}

/** One row of metrics.csv, from a reading, a family, a surface and the page's body text. */
export function metricRow(where, family, s, body) {
  const { source, fault, ...m } = s;
  return {
    page: where.page, family, viewport: where.viewport, scheme: where.scheme, n: s.n, key: keyOf(source),
    width: m.width ?? "", height: m.height ?? "", column: body?.column ?? "", overflow: m.overflow ?? "",
    text: m.text ?? "", font_size: m.font_size ?? "", line_height: m.line_height ?? "",
    body_font_size: body?.body_font_size ?? "", body_line_height: body?.body_line_height ?? "",
    colour: m.colour ?? "", background: m.background ?? "", contrast: m.contrast ?? "",
    crop: "", sha256: "",
  };
}

// ---- the fonts the measured text rendered with (decision 5) -------------------------------------------------------

/**
 * The fonts the page's measured text rendered with: for every element that held a surface's dominant text, or the
 * body text, the platform fonts Chromium drew its text nodes in (DevTools' CSS.getPlatformFontsForNode), each as
 * "family (PostScript name), web|system". Chromium only.
 */
export async function renderedFonts(page) {
  const marked = await page.evaluate(() => {
    let n = 0;
    for (const e of window.__harnessText ?? []) if (e.isConnected) { e.setAttribute("data-harness-text", ""); n++; }
    return n;
  });
  const out = new Set();
  if (!marked) return out;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-harness-text]" });
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      for (const f of fonts) out.add(`${f.familyName} (${f.postScriptName || "?"}), ${f.isCustomFont ? "web" : "system"}`);
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

/** The fingerprint: SHA-256 of the sorted rendered fonts and font files, one per line. */
export function fingerprint(rendered, files) {
  const lines = [...[...rendered].sort().map((f) => `font ${f}`), ...[...files].sort().map((f) => `file ${f}`)];
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}
