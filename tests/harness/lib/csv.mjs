// rendered.csv and counts.csv: the columns, the closed vocabularies, and a writer and reader for each (RFC 4180).
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd: the two
// corpora publish one schema, so QuantEcon/project-theme-parity can join their rows on
// (page, family, check, viewport, scheme), and set each corpus's counts beside its own engine's (D18).
import { PAGE_VIEWPORTS } from "./util.mjs";

export const COLUMNS = ["page", "family", "check", "viewport", "scheme", "result", "detail"];

// What a row checked. `present` and `behaviour` are a site feature's checks (family = the feature id); the other
// three are page-wide, run on every page at three viewports (family = `page`).
export const CHECKS = ["present", "behaviour", "error-marker", "console", "overflow"];

// What the check found. Closed: anything else is a bug in the harness.
//   pass    the check ran and held; for `present`, the locator matched (how many of its matches are shown is in
//           `detail`: a head element is never shown, and a control may show only on hover or scroll)
//   fail    the check ran and did not hold: a behaviour failed (a control it must operate not shown or not pressable
//           included), or a marker, console message or overflow was found
//   absent  `present` only: the locator matched nothing
//   none    no locator: this site has no counterpart (`null` in the locator table); on `present` and `behaviour`
//   skip    the check ran but could not decide; `detail` says why, and what a person has to look at instead
//   error   the check could not run: it threw unexpectedly, the page did not load, or the colour scheme did not take
//           effect. The run writes the row, and then exits 1, so the job fails
export const RESULTS = ["pass", "fail", "absent", "none", "skip", "error"];

export const VIEWPORT_NAMES = ["desktop", "wide", "tablet", "phone"];
export const SCHEMES = ["light", "dark"];

function field(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    for (const k of ["check", "result", "scheme", "viewport"]) {
      const allowed = { check: CHECKS, result: RESULTS, scheme: SCHEMES, viewport: VIEWPORT_NAMES }[k];
      if (!allowed.includes(r[k])) throw new Error(`rendered.csv: ${k} "${r[k]}" is not one of ${allowed.join(", ")}`);
    }
    lines.push(COLUMNS.map((c) => field(r[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

/** The records of a CSV text: each a list of fields, blank lines left out. */
function records(text) {
  const out = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      out.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => !(r.length === 1 && r[0] === ""));
}

function parseWith(text, columns, what) {
  const [head, ...body] = records(text);
  if (!head || head.join(",") !== columns.join(",")) throw new Error(`not a ${what}: the header is "${(head || []).join(",")}"`);
  return body.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
}

export function parseCsv(text) {
  return parseWith(text, COLUMNS, "rendered.csv");
}

// The row's key: the two corpora's rows join on it.
export const keyOf = (r) => [r.page, r.family, r.check, r.viewport, r.scheme].join("|");

// counts.csv: how many times this site's theme drew each family on each page (D18), at the page-wide checks' six
// readings. One row for every page checked, every family the drawn table gives this side a selector, every viewport
// and every scheme, zeros included: a zero is a measurement, and a missing row an input error.
//   drawn   how many elements the family's selector matches in the settled DOM, shown or not: an integer of 0 or
//           more, or empty when the count could not be taken (the page did not load, the scheme did not take
//           effect, or the selector threw)
//   shown   how many of those are visible on load, by the test `present` counts with (util.mjs): an integer from 0 to
//           `drawn`, empty exactly when `drawn` is
export const COUNT_COLUMNS = ["page", "family", "viewport", "scheme", "drawn", "shown"];

const count = (v) => v === "" || v == null ? "" : String(v);

export function toCountsCsv(rows) {
  const lines = [COUNT_COLUMNS.join(",")];
  for (const r of rows) {
    if (!PAGE_VIEWPORTS.includes(r.viewport)) throw new Error(`counts.csv: viewport "${r.viewport}" is not one of ${PAGE_VIEWPORTS.join(", ")}`);
    if (!SCHEMES.includes(r.scheme)) throw new Error(`counts.csv: scheme "${r.scheme}" is not one of ${SCHEMES.join(", ")}`);
    const drawn = count(r.drawn), shown = count(r.shown);
    const ok = drawn === "" ? shown === "" : /^\d+$/.test(drawn) && /^\d+$/.test(shown) && Number(shown) <= Number(drawn);
    if (!ok) throw new Error(`counts.csv: ${r.page} ${r.family} ${r.viewport} ${r.scheme}: drawn "${drawn}" and shown "${shown}" are not two counts, shown at most drawn, or both empty`);
    lines.push(COUNT_COLUMNS.map((c) => field(c === "drawn" ? drawn : c === "shown" ? shown : r[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function parseCountsCsv(text) {
  return parseWith(text, COUNT_COLUMNS, "counts.csv");
}

// A count's key: the reading of one family on one page.
export const countKeyOf = (r) => [r.page, r.family, r.viewport, r.scheme].join("|");
