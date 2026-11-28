// The ids each stack gives a source label, for the pairing key's labels (lib/visual.mjs's labelSites; decision 3 of
// QuantEcon/project-theme-parity#80). Both stacks' rules are here, so a label is decided the same way on both: one
// that either stack would give an id another label of the page's also takes keys on neither, and the same source
// gives the same key, or none, on both. Each theme's labelIds is its own stack's rule, so each matches its own ids.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.

// docutils' make_id (docutils/nodes.py), which gives a target's id from its label: lower-cased, the letters with no
// decomposition and the digraphs below written in ASCII, the rest decomposed and kept to ASCII, every run of other
// characters as `-`, and leading digits and hyphens and trailing hyphens dropped (`2d-plot` is `d-plot`)
const ID_DIGRAPHS = { "\u00df": "sz", "\u00e6": "ae", "\u0153": "oe", "\u0238": "db", "\u0239": "qp" };
const ID_LETTERS = {
  "\u00f8": "o", "\u0111": "d", "\u0127": "h", "\u0131": "i", "\u0142": "l", "\u0167": "t", "\u0180": "b", "\u0183": "b",
  "\u0188": "c", "\u018c": "d", "\u0192": "f", "\u0199": "k", "\u019a": "l", "\u019e": "n", "\u01a5": "p", "\u01ab": "t",
  "\u01ad": "t", "\u01b4": "y", "\u01b6": "z", "\u01e5": "g", "\u0225": "z", "\u0234": "l", "\u0235": "n", "\u0236": "t",
  "\u0237": "j", "\u023c": "c", "\u023f": "s", "\u0240": "z", "\u0247": "e", "\u0249": "j", "\u024b": "q", "\u024d": "r",
  "\u024f": "y",
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
  return String(label).replace(/[\t\n\r ]+/g, " ").replace(/['\u2018\u2019"\u201c\u201d]+/g, "").trim().toLowerCase();
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
