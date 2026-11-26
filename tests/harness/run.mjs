#!/usr/bin/env node
// The rendered checks of the theme-parity harness (QuantEcon/project-theme-parity#15, D9) for this corpus.
//
//   node tests/harness/run.mjs --dir <built site> [--base-path <path>]   serve a built site and check it
//   node tests/harness/run.mjs --url <site URL>                          check a live site
//
// It writes `rendered.csv`, `counts.csv` and `provenance.json` into --out (default `_harness/` at the repository root)
// and prints a summary. Exit 0: every check ran and every count was taken (failed checks are rows and counts are
// data, never a failed run). Exit 1: a check could not run (an `error` row: it threw, a page did not load, or a
// colour scheme did not take effect), or a drawn selector threw; the CSVs are still written. Exit 2: nothing was
// checked (a bad argument, a locator or drawn table that does not parse, a site that cannot be served).
//
// Options: --out DIR, --jobs N (default 4), --table FILE (default locators.yml), --drawn FILE (default drawn.yml),
// --no-drawn (no counts, no counts.csv), --only id,id (those features only), --pages stem,stem (the page-wide checks,
// and so the counts, on those pages only; the behaviours still read the whole site's order), --no-pages (no page-wide
// checks, and so no counts), --quiet.
// HARNESS_CHROMIUM=<path> runs another Chromium build than the one Playwright installed.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { toCsv, toCountsCsv, CHECKS, RESULTS, SCHEMES } from "./lib/csv.mjs";
import { runChecks } from "./lib/engine.mjs";
import { readDrawn, readTable } from "./lib/table.mjs";
import { normaliseBase, serve } from "./lib/server.mjs";
import { VIEWPORTS, PAGE_VIEWPORTS } from "./lib/util.mjs";
import theme from "./theme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const o = { jobs: 4, table: join(HERE, "locators.yml"), drawn: join(HERE, "drawn.yml"), out: join(REPO, "_harness"), pageChecks: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--dir") o.dir = val();
    else if (a === "--base-path") o.basePath = val();
    else if (a === "--url") o.url = val();
    else if (a === "--out") o.out = resolve(val());
    else if (a === "--jobs") o.jobs = Number(val());
    else if (a === "--table") o.table = resolve(val());
    else if (a === "--drawn") o.drawn = resolve(val());
    else if (a === "--no-drawn") o.noDrawn = true;
    else if (a === "--only") o.only = new Set(val().split(",").filter(Boolean));
    else if (a === "--pages") o.pages = val().split(",").filter(Boolean);
    else if (a === "--no-pages") o.pageChecks = false;
    else if (a === "--quiet") o.quiet = true;
    else if (a === "-h" || a === "--help") { o.help = true; }
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.help) return o;
  if (!!o.dir === !!o.url) throw new Error("give one of --dir <built site> or --url <site URL>");
  if (o.url && o.basePath) throw new Error("--base-path goes with --dir: a live site's path is in its URL");
  if (!(o.jobs >= 1)) throw new Error("--jobs must be 1 or more");
  if (o.noDrawn && argv.includes("--drawn")) throw new Error("--drawn and --no-drawn: give one");
  return o;
}

function git(...args) {
  try { return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
}

/** The build's own record of what built it: the repository commit its build_info page prints. */
async function buildInfoCommit(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return { url, status: r.status };
    const text = (await r.text()).replace(/<[^>]+>/g, " ");
    const m = text.match(/\bcommit\s+([0-9a-f]{7,40})\s+\((\d{4}-\d{2}-\d{2})\)/);
    return { url, status: r.status, commit: m?.[1] ?? null, date: m?.[2] ?? null };
  } catch (e) { return { url, error: String(e.message ?? e) }; }
}

/**
 * Was the build made for this base? Its home page's canonical link names the path the build puts it at, and its
 * root-absolute asset URLs must lie under the base. A reason when not, else null.
 */
async function checkBase(dir, base, first) {
  let html = "";
  for (const f of theme.homeFiles) { try { html = await readFile(join(dir, f), "utf8"); break; } catch {} }
  if (!html) return `it has no home page (${theme.homeFiles.join(", ")})`;
  const norm = (p) => p.replace(/index\.html$/, "").replace(/\/+$/, "") || "/";
  const canonical = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).find((t) => /\brel=["']canonical["']/.test(t))?.match(/\bhref=["']([^"']+)["']/)?.[1];
  if (canonical) {
    const at = norm(new URL(canonical, "https://x.invalid/").pathname), want = norm(base + theme.pagePath(first));
    if (at !== want) return `its home page's canonical link (${canonical}) puts it at ${at}, not ${want}`;
  }
  const urls = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
  const bad = urls.filter((u) => !u.startsWith(base) && !theme.escapesBase(u));
  return bad.length ? `its home page asks for ${bad.slice(0, 3).join(", ")}, outside it` : null;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`run.mjs: ${e.message}`); return 2; }
  if (o.help) { console.log((await readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").slice(1, 17).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }

  let table, drawn = null;
  try { table = await readTable(o.table, theme.side); } catch (e) { console.error(`run.mjs: the locator table does not parse: ${e.message}`); return 2; }
  if (!o.noDrawn) {
    try { drawn = await readDrawn(o.drawn, theme.side); } catch (e) { console.error(`run.mjs: the drawn table does not parse: ${e.message}`); return 2; }
  }
  // the counts are taken in the page-wide checks' loads: none without them
  const counting = !!drawn && o.pageChecks;
  const order = await theme.pages(REPO);
  const unknownPages = (o.pages ?? []).filter((p) => !order.includes(p));
  if (unknownPages.length) { console.error(`run.mjs: --pages names pages this site does not have: ${unknownPages.join(", ")}`); return 2; }
  const pages = o.pages ?? order;

  let site, server = null;
  if (o.dir) {
    const base = normaliseBase(o.basePath ?? theme.basePath);
    const wrong = await checkBase(o.dir, base, order[0]);
    if (wrong) { console.error(`run.mjs: ${o.dir} was not built for the base ${base}: ${wrong}`); return 2; }
    try { server = await serve(o.dir, base); } catch (e) { console.error(`run.mjs: cannot serve ${o.dir}: ${e.message}`); return 2; }
    site = { mode: "dir", dir: resolve(o.dir), base, url: server.url };
  } else {
    const u = new URL(o.url);
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    site = { mode: "url", base: u.pathname, url: u.href };
  }
  site.origin = new URL(site.url).origin;
  // the page's own address, for page-meta: the published site's origin, with the base this build is served at (a
  // mystmd pull request's build is made for /, and its canonical links say so)
  site.publishedBase = new URL(site.base, theme.publishedBase).href;

  // a site that does not answer is not a site to check
  try {
    const home = await fetch(site.url + theme.pagePath(order[0]));
    if (!home.ok) throw new Error(`${site.url + theme.pagePath(order[0])} answered ${home.status}`);
  } catch (e) { console.error(`run.mjs: the site does not answer: ${e.message}`); await server?.close(); return 2; }

  const started = new Date();
  let done = 0;
  const { rows, counts, uncounted, browserVersion } = await runChecks({
    theme, table, drawn: counting ? drawn : null, site, order, pages, jobs: o.jobs, only: o.only, pageChecks: o.pageChecks,
    onTask: (what, r) => { done++; if (!o.quiet) console.error(`[${done}] ${what}: ${r.map((x) => `${x.check} ${x.result}`).join(", ")}`); },
  });
  const buildInfo = await buildInfoCommit(site.url + theme.pagePath(theme.buildInfoPage));
  await server?.close();

  const require = createRequire(import.meta.url);
  const provenance = {
    schema: 2,
    repository: process.env.GITHUB_REPOSITORY ?? theme.repository,
    commit: process.env.HARNESS_HEAD_SHA || git("rev-parse", "HEAD"),
    checkout: process.env.GITHUB_SHA ?? git("rev-parse", "HEAD"),
    ref: process.env.GITHUB_REF ?? git("rev-parse", "--abbrev-ref", "HEAD"),
    workflow_run: process.env.GITHUB_RUN_ID ? {
      id: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
      event: process.env.GITHUB_EVENT_NAME ?? null, workflow: process.env.GITHUB_WORKFLOW ?? null,
      url: `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    } : null,
    site: {
      mode: site.mode,
      read: site.mode === "dir" ? `a built directory, served at ${site.base} by tests/harness/lib/server.mjs` : site.url,
      base_path: site.base,
      ...(site.mode === "dir" ? { base_path_why: theme.baseWhy(site.base) } : {}),
      build_info: buildInfo,
    },
    locators: { file: relative(REPO, o.table), copied_from: table.source, corrections: table.corrections },
    // the drawn counts (D18): the table, its source and corrections, what it counts, and each reading not taken; null
    // when no counts were taken (--no-drawn, or --no-pages)
    drawn: counting ? {
      file: relative(REPO, o.drawn),
      copied_from: drawn.source,
      corrections: drawn.corrections,
      families: drawn.counted.length,
      not_counted: drawn.notCounted,
      rows: counts.length,
      uncounted,
    } : null,
    pages: order,
    ...(o.pages ? { page_checks_on: pages } : {}),
    viewports: Object.fromEntries(Object.entries(VIEWPORTS).map(([k, v]) => [k, `${v.width}x${v.height}`])),
    page_viewports: PAGE_VIEWPORTS,
    schemes: theme.schemeHow,
    playwright: require("@playwright/test/package.json").version,
    browser: `chromium ${browserVersion}`,
    node: process.version,
    started: started.toISOString().replace(/\.\d+Z$/, "Z"),
    finished: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    checks: CHECKS,
    results: RESULTS,
    rows: rows.length,
    outputs: counting ? ["rendered.csv", "counts.csv"] : ["rendered.csv"],
  };

  await mkdir(o.out, { recursive: true });
  await writeFile(join(o.out, "rendered.csv"), toCsv(rows));
  // no counts taken, no counts.csv: one left by an earlier run would sit beside rows it does not belong to
  if (counting) await writeFile(join(o.out, "counts.csv"), toCountsCsv(counts));
  else await rm(join(o.out, "counts.csv"), { force: true });
  await writeFile(join(o.out, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

  const tally = {};
  for (const r of rows) (tally[r.check] ??= {})[r.result] = ((tally[r.check] ?? {})[r.result] ?? 0) + 1;
  const lines = ["| check | " + RESULTS.join(" | ") + " |", "| --- |" + RESULTS.map(() => " ---: |").join("")];
  for (const c of CHECKS) if (tally[c]) lines.push(`| ${c} | ${RESULTS.map((r) => tally[c][r] ?? 0).join(" | ")} |`);
  const errors = rows.filter((r) => r.result === "error");
  // a selector that threw is a harness fault, as an error row is; a page not loaded already gave its error rows
  const threw = uncounted.filter((u) => u.family);
  const countLines = counting ? countsSummary(counts, uncounted, drawn, pages) : [`No counts taken (${o.noDrawn ? "--no-drawn" : "--no-pages"}): no counts.csv.`];
  const summary = [`${rows.length} rows written to ${join(o.out, "rendered.csv")} (${site.url}).`, "", ...lines, "",
    ...(errors.length ? [`${errors.length} check(s) could not run:`, ...errors.map((r) => `- ${r.page} ${r.family} ${r.check} ${r.viewport} ${r.scheme}: ${r.detail}`)] : ["Every check ran."]),
    "", ...countLines,
    ...(threw.length ? [`${threw.length} count(s) could not be taken, the selector threw:`, ...threw.map((u) => `- ${u.page} ${u.family} ${u.viewport} ${u.scheme}: ${u.why}`)] : [])].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### Rendered checks\n\n${summary}\n`, { flag: "a" });
  // the counts, as the run's annotation: what CI read, readable without the artefact
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::notice title=Drawn counts::${escape(countLines.join("\n").slice(0, 4000))}`);
  return errors.length || threw.length ? 1 : 0;
}

/** A workflow command's message: GitHub reads `%`, CR and LF escaped. */
const escape = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/**
 * What counts.csv holds, for the summary and the run's notice: its rows, the families counted and not, the empty
 * counts, the families whose count differs between a page's readings, and each family's drawn total over the pages
 * at desktop in light.
 */
function countsSummary(counts, uncounted, drawn, pages) {
  const why = Object.entries(drawn.notCounted).map(([k, n]) => `${k} ${n}`).join(", ");
  const empty = counts.filter((c) => c.drawn === "");
  const byPage = new Map();
  for (const c of counts) if (c.drawn !== "") { const k = `${c.page} ${c.family}`; (byPage.get(k) ?? byPage.set(k, new Set()).get(k)).add(`${c.drawn}/${c.shown}`); }
  const varying = [...byPage].filter(([, v]) => v.size > 1).map(([k, v]) => `${k} (${[...v].join(", ")})`);
  const totals = drawn.counted.map((f) => {
    const at = counts.filter((c) => c.family === f.id && c.viewport === "desktop" && c.scheme === "light" && c.drawn !== "");
    return `${f.id} ${at.reduce((n, c) => n + c.drawn, 0)}/${at.reduce((n, c) => n + c.shown, 0)}`;
  });
  const where = (u) => `${u.page} ${u.viewport} ${u.scheme}${u.family ? ` ${u.family}` : ""}: ${u.why}`;
  return [
    `counts.csv: ${counts.length} rows: ${pages.length} pages × ${PAGE_VIEWPORTS.length * SCHEMES.length} readings × ${drawn.counted.length} families counted (${drawn.families.length - drawn.counted.length} not counted: ${why || "none"}); table ${drawn.source.path}@${drawn.source.commit.slice(0, 7)}, ${drawn.source.side} side${drawn.corrections.length ? `, ${drawn.corrections.length} correction(s)` : ""}.`,
    empty.length ? `Empty counts: ${empty.length}, from ${uncounted.length} reading(s) not taken: ${uncounted.slice(0, 8).map(where).join("; ")}${uncounted.length > 8 ? "; …" : ""}` : "Empty counts: none.",
    varying.length ? `Counts that differ between a page's readings: ${varying.length}: ${varying.slice(0, 12).join("; ")}${varying.length > 12 ? "; …" : ""}` : "Every page's counts agree at all its readings.",
    `Drawn/shown over the pages at desktop in light: ${totals.join(", ")}.`,
  ];
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
