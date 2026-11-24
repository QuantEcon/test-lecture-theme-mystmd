// Read and check a locator table (locators.yml). A table that does not parse, or breaks a rule below, stops the run
// before anything is checked.
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

export async function readTable(path, side) {
  const doc = YAML.parse(await readFile(path, "utf8"), { uniqueKeys: true });
  const bad = (why) => { throw new Error(`${path}: ${why}`); };
  if (!doc || typeof doc !== "object") bad("not a mapping");
  const src = doc.source;
  if (!src || typeof src !== "object" || [...SOURCE].some((k) => !src[k])) bad(`\`source\` needs ${[...SOURCE].join(", ")}`);
  if (Object.keys(src).some((k) => !SOURCE.has(k))) bad(`unknown key in \`source\`: ${Object.keys(src).filter((k) => !SOURCE.has(k)).join(", ")}`);
  if (src.side !== side) bad(`the table is the ${src.side} side, and this is the ${side} site`);
  if (!/^[0-9a-f]{40}$/.test(String(src.commit))) bad("`source.commit` must be a full commit hash");
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
    if ("corrected" in f) {
      const c = f.corrected;
      if (!c || typeof c !== "object" || !("from" in c) || typeof c.why !== "string" || !c.why || Object.keys(c).some((k) => !["from", "why"].includes(k))) {
        bad(`${id}: \`corrected\` is {from: the locator as copied, why: what moved}`);
      }
      corrections.push({ id: f.id, from: c.from, to: f.locator, why: c.why });
    }
  }
  return { source: src, features: doc.features, corrections };
}
