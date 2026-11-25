// rendered.csv: the columns, the closed vocabularies, and a writer and reader (RFC 4180).
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd: the two
// corpora publish one schema, so QuantEcon/project-theme-parity can join their rows on
// (page, family, check, viewport, scheme).

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

export function parseCsv(text) {
  const records = [];
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
      records.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); records.push(row); }
  const [head, ...body] = records.filter((r) => !(r.length === 1 && r[0] === ""));
  if (!head || head.join(",") !== COLUMNS.join(",")) throw new Error(`not a rendered.csv: the header is "${(head || []).join(",")}"`);
  return body.map((r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i] ?? ""])));
}

// The row's key: the two corpora's rows join on it.
export const keyOf = (r) => [r.page, r.family, r.check, r.viewport, r.scheme].join("|");
