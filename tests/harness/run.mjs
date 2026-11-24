#!/usr/bin/env node
// The rendered checks of the theme-parity harness (QuantEcon/project-theme-parity#15, D9) for this corpus.
//
//   node tests/harness/run.mjs --dir <built site> [--base-path <path>]   serve a built site and check it
//   node tests/harness/run.mjs --url <site URL>                          check a live site
//
// It writes `rendered.csv` and `provenance.json` into --out (default `_harness/` at the repository root) and prints a
// summary. Exit 0: every check ran (failed checks are rows, not a failed run). Exit 1: a check could not run (an
// `error` row: it threw, a page did not load, or a colour scheme did not take effect); the CSV is still written.
// Exit 2: nothing was checked (a bad argument, a locator table that does not parse, a site that cannot be served).
//
// Options: --out DIR, --jobs N (default 4), --table FILE (default locators.yml), --only id,id (those features only),
// --pages stem,stem (those pages only), --no-pages (no page-wide checks), --quiet.
// HARNESS_CHROMIUM=<path> runs another Chromium build than the one Playwright installed.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { toCsv, CHECKS, RESULTS } from "./lib/csv.mjs";
import { runChecks } from "./lib/engine.mjs";
import { readTable } from "./lib/table.mjs";
import { normaliseBase, serve } from "./lib/server.mjs";
import { VIEWPORTS, PAGE_VIEWPORTS } from "./lib/util.mjs";
import theme from "./theme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const o = { jobs: 4, table: join(HERE, "locators.yml"), out: join(REPO, "_harness"), pageChecks: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--dir") o.dir = val();
    else if (a === "--base-path") o.basePath = val();
    else if (a === "--url") o.url = val();
    else if (a === "--out") o.out = resolve(val());
    else if (a === "--jobs") o.jobs = Number(val());
    else if (a === "--table") o.table = resolve(val());
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

/** A root-absolute asset URL in the built home page that is not under the base: the build was made for another base. */
async function checkBase(dir, base) {
  let html = "";
  for (const f of theme.homeFiles) { try { html = await readFile(join(dir, f), "utf8"); break; } catch {} }
  if (!html) return null;
  const urls = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
  const bad = urls.filter((u) => !u.startsWith(base) && !theme.escapesBase(u));
  return bad.length ? bad.slice(0, 3) : null;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`run.mjs: ${e.message}`); return 2; }
  if (o.help) { console.log((await readFile(fileURLToPath(import.meta.url), "utf8")).split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }

  let table;
  try { table = await readTable(o.table, theme.side); } catch (e) { console.error(`run.mjs: the locator table does not parse: ${e.message}`); return 2; }
  const pages = o.pages ?? (await theme.pages(REPO));

  let site, server = null;
  if (o.dir) {
    const base = normaliseBase(o.basePath ?? theme.basePath);
    const wrong = await checkBase(o.dir, base);
    if (wrong) { console.error(`run.mjs: ${o.dir} was not built for the base ${base}: its home page asks for ${wrong.join(", ")}`); return 2; }
    try { server = await serve(o.dir, base); } catch (e) { console.error(`run.mjs: cannot serve ${o.dir}: ${e.message}`); return 2; }
    site = { mode: "dir", dir: resolve(o.dir), base, url: server.url };
  } else {
    const u = new URL(o.url);
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    site = { mode: "url", base: u.pathname, url: u.href };
  }
  site.origin = new URL(site.url).origin;
  site.publishedBase = theme.publishedBase;

  // a site that does not answer is not a site to check
  try {
    const home = await fetch(site.url + theme.pagePath(pages[0]));
    if (!home.ok) throw new Error(`${site.url + theme.pagePath(pages[0])} answered ${home.status}`);
  } catch (e) { console.error(`run.mjs: the site does not answer: ${e.message}`); await server?.close(); return 2; }

  const started = new Date();
  let done = 0;
  const { rows, browserVersion } = await runChecks({
    theme, table, site, pages, jobs: o.jobs, only: o.only, pageChecks: o.pageChecks,
    onTask: (what, r) => { done++; if (!o.quiet) console.error(`[${done}] ${what}: ${r.map((x) => `${x.check} ${x.result}`).join(", ")}`); },
  });
  const buildInfo = await buildInfoCommit(site.url + theme.pagePath(theme.buildInfoPage));
  await server?.close();

  const require = createRequire(import.meta.url);
  const provenance = {
    schema: 1,
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
    pages,
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
  };

  await mkdir(o.out, { recursive: true });
  await writeFile(join(o.out, "rendered.csv"), toCsv(rows));
  await writeFile(join(o.out, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

  const tally = {};
  for (const r of rows) (tally[r.check] ??= {})[r.result] = ((tally[r.check] ?? {})[r.result] ?? 0) + 1;
  const lines = ["| check | " + RESULTS.join(" | ") + " |", "| --- |" + RESULTS.map(() => " ---: |").join("")];
  for (const c of CHECKS) if (tally[c]) lines.push(`| ${c} | ${RESULTS.map((r) => tally[c][r] ?? 0).join(" | ")} |`);
  const errors = rows.filter((r) => r.result === "error");
  const summary = [`${rows.length} rows written to ${join(o.out, "rendered.csv")} (${site.url}).`, "", ...lines, "",
    ...(errors.length ? [`${errors.length} check(s) could not run:`, ...errors.map((r) => `- ${r.page} ${r.family} ${r.check} ${r.viewport} ${r.scheme}: ${r.detail}`)] : ["Every check ran."])].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### Rendered checks\n\n${summary}\n`, { flag: "a" });
  return errors.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
