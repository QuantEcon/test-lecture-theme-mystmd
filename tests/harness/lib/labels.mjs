// The ids each stack gives a source label, for the pairing key's labels (lib/visual.mjs's labelSites; decision 3 of
// QuantEcon/project-theme-parity#80). Both stacks' rules are here, so a label is decided the same way on both: one
// that either stack would give an id another label of the page's also takes keys on neither, and the same source
// gives the same key, or none, on both. Each theme's labelIds is its own stack's rule, so each matches its own ids.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.

// docutils' make_id (docutils/nodes.py), which gives a target's id from its label: lower-cased, the letters with no
// decomposition and the digraphs below written in ASCII, the rest decomposed and kept to ASCII, every run of other
// characters as `-`, and leading digits and hyphens and trailing hyphens dropped (`2d-plot` is `d-plot`)
const ID_DIGRAPHS = { "ß": "sz", "æ": "ae", "œ": "oe", "ȸ": "db", "ȹ": "qp" };
const ID_LETTERS = {
  "ø": "o", "đ": "d", "ħ": "h", "ı": "i", "ł": "l", "ŧ": "t", "ƀ": "b", "ƃ": "b",
  "ƈ": "c", "ƌ": "d", "ƒ": "f", "ƙ": "k", "ƚ": "l", "ƞ": "n", "ƥ": "p", "ƫ": "t",
  "ƭ": "t", "ƴ": "y", "ƶ": "z", "ǥ": "g", "ȥ": "z", "ȴ": "l", "ȵ": "n", "ȶ": "t",
  "ȷ": "j", "ȼ": "c", "ȿ": "s", "ɀ": "z", "ɇ": "e", "ɉ": "j", "ɋ": "q", "ɍ": "r",
  "ɏ": "y",
};
export function docutilsId(label) {
  const id = [...String(label).toLowerCase()].map((c) => ID_DIGRAPHS[c] ?? c).map((c) => ID_LETTERS[c] ?? c).join("")
    .normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  return id.split(/\s+/).filter(Boolean).join(" ").replace(/[^a-z0-9]+/g, "-").replace(/^[-0-9]+|-+$/g, "");
}

// mystmd's ids for a label (myst-common's normalizeIdentifier and createHtmlId, the same at QE_MYSTMD_SHA): its
// identifier, whitespace collapsed, quotes dropped, trimmed and lower-cased; and its html id, from that, every other
// character as `-`, `id-` before a leading digit or hyphen, runs of `-` as one, and none at either end
export function mystIdentifier(label) {
  return String(label).replace(/[\t\n\r ]+/g, " ").replace(/['‘’"“”]+/g, "").trim().toLowerCase();
}
export function mystHtmlId(identifier) {
  return String(identifier).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^([0-9-])/, "id-$1").replace(/-[-]+/g, "-").replace(/(?:^[-]+)|(?:[-]+$)/g, "");
}

/**
 * The ids each stack gives a source label. Sphinx: the label as written (sphinx-exercise and sphinx-proof keep it, as
 * `short_path_ex1`), docutils' id for it (a target, a figure's, table's or code block's `:name:`, a footnote), and a
 * display's, make_id of `equation-` and the label (`1st-order` is `equation-1st-order`). mystmd: its html id (a
 * target, a directive's label, an equation), and its identifier, which a footnote's id is after `fn-` (myst-theme's
 * `fn-${identifier}`).
 */
export const LABEL_IDS = {
  sphinx: (label) => [label, docutilsId(label), docutilsId(`equation-${label}`)],
  mystmd: (label) => { const id = mystIdentifier(label); return [mystHtmlId(id), id]; },
};
