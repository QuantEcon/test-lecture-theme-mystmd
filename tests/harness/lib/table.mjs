// Read and check a locator table (locators.yml) and a drawn table (drawn.yml). A table that does not parse, or breaks
// a rule below, stops the run before anything is checked.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { VIEWPORT_NAMES } from "./csv.mjs";

const ENTRY = new Set(["id", "name", "page", "viewport", "locator", "behaviour", "corrected"]);
const SOURCE = new Set(["repository", "path", "commit", "side"]);

function isLocator(v) {
  if (v === null || (typeof v === "string" && v.trim())) return true;
  return typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0
    && Object.values(v).every((s) => typeof s === "string" && s.trim());
}

/** The table's `source:` block, checked: where it was copied from, at which commit, for which side. */
function sourceOf(doc, side, bad) {
  if (!doc || typeof doc !== "object") bad("not a mapping");
  const src = doc.source;
  if (!src || typeof src !== "object" || [...SOURCE].some((k) => !src[k])) bad(`\`source\` needs ${[...SOURCE].join(", ")}`);
  if (Object.keys(src).some((k) => !SOURCE.has(k))) bad(`unknown key in \`source\`: ${Object.keys(src).filter((k) => !SOURCE.has(k)).join(", ")}`);
  if (src.side !== side) bad(`the table is the ${src.side} side, and this is the ${side} site`);
  if (!/^[0-9a-f]{40}$/.test(String(src.commit))) bad("`source.commit` must be a full commit hash");
  return src;
}

/** A `corrected:` note, {from: as copied, why: what moved}, checked. */
function correctionOf(id, c, to, bad) {
  if (!c || typeof c !== "object" || !("from" in c) || typeof c.why !== "string" || !c.why || Object.keys(c).some((k) => !["from", "why"].includes(k))) {
    bad(`${id}: \`corrected\` is {from: as copied, why: what moved}`);
  }
  return { id, from: c.from, to, why: c.why };
}

export async function readTable(path, side) {
  const doc = YAML.parse(await readFile(path, "utf8"), { uniqueKeys: true });
  const bad = (why) => { throw new Error(`${path}: ${why}`); };
  const src = sourceOf(doc, side, bad);
  if (!Array.isArray(doc.features) || !doc.features.length) bad("`features` must be a non-empty list");
  const seen = new Set();
  const corrections = [];
  for (const f of doc.features) {
    const id = f?.id ?? "(no id)";
    if (!f || typeof f !== "object") bad("an entry must be a mapping");
    const unknown = Object.keys(f).filter((k) => !ENTRY.has(k));
    if (unknown.length) bad(`${id}: unknown key(s) ${unknown.join(", ")}`);
    for (const k of ["id", "name", "page", "viewport"]) if (typeof f[k] !== "string" || !f[k]) bad(`${id}: \`${k}\` must be text`);
    if (!("locator" in f)) bad(`${id}: no \`locator\` (write null for none)`);
    if (seen.has(f.id)) bad(`${id}: a second entry with this id`);
    seen.add(f.id);
    if (!VIEWPORT_NAMES.includes(f.viewport)) bad(`${id}: viewport "${f.viewport}" is not one of ${VIEWPORT_NAMES.join(", ")}`);
    if (!isLocator(f.locator)) bad(`${id}: a locator is a selector, a mapping of named parts to selectors, or null`);
    if ("behaviour" in f && (typeof f.behaviour !== "string" || !f.behaviour)) bad(`${id}: \`behaviour\` must be text`);
    if ("corrected" in f) corrections.push(correctionOf(f.id, f.corrected, f.locator, bad));
  }
  return { source: src, features: doc.features, corrections };
}

// The drawn table (D18): bin/drawn.yml's side for this theme, `each` expanded, written by that repository's
// bin/copy-locators --table drawn. Each entry is {id, selector, why?, corrected?}; a selector is a Playwright
// selector, {select, in?, text}, or null with a `why` from the seven.
const DRAWN_ENTRY = new Set(["id", "selector", "why", "corrected"]);
const SPEC = new Set(["select", "in", "text"]);
export const WHYS = ["invisible", "inline-maths", "report", "styling", "anchor", "no-surface", "text"];

function isSelector(v) {
  if (typeof v === "string") return !!v.trim();
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !SPEC.has(k))) return false;
  const text = (k) => typeof v[k] === "string" && !!v[k].trim();
  return text("select") && text("text") && (!("in" in v) || text("in"));
}

/**
 * { source, families, counted, notCounted, corrections }: `families` every entry in the table's order, `counted`
 * those with a selector, `notCounted` how many are null, by `why`.
 */
export async function readDrawn(path, side) {
  const doc = YAML.parse(await readFile(path, "utf8"), { uniqueKeys: true });
  const bad = (why) => { throw new Error(`${path}: ${why}`); };
  const src = sourceOf(doc, side, bad);
  if (!Array.isArray(doc.families) || !doc.families.length) bad("`families` must be a non-empty list");
  const seen = new Set();
  const corrections = [];
  const notCounted = {};
  for (const f of doc.families) {
    if (!f || typeof f !== "object") bad("an entry must be a mapping");
    const id = f.id ?? "(no id)";
    const unknown = Object.keys(f).filter((k) => !DRAWN_ENTRY.has(k));
    if (unknown.length) bad(`${id}: unknown key(s) ${unknown.join(", ")}`);
    if (typeof f.id !== "string" || !f.id) bad(`${id}: \`id\` must be text`);
    if (seen.has(f.id)) bad(`${id}: a second entry with this id`);
    seen.add(f.id);
    if (!("selector" in f)) bad(`${id}: no \`selector\` (write null, with a \`why\`, for none)`);
    if (f.selector === null) {
      if (!WHYS.includes(f.why)) bad(`${id}: a null selector needs a \`why\`, one of ${WHYS.join(", ")}`);
      notCounted[f.why] = (notCounted[f.why] ?? 0) + 1;
    } else {
      if (!isSelector(f.selector)) bad(`${id}: a selector is a Playwright selector, {select, in, text} (\`in\` optional), or null`);
      if ("why" in f) bad(`${id}: \`why\` goes only with a null selector`);
      if (typeof f.selector === "object") {
        try { new RegExp(f.selector.text, "u"); } catch (e) { bad(`${id}: \`text\` does not compile: ${e.message}`); }
      }
    }
    if ("corrected" in f) corrections.push(correctionOf(f.id, f.corrected, f.selector, bad));
  }
  return { source: src, families: doc.families, counted: doc.families.filter((f) => f.selector !== null), notCounted, corrections };
}
