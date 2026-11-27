#!/usr/bin/env node
// The self-test: the harness run on two fixture sites whose rows are known, before it is run on the real one.
//
//   node tests/harness/selftest/run.mjs        (npm run selftest)
//
// good/ and bad/ are small static sites in this theme's markup. Each is built twice, for this site's base path and
// for `/`, the base a mystmd pull request's build is made for: copied with every `{{base}}` replaced by the base, as
// a build writes its base into its canonical links, and served at that base. So every check that reads the base
// (page-meta above all) is read at both. Each build is checked with locators.yml, the format of ../locators.yml,
// through the same engine and theme.mjs as the real run, on the pages intro, typography, code_cells, long_cells and
// math, and its rows are compared with expected-<site>.csv, the same rows at both bases: every row must be there
// with the same result, and where an expected row has a detail, the actual detail must contain it (an empty detail
// matches any). Between them the two sites give every check type a passing and a failing row, and every result: a
// working toggle and a broken one, a copy button that copies and one that copies nothing, a clipboard the harness
// cannot prime (`skip`), a page's canonical link and social cards right and wrong, error markers (MathJax's and
// mystmd's maths errors, an undefined macro, maths left as raw TeX, the "Unknown Directive" text), a console error
// and a hydration warning, an overflowing page, a null locator (`none`), a locator that matches nothing (`absent`), a
// check that could not decide (`skip`), a behaviour that throws, a feature at the `wide` viewport, and `error` rows
// for a page that is missing and for a page whose colour scheme does not take effect. Then run.mjs itself is run on
// each build of the good site, with page-meta: served at the base it was built for, page-meta must pass, so run.mjs's
// own reading of the base is checked, not only this file's; at the other base, its build-base check stops it with
// exit 2.
//
// The drawn counts (D18) are taken in the same runs, with drawn.yml, the format of ../drawn.yml, and compared with
// expected-<site>-counts.csv exactly, number for number and row for row, in order: a visible surface and one inside
// a closed fold (drawn but not shown), one a style hides, a text-matched selector that keeps one box and drops
// another, pages where nothing matches (0), a null family (no rows), a selector that throws (empty), and the missing
// page and the page whose scheme does not take effect (empty). The style metrics (D19) of every surface shown are
// taken in the same loads and compared with expected-<site>-metrics.csv exactly, value for value and row for row, in
// order; the fixtures pin every measured box in px, so the values hold on any platform's fonts. Between them: a
// dominant text that is not the first (a solution's answer under its title), a translucent background composited
// over the page's, a pair below 4.5:1 (in dark), content wider than its box (an overflow), a surface with no text
// (its text measures empty), a page with no body text (its body measures empty), an `n` that skips a surface drawn
// and not shown, and a key from each source the fixtures have: TeX (from MathJax's math list on Sphinx, KaTeX's
// annotation on mystmd, the same key on both), code (the same on both), a label, and none (pairing falls back to
// `n`). Then run.mjs is run on each build of the good site with that table, on one page: it must write the same
// counts and metrics, record the selector that threw in provenance.json (schema 3), and exit 1 for it; with
// --no-metrics it must write the same counts and no metrics.csv; and its run without page-wide checks must write
// neither counts.csv nor metrics.csv.
//
// Exit 1 on any mismatch, so the job fails before the real run. In GitHub Actions each site's mismatches are also an
// ::error:: annotation, so the run's annotations say what CI read.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { spawnSync } from "node:child_process";
import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { METRIC_COLUMNS, countKeyOf, keyOf, metricKeyOf, parseCountsCsv, parseCsv, parseMetricsCsv, toCountsCsv, toCsv, toMetricsCsv } from "../lib/csv.mjs";
import { runChecks } from "../lib/engine.mjs";
import { serve } from "../lib/server.mjs";
import { readDrawn, readTable } from "../lib/table.mjs";
import theme from "../theme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = ["intro", "typography", "code_cells", "long_cells", "math"];
const BASES = [theme.basePath, "/"];
const write = process.argv.includes("--print"); // print each site's rows as CSV, to write a new expected file by hand
const CI = process.env.GITHUB_ACTIONS === "true";

/** A workflow command's message: GitHub reads `%`, CR and LF escaped. */
const escape = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
function annotate(level, lines, max = 6000) {
  if (!CI) return;
  let text = lines.join("\n");
  if (text.length > max) text = `${text.slice(0, max)}\n… (cut at ${max} characters; the job's log has the rest)`;
  console.log(`::${level}::${escape(text)}`);
}

/** The site `name` built for `base`: a copy under `into`, with `{{base}}` replaced in every page. */
async function build(name, base, into) {
  const out = join(into, name);
  await cp(join(HERE, name), out, { recursive: true });
  for (const f of await readdir(out, { recursive: true })) {
    if (!f.endsWith(".html")) continue;
    const p = join(out, f);
    await writeFile(p, (await readFile(p, "utf8")).replaceAll("{{base}}", base));
  }
  return out;
}

/** The counts against the expected ones: every row there, in the same place, with the same two numbers. */
function compareCounts(want, counts) {
  const problems = [];
  const got = new Map(counts.map((c) => [countKeyOf(c), c]));
  const shown = (c) => `${c.drawn === "" ? "empty" : c.drawn}/${c.shown === "" ? "empty" : c.shown}`;
  for (const w of want) {
    const g = got.get(countKeyOf(w));
    got.delete(countKeyOf(w));
    if (!g) problems.push(`counts: missing: ${countKeyOf(w)}`);
    else if (String(g.drawn) !== w.drawn || String(g.shown) !== w.shown) problems.push(`counts: ${countKeyOf(w)}: expected drawn/shown ${shown(w)}, got ${shown(g)}`);
  }
  for (const k of got.keys()) problems.push(`counts: unexpected row: ${k} ${shown(got.get(k))}`);
  if (!problems.length && want.map(countKeyOf).join("\n") !== counts.map(countKeyOf).join("\n")) problems.push("counts: the rows are not in the expected order");
  return problems;
}

/** The metrics against the expected ones: every row there, in the same place, with every value the same. */
function compareMetrics(want, metrics) {
  const problems = [];
  const got = new Map(metrics.map((m) => [metricKeyOf(m), m]));
  const text = (v) => (v == null || v === "" ? "empty" : String(v));
  for (const w of want) {
    const g = got.get(metricKeyOf(w));
    got.delete(metricKeyOf(w));
    if (!g) { problems.push(`metrics: missing: ${metricKeyOf(w)}`); continue; }
    const off = METRIC_COLUMNS.filter((c) => String(g[c] ?? "") !== w[c]).map((c) => `${c} expected ${text(w[c])}, got ${text(g[c])}`);
    if (off.length) problems.push(`metrics: ${metricKeyOf(w)}: ${off.join("; ")}`);
  }
  for (const k of got.keys()) problems.push(`metrics: unexpected row: ${k}`);
  if (!problems.length && want.map(metricKeyOf).join("\n") !== metrics.map(metricKeyOf).join("\n")) problems.push("metrics: the rows are not in the expected order");
  return problems;
}

async function check(name, dir, base, table) {
  const server = await serve(dir, base);
  try {
    const site = { mode: "dir", base: server.base, url: server.url, origin: new URL(server.url).origin, publishedBase: new URL(server.base, theme.publishedBase).href };
    const { rows, counts, metrics, faults } = await runChecks({ theme, table, drawn, site, order: PAGES, jobs: 4 });
    if (write) { process.stdout.write(`--- ${name} at ${base}\n${toCsv(rows)}--- ${name} at ${base}, counts\n${toCountsCsv(counts)}--- ${name} at ${base}, metrics\n${toMetricsCsv(metrics)}`); return []; }
    const want = parseCsv(await readFile(join(HERE, `expected-${name}.csv`), "utf8"));
    const got = new Map(rows.map((r) => [keyOf(r), r]));
    const problems = [];
    for (const w of want) {
      const g = got.get(keyOf(w));
      got.delete(keyOf(w));
      if (!g) problems.push(`missing: ${keyOf(w)}`);
      else if (g.result !== w.result) problems.push(`${keyOf(w)}: expected ${w.result}, got ${g.result} (${g.detail})`);
      else if (w.detail && !g.detail.includes(w.detail)) problems.push(`${keyOf(w)}: the detail "${g.detail}" does not contain "${w.detail}"`);
    }
    for (const k of got.keys()) problems.push(`unexpected row: ${k} ${got.get(k).result} (${got.get(k).detail})`);
    const wantCounts = parseCountsCsv(await readFile(join(HERE, `expected-${name}-counts.csv`), "utf8"));
    problems.push(...compareCounts(wantCounts, counts));
    const wantMetrics = parseMetricsCsv(await readFile(join(HERE, `expected-${name}-metrics.csv`), "utf8"));
    problems.push(...compareMetrics(wantMetrics, metrics));
    for (const f of faults) problems.push(`metrics: ${f.page} ${f.family} ${f.viewport} ${f.scheme} ${f.n}: ${f.why}`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name} at ${base}: ${want.length} expected rows, ${rows.length} written; ${wantCounts.length} expected counts, ${counts.length} taken; ${wantMetrics.length} expected metrics, ${metrics.length} taken${problems.length ? `; ${problems.length} mismatch(es)` : ""}`);
    for (const p of problems) console.log(`       ${p}`);
    return problems;
  } finally {
    await server.close();
  }
}

// run.mjs on a build of the good site, page-meta alone, no page-wide checks: the exit status, what it says on stderr,
// and its page-meta rows. Served at the base the build was made for, run.mjs must pass page-meta, which holds only
// when run.mjs derives the page's address from the base it serves the site at; served at the other, its build-base
// check must stop it with exit 2.
async function baseCheck(dir, built) {
  const out = await mkdtemp(join(tmpdir(), "harness-selftest-out-"));
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY; // this run's summary is not the job's
  delete env.GITHUB_ACTIONS; // nor are its annotations
  const run = (base) => spawnSync(process.execPath, [join(HERE, "..", "run.mjs"), "--dir", dir, "--base-path", base,
    "--table", join(HERE, "locators.yml"), "--only", "page-meta", "--no-pages", "--quiet", "--out", out], { encoding: "utf8", env });
  const other = BASES.find((b) => b !== built);
  const problems = [];
  try {
    const right = run(built);
    if (right.status !== 0) problems.push(`built for ${built}, at ${built}: expected exit 0, got ${right.status} (${right.stderr.trim().split("\n").pop()})`);
    else {
      const rows = parseCsv(await readFile(join(out, "rendered.csv"), "utf8")).filter((r) => r.family === "page-meta" && r.check === "behaviour");
      if (rows.length !== 2) problems.push(`built for ${built}, at ${built}: expected 2 page-meta behaviour rows, got ${rows.length}`);
      for (const r of rows) if (r.result !== "pass") problems.push(`built for ${built}, at ${built}: run.mjs's page-meta ${r.scheme}: expected pass, got ${r.result} (${r.detail})`);
      // no page-wide checks, no counts and no metrics: neither file, and provenance says none were taken
      const prov = JSON.parse(await readFile(join(out, "provenance.json"), "utf8"));
      for (const f of ["counts.csv", "metrics.csv"]) if (await access(join(out, f)).then(() => true, () => false)) problems.push(`built for ${built}, at ${built}: run.mjs --no-pages wrote a ${f}`);
      if (prov.schema !== 3 || prov.drawn !== null || prov.metrics !== null || prov.environment?.fonts !== null || JSON.stringify(prov.outputs) !== '["rendered.csv"]') problems.push(`built for ${built}, at ${built}: run.mjs --no-pages: expected provenance schema 3, drawn, metrics and environment.fonts null, and outputs ["rendered.csv"], got schema ${prov.schema}, drawn ${JSON.stringify(prov.drawn)?.slice(0, 80)}, metrics ${JSON.stringify(prov.metrics)?.slice(0, 80)}, outputs ${JSON.stringify(prov.outputs)}`);
    }
    const wrong = run(other);
    if (wrong.status !== 2 || !/was not built for the base/.test(wrong.stderr)) problems.push(`built for ${built}, at ${other}: expected exit 2 from the build-base check, got ${wrong.status} (${wrong.stderr.trim().split("\n").pop()})`);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs on the good site built for ${built}: page-meta passes at ${built}, and the build-base check stops it at ${other}${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

// run.mjs on a build of the good site, with this drawn table, on the page typography: its counts.csv and metrics.csv
// must hold the typography rows of expected-good-counts.csv and expected-good-metrics.csv, its provenance.json
// (schema 3) must name the selector that threw at each of the six readings and record the metrics and the fonts
// they rendered with, and it must exit 1 for that alone (no check of its own could not run). Run again with
// --no-metrics, it must write the same counts and no metrics.csv, and say so in provenance.json.
const DRAWN_PAGE = "typography";
async function drawnCheck(dir, base) {
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY;
  delete env.GITHUB_ACTIONS;
  const problems = [];
  const wantCounts = parseCountsCsv(await readFile(join(HERE, "expected-good-counts.csv"), "utf8")).filter((x) => x.page === DRAWN_PAGE);
  const wantMetrics = parseMetricsCsv(await readFile(join(HERE, "expected-good-metrics.csv"), "utf8")).filter((x) => x.page === DRAWN_PAGE);
  const thrower = drawn.counted.find((f) => typeof f.selector === "string" && f.selector.endsWith(":captioned"))?.id;
  for (const metrics of [true, false]) {
    const out = await mkdtemp(join(tmpdir(), "harness-selftest-out-"));
    const say = (p) => problems.push(`${metrics ? "" : "--no-metrics: "}${p}`);
    try {
      const r = spawnSync(process.execPath, [join(HERE, "..", "run.mjs"), "--dir", dir, "--base-path", base, "--table", join(HERE, "locators.yml"),
        "--drawn", join(HERE, "drawn.yml"), "--only", "header-title", "--pages", DRAWN_PAGE, ...(metrics ? [] : ["--no-metrics"]), "--quiet", "--out", out], { encoding: "utf8", env });
      if (r.status !== 1) say(`expected exit 1 for the selector that throws, got ${r.status} (${(r.stderr || r.stdout).trim().split("\n").pop()})`);
      const read = async (f) => readFile(join(out, f), "utf8").catch(() => null);
      const [rendered, counts, measured, prov] = [await read("rendered.csv"), await read("counts.csv"), await read("metrics.csv"), JSON.parse((await read("provenance.json")) ?? "null")];
      if (!rendered || !counts || !prov || !measured !== !metrics) {
        say(`expected rendered.csv, counts.csv${metrics ? ", metrics.csv" : ""} and provenance.json, got ${[rendered && "rendered.csv", counts && "counts.csv", measured && "metrics.csv", prov && "provenance.json"].filter(Boolean).join(", ") || "none"}`);
        continue;
      }
      const errors = parseCsv(rendered).filter((x) => x.result === "error");
      if (errors.length) say(`expected no error rows, got ${errors.length} (${errors[0].page} ${errors[0].family} ${errors[0].check}: ${errors[0].detail})`);
      problems.push(...compareCounts(wantCounts, parseCountsCsv(counts)).map((p) => `${metrics ? "" : "--no-metrics: "}${p}`));
      const threw = (prov.drawn?.uncounted ?? []).filter((u) => u.family);
      const outputs = JSON.stringify(["rendered.csv", "counts.csv", ...(metrics ? ["metrics.csv"] : [])]);
      if (prov.schema !== 3 || JSON.stringify(prov.outputs) !== outputs) say(`expected provenance schema 3 with outputs ${outputs}, got schema ${prov.schema}, outputs ${JSON.stringify(prov.outputs)}`);
      if (prov.drawn?.rows !== wantCounts.length || prov.drawn?.families !== drawn.counted.length) say(`expected provenance drawn.rows ${wantCounts.length} and drawn.families ${drawn.counted.length}, got ${prov.drawn?.rows} and ${prov.drawn?.families}`);
      if (threw.length !== 6 || threw.some((u) => u.family !== thrower || !/^the selector threw: /.test(u.why))) say(`expected provenance drawn.uncounted to name ${thrower}'s selector at the six readings, got ${JSON.stringify(threw).slice(0, 300)}`);
      if (!/^\d+\.\d+\.\d+/.test(prov.environment?.browser?.build ?? "")) say(`expected provenance environment.browser.build, got ${JSON.stringify(prov.environment?.browser)}`);
      if (metrics) {
        problems.push(...compareMetrics(wantMetrics, parseMetricsCsv(measured)));
        const m = prov.metrics, f = prov.environment?.fonts;
        if (m?.rows !== wantMetrics.length || m?.tied_to_counts !== true || m?.content !== theme.content || m?.body_text !== theme.bodyText || m?.faults?.length !== 0 || m?.readings?.taken !== 6)
          say(`expected provenance metrics with rows ${wantMetrics.length}, tied to the counts, this theme's content and body text, no faults and 6 readings taken, got ${JSON.stringify(m)?.slice(0, 300)}`);
        if (!/^[0-9a-f]{64}$/.test(f?.fingerprint ?? "") || !f?.rendered?.length) say(`expected provenance environment.fonts with a fingerprint and the fonts the text rendered with, got ${JSON.stringify(f)?.slice(0, 200)}`);
      } else if (prov.metrics !== null || prov.environment?.fonts !== null) say(`expected provenance metrics and environment.fonts null, got ${JSON.stringify(prov.metrics)?.slice(0, 120)}, ${JSON.stringify(prov.environment?.fonts)?.slice(0, 80)}`);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs's counts and metrics on the good site built for ${base}, at ${DRAWN_PAGE}: both written, the selector that threw recorded, exit 1; with --no-metrics the counts alone${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

const table = await readTable(join(HERE, "locators.yml"), theme.side);
const drawn = await readDrawn(join(HERE, "drawn.yml"), theme.side);
const work = await mkdtemp(join(tmpdir(), "harness-selftest-"));
let bad = 0;
try {
  const seen = new Map(); // a site's mismatches at the first base, so the second base's same ones are named once
  for (const base of BASES) {
    const into = join(work, base === "/" ? "root" : "base");
    for (const name of ["good", "bad"]) {
      const dir = await build(name, base, into);
      const problems = await check(name, dir, base, table);
      bad += problems.length;
      if (!problems.length) continue;
      const same = seen.get(name)?.join("\n") === problems.join("\n");
      annotate("error", same ? [`self-test: ${name} at ${base}: the same ${problems.length} mismatch(es) as at ${BASES[0]}`]
        : [`self-test: ${name} at ${base}: ${problems.length} mismatch(es)`, ...problems]);
      seen.set(name, problems);
    }
    if (!write) {
      const problems = await baseCheck(join(into, "good"), base);
      bad += problems.length;
      if (problems.length) annotate("error", [`self-test: run.mjs on the good site built for ${base}`, ...problems]);
      const counted = await drawnCheck(join(into, "good"), base);
      bad += counted.length;
      if (counted.length) annotate("error", [`self-test: run.mjs's counts on the good site built for ${base}`, ...counted]);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
if (!write) console.log(bad ? "the self-test failed: the harness does not read its fixtures as expected" : "the self-test passed");
if (!write && !bad) annotate("notice", [`self-test passed: both fixture sites read as expected at ${BASES.join(" and ")}, their rows, their drawn counts and their metrics`]);
process.exit(bad ? 1 : 0);
