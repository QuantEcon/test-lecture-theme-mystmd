#!/usr/bin/env node
// The rendered checks of the theme-parity harness (QuantEcon/project-theme-parity#15, D9) for this corpus.
//
//   node tests/harness/run.mjs --dir <built site> [--base-path <path>]   serve a built site and check it
//   node tests/harness/run.mjs --url <site URL>                          check a live site
//
// It writes `rendered.csv`, `counts.csv`, `metrics.csv` and `provenance.json` into --out (default `_harness/` at the
// repository root) and prints a summary. Exit 0: every check ran and every count was taken (failed checks are rows,
// and counts and metrics are data, never a failed run). Exit 1: a check could not run (an `error` row: it threw, a
// page did not load, or a colour scheme did not take effect), or a drawn selector threw; the CSVs are still written.
// A problem with the metrics (a surface's measures or key source threw, a measure is not a value its column takes, a
// page's body text could not be read, the labels or a page's source could not be read, a page has no source, a part
// of the font fingerprint could not be read, metrics.csv could not be written, or the metrics do not tie to the
// counts) never fails or stops the run: it is a warning on the
// run in GitHub Actions, and is in provenance.json (`metrics.faults`, `metrics.not_tied`), which is always written,
// and the summary, so it never holds back what the deploy publishes. Exit 2: nothing was checked (a bad argument, a
// locator or drawn table that does not parse, a site that cannot be served).
//
// Options: --out DIR, --jobs N (default 4), --table FILE (default locators.yml), --drawn FILE (default drawn.yml),
// --no-drawn (no counts, and so no metrics: no counts.csv or metrics.csv), --no-metrics (the counts without the
// metrics: no metrics.csv), --labels FILE (the pages' labels for the key, {page: [label, …]} in YAML, in place of
// those read from lectures/<page>.md), --only id,id (those features only), --pages stem,stem (the page-wide checks,
// and so the counts and metrics, on those pages only; the behaviours still read the whole site's order), --no-pages
// (no page-wide checks, and so no counts or metrics), --quiet.
// HARNESS_CHROMIUM=<path> runs another Chromium build than the one Playwright installed.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { release } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { toCsv, toCountsCsv, toMetricsCsv, sanitiseMetricRows, CHECKS, RESULTS, SCHEMES } from "./lib/csv.mjs";
import { runChecks } from "./lib/engine.mjs";
import { KEY_KINDS, KEY_RULES, fingerprint, sourceLabels, tieOf } from "./lib/visual.mjs";
import YAML from "yaml";
import { readDrawn, readTable } from "./lib/table.mjs";
import { normaliseBase, serve } from "./lib/server.mjs";
import { VIEWPORTS, PAGE_VIEWPORTS, oneLine } from "./lib/util.mjs";
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
    else if (a === "--no-metrics") o.noMetrics = true;
    else if (a === "--labels") o.labels = resolve(val());
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
  if (o.help) {
    const lines = (await readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").slice(1);
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }

  let table, drawn = null;
  try { table = await readTable(o.table, theme.side); } catch (e) { console.error(`run.mjs: the locator table does not parse: ${e.message}`); return 2; }
  if (!o.noDrawn) {
    try { drawn = await readDrawn(o.drawn, theme.side); } catch (e) { console.error(`run.mjs: the drawn table does not parse: ${e.message}`); return 2; }
  }
  // the counts are taken in the page-wide checks' loads: none without them; the metrics with the counts, none without
  const counting = !!drawn && o.pageChecks;
  const measuring = counting && !o.noMetrics;
  const order = await theme.pages(REPO);
  const unknownPages = (o.pages ?? []).filter((p) => !order.includes(p));
  if (unknownPages.length) { console.error(`run.mjs: --pages names pages this site does not have: ${unknownPages.join(", ")}`); return 2; }
  const pages = o.pages ?? order;
  // Everything the metrics need beyond the page loads is guarded the same way: a step that fails is a problem with the
  // metrics (`runFaults`), recorded and warned of, and never a failed or stopped run, by the owner's answer on
  // QuantEcon/project-theme-parity#80. First, the labels a key may take, read only when metrics are taken: each
  // page's source labels, or the file --labels gives; unreadable, no label keys, and a `labels` problem.
  const runFaults = [];
  const runFault = (kind, why) => runFaults.push({ page: null, viewport: null, scheme: null, kind, family: null, n: null, why: oneLine(why, 300) });
  let labels = {}, labelsFrom = null, labelsMissing = [], labelsUnread = [];
  if (measuring) {
    try {
      labelsFrom = o.labels ? relative(REPO, o.labels) : "lectures/<page>.md";
      if (o.labels) labels = YAML.parse(await readFile(o.labels, "utf8")) ?? {};
      else ({ labels, missing: labelsMissing, unreadable: labelsUnread } = await sourceLabels(join(REPO, "lectures"), order));
      if (typeof labels !== "object" || Array.isArray(labels) || Object.values(labels).some((v) => !Array.isArray(v))) throw new Error("not a mapping of pages to lists of labels");
    } catch (e) { labels = {}; runFault("labels", `the labels could not be read, so no surface has a label key: ${e.message}`); }
    // a page's source that is there and cannot be read, and pages with no source (every page of both corpora has one)
    for (const u of labelsUnread) runFault("labels", `lectures/${u.page}.md could not be read, so ${u.page}'s surfaces have no label keys: ${u.why}`);
    if (labelsMissing.length) runFault("labels", `${labelsMissing.length} page(s) have no source in lectures/ (${labelsMissing.slice(0, 8).join(", ")}${labelsMissing.length > 8 ? ", …" : ""}), so their surfaces have no label keys`);
  }

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
  const { rows, counts, uncounted, metrics, faults, fonts, browserVersion } = await runChecks({
    theme, table, drawn: counting ? drawn : null, site, order, pages, jobs: o.jobs, only: o.only, pageChecks: o.pageChecks, metrics: measuring, labels,
    onTask: (what, r) => { done++; if (!o.quiet) console.error(`[${done}] ${what}: ${r.map((x) => `${x.check} ${x.result}`).join(", ")}`); },
  });
  const buildInfo = await buildInfoCommit(site.url + theme.pagePath(theme.buildInfoPage));
  await server?.close();

  const require = createRequire(import.meta.url);
  const playwright = require("@playwright/test/package.json").version;
  // the page loads' problems with the metrics, and the run's own, in one list
  const allFaults = [...runFaults, ...(faults ?? [])];
  const late = (kind, why) => { runFault(kind, why); allFaults.push(runFaults.at(-1)); };
  // the rows as the writer takes them: a value that is not one its column takes is written empty, and a problem
  let metricRows = metrics ?? [];
  if (measuring) {
    try {
      const clean = sanitiseMetricRows(metricRows);
      metricRows = clean.rows;
      for (const x of clean.problems) allFaults.push({ page: x.page, viewport: x.viewport, scheme: x.scheme, kind: "measures", family: x.family, n: x.n, why: x.why });
    } catch (e) { metricRows = []; late("writer", `the rows could not be checked, so none is written: ${e.message}`); }
  }
  // the metrics against the counts: every reading's rows number its `shown`, or the metrics are not to be trusted
  let tie = null;
  if (measuring) {
    try { tie = tieOf(counts, metricRows); }
    catch (e) { tie = { ok: false, readings: 0, surfaces: 0, off: [`the tie could not be checked: ${oneLine(e.message, 200)}`] }; }
  }
  // the environment: a failure to read it is a problem with the metrics too
  let rendered = new Set(), files = new Set(), frameFiles = new Set(), engines = () => [], installed = null, print = null;
  if (measuring) {
    try {
      rendered = new Set((fonts ?? []).flatMap((f) => f.rendered ?? []));
      files = new Set((fonts ?? []).flatMap((f) => f.files ?? []));
      frameFiles = new Set((fonts ?? []).flatMap((f) => f.frames ?? []));
      engines = (k) => [...new Set((fonts ?? []).map((f) => f.engines?.[k]).filter(Boolean))].sort();
    } catch (e) { late("fonts", `the fonts the pages read could not be gathered: ${e.message}`); }
    // fc-list missing or failing: the fingerprint has no installed fonts, and says so
    try { installed = installedFonts(); } catch (e) { late("fonts", `the installed fonts could not be listed (fc-list), so the fingerprint has none of them: ${e.message}`); }
    if (installed && !installed.lines.length) late("fonts", "fc-list listed no installed fonts, so the fingerprint has none of them");
    if (installed?.unread.length) late("fonts", `${installed.unread.length} installed font file(s) could not be read, so the fingerprint has their names, not their bytes: ${installed.unread.slice(0, 3).join("; ")}`);
    try { print = fingerprint(rendered, files, installed?.lines ?? []); } catch (e) { late("fonts", `the fonts could not be fingerprinted: ${e.message}`); }
  }
  const provenance = {
    schema: 3,
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
    // the style metrics (D19): the theme facts they read, the key's rules, the rows and how they tie to the counts,
    // and each problem with them; a reading not counted is not measured, so `drawn.uncounted` lists the readings not
    // taken for both. Null when no metrics were taken (--no-metrics, or no counts). fault_counts is set as the file is
    // written, since the writer can add a problem of its own
    metrics: measuring ? {
      file: "metrics.csv",
      content: theme.content,
      body_text: theme.bodyText,
      glyphs: theme.glyphs ?? null,
      key: KEY_RULES,
      labels: { from: labelsFrom, pages: Object.keys(labels).length, labels: Object.values(labels).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0), no_source: labelsMissing, unreadable: labelsUnread.map((u) => u.page) },
      rows: metricRows.length,
      written: null,
      readings: { taken: tie.readings, of: pages.length * PAGE_VIEWPORTS.length * SCHEMES.length },
      tied_to_counts: tie.ok,
      not_tied: tie.off,
      empty: safeEmpty(metricRows),
      fault_counts: null,
      faults: allFaults,
      crops: null,
    } : null,
    // where the checks ran (decision 5): the runner's image, the operating system, the browser build, and the fonts
    // the measured text rendered with (null without metrics)
    environment: {
      runner: {
        image_os: process.env.ImageOS ?? null, image_version: process.env.ImageVersion ?? null,
        os: process.env.RUNNER_OS ?? null, arch: process.env.RUNNER_ARCH ?? null, environment: process.env.RUNNER_ENVIRONMENT ?? null,
      },
      os_release: osRelease(),
      platform: `${process.platform} ${release()} ${process.arch}`,
      browser: { name: "chromium", build: browserVersion, playwright, executable: process.env.HARNESS_CHROMIUM ? "HARNESS_CHROMIUM" : "the build @playwright/test installed" },
      // the fingerprint is the run's union, so a run on fewer pages (--pages) has its own
      fonts: measuring ? {
        fingerprint: print,
        rendered: [...rendered].sort(),
        files: [...files].sort(),
        frame_files: [...frameFiles].sort(),
        unread: (fonts ?? []).filter((f) => f?.error).length,
        installed: installed && { command: installed.command, count: installed.lines.length, files: installed.files, unread: installed.unread.length, seconds: installed.seconds, sha256: installed.sha256 },
      } : null,
      maths: measuring ? { mathjax: engines("mathjax"), katex: engines("katex") } : null,
    },
    pages: order,
    ...(o.pages ? { page_checks_on: pages } : {}),
    viewports: Object.fromEntries(Object.entries(VIEWPORTS).map(([k, v]) => [k, `${v.width}x${v.height}`])),
    page_viewports: PAGE_VIEWPORTS,
    schemes: theme.schemeHow,
    playwright,
    browser: `chromium ${browserVersion}`,
    node: process.version,
    started: started.toISOString().replace(/\.\d+Z$/, "Z"),
    finished: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    checks: CHECKS,
    results: RESULTS,
    rows: rows.length,
    outputs: ["rendered.csv", ...(counting ? ["counts.csv"] : []), ...(measuring ? ["metrics.csv"] : [])],
  };

  await mkdir(o.out, { recursive: true });
  await writeFile(join(o.out, "rendered.csv"), toCsv(rows));
  // no counts taken, no counts.csv: one left by an earlier run would sit beside rows it does not belong to
  if (counting) await writeFile(join(o.out, "counts.csv"), toCountsCsv(counts));
  else await rm(join(o.out, "counts.csv"), { force: true });
  // the metrics: a writer that fails is a problem with the metrics, and leaves no metrics.csv; provenance.json is
  // written whatever happened to them
  let metricsWritten = false;
  if (measuring) {
    try { await writeFile(join(o.out, "metrics.csv"), toMetricsCsv(metricRows)); metricsWritten = true; }
    catch (e) { late("writer", `metrics.csv could not be written: ${e.message}`); }
  }
  if (!metricsWritten) {
    await rm(join(o.out, "metrics.csv"), { force: true }).catch(() => {});
    provenance.outputs = provenance.outputs.filter((f) => f !== "metrics.csv");
  }
  // the rows written: none where the writer failed
  if (provenance.metrics) Object.assign(provenance.metrics, { written: metricsWritten, rows: metricsWritten ? metricRows.length : 0 });
  if (provenance.metrics) provenance.metrics.fault_counts = faultCounts(allFaults);
  await writeFile(join(o.out, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

  const tally = {};
  for (const r of rows) (tally[r.check] ??= {})[r.result] = ((tally[r.check] ?? {})[r.result] ?? 0) + 1;
  const lines = ["| check | " + RESULTS.join(" | ") + " |", "| --- |" + RESULTS.map(() => " ---: |").join("")];
  for (const c of CHECKS) if (tally[c]) lines.push(`| ${c} | ${RESULTS.map((r) => tally[c][r] ?? 0).join(" | ")} |`);
  const errors = rows.filter((r) => r.result === "error");
  // a selector that threw is a harness fault, as an error row is; a page not loaded already gave its error rows
  const threw = uncounted.filter((u) => u.family);
  const countLines = counting ? countsSummary(counts, uncounted, drawn, pages) : [`No counts taken (${o.noDrawn ? "--no-drawn" : "--no-pages"}): no counts.csv.`];
  let metricLines;
  try {
    metricLines = measuring ? metricsSummary(metricRows, tie, allFaults, provenance, drawn) : [`No metrics taken (${!counting ? "no counts" : "--no-metrics"}): no metrics.csv.`];
  } catch (e) { metricLines = [`metrics.csv: ${metricRows.length} rows; ${allFaults.length} problem(s) with the metrics; the summary could not be made (${oneLine(e.message, 200)})`]; }
  const summary = [`${rows.length} rows written to ${join(o.out, "rendered.csv")} (${site.url}).`, "", ...lines, "",
    ...(errors.length ? [`${errors.length} check(s) could not run:`, ...errors.map((r) => `- ${r.page} ${r.family} ${r.check} ${r.viewport} ${r.scheme}: ${r.detail}`)] : ["Every check ran."]),
    "", ...countLines,
    ...(threw.length ? [`${threw.length} count(s) could not be taken, the selector threw:`, ...threw.map((u) => `- ${u.page} ${u.family} ${u.viewport} ${u.scheme}: ${u.why}`)] : []),
    "", ...metricLines].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### Rendered checks\n\n${summary}\n`, { flag: "a" });
  // the counts, as the run's annotation: what CI read, readable without the artefact
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::notice title=Drawn counts::${escape(countLines.join("\n").slice(0, 4000))}`);
  // the metrics, likewise
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::notice title=Style metrics::${escape(metricLines.join("\n").slice(0, 4000))}`);
  // the metrics' problems, as a warning on the run: they never fail it (QuantEcon/project-theme-parity#80, the
  // owner's answer on 2026-11-28), so a problem with the metrics never withholds /_harness/, counts.csv included
  const problems = measuring ? allFaults.length + (tie.ok ? 0 : tie.off.length) : 0;
  if (process.env.GITHUB_ACTIONS === "true" && problems) console.log(`::warning title=Style metrics problems::${escape([`${problems} problem(s) with the metrics:`, ...(tie.ok ? [] : [`${tie.off.length} reading(s) do not tie to counts.csv: ${tie.off.slice(0, 12).join("; ")}`]), ...allFaults.slice(0, 20).map(faultWords)].join("\n").slice(0, 4000))}`);
  return errors.length || threw.length ? 1 : 0;
}

/** A problem with the metrics, in words. */
const faultWords = (x) => `${x.kind}: ${x.page ? `${x.page} ${x.family ?? "(body text)"} ${x.viewport} ${x.scheme}${x.n ? ` n ${x.n}` : ""}` : "(the run)"}: ${x.why}`;

/** emptyOf, or nothing where it cannot be counted. */
function safeEmpty(rows) {
  try { return emptyOf(rows); } catch { return null; }
}

/** How many metrics problems of each kind. */
function faultCounts(faults) {
  const out = { measures: 0, key: 0, "body text": 0, labels: 0, fonts: 0, writer: 0 };
  for (const f of faults) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}

/** How many rows have each measure empty: no key (pairing by `n`), no visible text, an inline box, no body text. */
function emptyOf(metrics) {
  return {
    key: metrics.filter((m) => m.key === "").length,
    text: metrics.filter((m) => m.text === "").length,
    overflow: metrics.filter((m) => m.overflow === "").length,
    body_text: metrics.filter((m) => m.body_font_size === "").length,
    measures: metrics.filter((m) => m.width === "").length,
  };
}

/**
 * What metrics.csv holds, for the summary and the run's notice: its rows and readings, how they tie to counts.csv,
 * the keys by kind, the empty values, the measures that threw, and the environment the fonts were read in.
 */
function metricsSummary(metrics, tie, faults, provenance, drawn) {
  const kinds = KEY_KINDS.map((k) => `${k} ${metrics.filter((m) => m.key.startsWith(`${k}:`)).length}`);
  const e = emptyOf(metrics);
  const families = new Set(metrics.map((m) => m.family)).size;
  const noBody = [...new Set(metrics.filter((m) => m.body_font_size === "").map((m) => `${m.page} ${m.viewport} ${m.scheme}`))];
  const env = provenance.environment, f = env.fonts ?? { fingerprint: "", rendered: [], files: [], frame_files: [], unread: 0, installed: null };
  return [
    `metrics.csv: ${metrics.length} rows over ${tie.readings} of ${provenance.metrics.readings.of} readings (${provenance.metrics.readings.of / (PAGE_VIEWPORTS.length * SCHEMES.length)} pages × ${PAGE_VIEWPORTS.length * SCHEMES.length}), ${families} of the ${drawn.counted.length} counted families with a shown surface; `
      + (tie.ok ? `every reading's rows number its shown in counts.csv (${tie.surfaces} surfaces).` : `${tie.off.length} reading(s) do not tie to counts.csv's shown: ${tie.off.slice(0, 6).join("; ")}${tie.off.length > 6 ? "; …" : ""}`),
    `Keys: ${kinds.join(", ")}; none, so paired by n: ${e.key}.`,
    `Empty values: text ${e.text} (no visible text), overflow ${e.overflow} (an inline box), body text ${e.body_text}${noBody.length ? ` (${noBody.slice(0, 6).join("; ")}${noBody.length > 6 ? "; …" : ""})` : ""}, every measure ${e.measures}.`,
    faults.length ? `Metrics problems: ${faults.length} (${Object.entries(faultCounts(faults)).filter(([k, n]) => n || ["measures", "key", "body text"].includes(k)).map(([k, n]) => `${k} ${n}`).join(", ")}): ${faults.slice(0, 6).map(faultWords).join("; ")}${faults.length > 6 ? "; …" : ""}` : "Metrics problems: none (every surface measured and keyed, every body text read).",
    `Environment: ${env.runner.image_os ?? "no runner image"} ${env.runner.image_version ?? ""}`.trimEnd() + `${env.os_release ? `, ${env.os_release}` : ""}, chromium ${env.browser.build}${env.maths.mathjax.length ? `, MathJax ${env.maths.mathjax.join(", ")}` : ""}${env.maths.katex.length ? `, KaTeX ${env.maths.katex.join(", ")}` : ""}; fonts ${String(f.fingerprint ?? "").slice(0, 12) || "unread"} (${f.rendered.length} rendered, ${f.files.length} font files in the main frames${f.frame_files.length ? `, ${f.frame_files.length} in frames, not fingerprinted` : ""}${f.unread ? `, ${f.unread} reading(s) unread` : ""}${f.installed ? `; installed ${f.installed.count} in ${f.installed.files} files, hashed in ${f.installed.seconds} s, ${f.installed.sha256.slice(0, 12)}` : "; no installed fonts listed"}).`,
    `Web fonts rendered: ${[...new Set(f.rendered.filter((x) => x.endsWith(", web")).map((x) => x.replace(/ \(.*$/, "")))].join(", ") || "none"}.`,
  ];
}

/** The operating system's name, from /etc/os-release, or null where there is none. */
function osRelease() {
  try { return /^PRETTY_NAME="?([^"\n]*)"?$/m.exec(readFileSync("/etc/os-release", "utf8"))?.[1] ?? null; } catch { return null; }
}

/**
 * The fonts installed for Chromium to fall back on: fontconfig's list, each font's family, style, version and file,
 * with the SHA-256 of the file's bytes (each file read once), so a new version of a font, or new bytes under the same
 * name, shows; `unread`, the files that could not be read, listed without a hash. Throws where fc-list cannot be run
 * or fails. Its lines go into the fingerprint.
 */
function installedFonts() {
  const started = Date.now();
  const command = ["--format", "%{file}\\t%{family}\\t%{style}\\t%{fontversion}\\n"];
  const out = execFileSync("fc-list", command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  const hashes = new Map(), unread = [];
  const hashOf = (file) => {
    if (!hashes.has(file)) {
      let h = null;
      try { h = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12); } catch (e) { unread.push(`${file}: ${e.code ?? e.message}`); }
      hashes.set(file, h);
    }
    return hashes.get(file);
  };
  const lines = [...new Set(out.split("\n").map((l) => l.trim()).filter(Boolean))].sort().map((l) => {
    const [file, ...rest] = l.split("\t");
    const h = file ? hashOf(file) : null;
    return `${[...rest, file].join("\t")}${h ? ` sha256:${h}` : ""}`;
  });
  return {
    command: `fc-list ${command.join(" ")}, and each file's bytes`, lines, files: hashes.size, unread, seconds: Math.round((Date.now() - started) / 100) / 10,
    sha256: createHash("sha256").update(lines.join("\n"), "utf8").digest("hex"),
  };
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
