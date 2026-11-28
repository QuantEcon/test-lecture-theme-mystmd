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
// dominant text that is not the first (a solution's answer under its title, set smaller than its box), a translucent
// background composited over the page's, a translucent text colour, a pair below 4.5:1 (in dark), a heading whose two
// styles tie, maths drawn as its engine draws it (MathJax's glyphs as ::before content, KaTeX's HTML in two fonts)
// with its hidden copy, longer, left out, hidden text in a closed fold left out, content wider than its box (an
// overflow), a surface with no text (its text measures empty), a page with no body text (its paragraph is boxed, in
// a section: its body measures empty), a second body paragraph narrower than the first, an `n` that skips a surface
// drawn and not shown, and a key from each source: TeX (from MathJax's math list, the inline expression first, on
// Sphinx, from KaTeX's annotation on mystmd: the same keys on both, the displays in the other order), code (with line
// numbers on one stack and not the other, and a cell folded whole: the same on both), headings (a page title, the
// book's title on mystmd's first page), a label from the page's source (selftest/labels.yml), and none (pairing
// falls back to `n`), where a generated id and a labelled box round the surface give none. Then the unit cases: the
// key's rules, the labels a page's source gives, the tie check's failure path, the fingerprint, and the measures on a
// small page of their own, each pinned. Then run.mjs is run on each build of the good site with that table, on one
// page: it must write the same counts and metrics, record the selector that threw in provenance.json (schema 3), and
// exit 1 for it; with --no-metrics it must write the same counts and no metrics.csv; and its run without page-wide
// checks must write neither counts.csv nor metrics.csv. Last, run.mjs is run, as in GitHub Actions, on a build of the
// good site whose body text is forced not to be read: a problem with the metrics warns and never fails the run
// (QuantEcon/project-theme-parity#80), so it must exit 0, print the "Style metrics problems" warning, and record the
// fault in provenance.json. The self-test itself fails on any metrics mismatch, as on any other.
//
// Exit 1 on any mismatch, so the job fails before the real run. In GitHub Actions each site's mismatches are also an
// ::error:: annotation, so the run's annotations say what CI read.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { spawnSync } from "node:child_process";
import { access, chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { METRIC_COLUMNS, countKeyOf, keyOf, metricKeyOf, parseCountsCsv, parseCsv, parseMetricsCsv, sanitiseMetricRows, toCountsCsv, toCsv, toMetricsCsv } from "../lib/csv.mjs";
import { runChecks } from "../lib/engine.mjs";
import { chromium } from "@playwright/test";
import YAML from "yaml";
import { serve } from "../lib/server.mjs";
import { oneLine } from "../lib/util.mjs";
import { readDrawn, readTable } from "../lib/table.mjs";
import { bodyText, fingerprint, keyOf as surfaceKey, labelsIn, measureDrawn, renderedFonts, tieOf } from "../lib/visual.mjs";
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
    const { rows, counts, metrics, faults } = await runChecks({ theme, table, drawn, site, order: PAGES, jobs: 4, labels });
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
        "--drawn", join(HERE, "drawn.yml"), "--labels", join(HERE, "labels.yml"), "--only", "header-title", "--pages", DRAWN_PAGE,
        ...(metrics ? [] : ["--no-metrics"]), "--quiet", "--out", out], { encoding: "utf8", env });
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
        if (m?.rows !== wantMetrics.length || m?.tied_to_counts !== true || m?.content !== theme.content || m?.body_text !== theme.bodyText || m?.faults?.length !== 0 || m?.readings?.taken !== 6
          || !String(m?.labels?.from).endsWith("labels.yml") || m?.labels?.pages !== Object.keys(labels).length)
          say(`expected provenance metrics with rows ${wantMetrics.length}, tied to the counts, this theme's content and body text, no faults, 6 readings taken and the labels from selftest/labels.yml, got ${JSON.stringify(m)?.slice(0, 300)}`);
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

// The unit cases, each value pinned here: the key's rules (visual.mjs's keyOf), the labels a page's source gives
// (labelsIn), the tie check's failure path (tieOf), the fingerprint, and the measures (measureDrawn, bodyText) on a
// small page of their own, with a stand-in theme. So a rule that changes is caught where no fixture page shows it.
const UNIT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:16px sans-serif;color:#000000;background:#ffffff} .s{display:block;width:300px;height:40px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden} .clip{position:absolute;clip:rect(1px,1px,1px,1px)}
.cp{display:inline-block;clip-path:inset(50%)} i-g{display:inline-block;color:#111111;font-size:20px;font-family:monospace} i-g::before{content:"x"}
</style></head><body>
<div class="s" id="tie"><span style="color:#111111">abcde</span><span style="color:#222222">fghij</span></div>
<div class="s" id="space"><span style="color:#111111">abcdefg</span><span style="color:#222222">a b c d e f</span><span style="color:#333333">\u200b\u200b\u200b\u200b\u200b\u200b\u200b\u200b</span></div>
<div class="s" id="hidden"><span style="color:#111111">abc</span><span style="display:none;color:#a00000">abcdefgh</span><span style="visibility:hidden;color:#a10000">abcdefgh</span><span style="opacity:0;color:#a20000">abcdefgh</span><span class="sr" style="color:#a30000">abcdefgh</span><span class="clip" style="color:#a40000">abcdefgh</span><span class="cp" style="color:#a50000">abcdefgh</span></div>
<div class="s" id="glyph"><i-g></i-g><i-g></i-g><i-g></i-g><span style="color:#222222">ab</span></div>
<div class="s" id="translucent"><span style="color:rgba(0,0,0,0.5)">abc</span></div>
<div class="s" id="size" style="font-size:16px;line-height:20px"><span style="font-size:20px;line-height:30px">abc</span></div>
<p><span id="inline">abc</span></p>
<div style="background:#000080"><div style="background:rgba(255,255,255,0.5)"><div class="s" id="bg"><span style="color:#ffffff">abc</span></div></div></div>
<div class="s n">one</div><div class="s n" style="display:none">two</div><div class="s n">three</div>
<main id="u-root" style="width:600px"><p class="b" style="width:400px;font-size:17px;line-height:25px">first</p><p class="b" style="width:300px;font-size:13px">second</p></main>
<div id="box-label"><p class="s u-own">in a labelled box</p></div>
<div class="math" id="equation-q"><mjx-container class="u-mjx" jax="CHTML" display="true" style="display:block;height:20px">q</mjx-container></div>
<div id="q"><div><span class="katex-display u-katex" style="display:block;height:20px">q</span></div></div>
<ol><li class="myst-footnotes-item s" id="fn-note-1">a footnote</li></ol>
<div class="s" id="weight"><span style="color:#111111;font-weight:700">abc</span><span style="color:#111111;font-weight:400">defg</span><span style="color:#222222">hijklm</span></div>
<div id="frac" style="width:100.125px;height:20.5px">frac</div>
<div class="cell u-noinput s"><div class="cell_output"><div class="highlight"><pre>out()</pre></div></div></div>
<div id="u-cell" class="myst-jp-nb-block s"><div data-name="outputs-container"><div class="myst-code"><pre><code>out()</code></pre></div></div></div>
</body></html>`;
const UNIT_THEME = { content: "body", glyphs: "i-g", sourceOf: function sourceOf() { return {}; } };
const THROWING_THEME = { content: "body", glyphs: null, sourceOf: function sourceOf() { throw new Error("a source that throws, deliberately"); } };

async function unitChecks() {
  const problems = [];
  const eq = (what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  // the key's rules
  const L = new Set(["eq-cagan-demand"]);
  eq("key: TeX with its wrappers, spacing, \\tag, \\label and \\nonumber, as Sphinx writes it", surfaceKey({ tex: "\\begin{split}\\begin{aligned} ab \\,&= \\bar{c} \\\\ c &= d\\:e \\tag{1}\\label{eq:x}\\nonumber \\end{aligned}\\end{split}" }), "tex:be2a7fa15430");
  eq("key: the same TeX as mystmd writes it", surfaceKey({ tex: "\\begin{aligned} ab &= \\bar{c} \\\\\nc &= d~e \\end{aligned}" }), "tex:be2a7fa15430");
  eq("key: TeX without the line break is other TeX", surfaceKey({ tex: "ab &= \\bar{c} c &= de" }), "tex:dfc0b224d309");
  eq("key: code, its whitespace removed", [surfaceKey({ code: "import numpy as np\n  x = 1\n" }), surfaceKey({ code: "import numpy as np x=1" })], ["code:9b8d047c8724", "code:9b8d047c8724"]);
  eq("key: a heading, its whitespace removed and lower-cased", [surfaceKey({ heading: "Lists ab12c" }), surfaceKey({ heading: " LISTS  AB12C " })], ["heading:6aebc406e6d3", "heading:6aebc406e6d3"]);
  eq("key: a label, normalised, and only one the page's source has", [surfaceKey({ label: "equation-Eq:Cagan_Demand" }, L), surfaceKey({ label: "id1" }, L), surfaceKey({ label: "eq-cagan-demand" })], ["label:9de743c9815c", "", ""]);
  eq("key: TeX before code, heading and label", surfaceKey({ tex: "x", code: "y", heading: "z", label: "eq-cagan-demand" }, L), "tex:2d711642b726");
  eq("key: code before heading, and heading before label", [surfaceKey({ code: "y", heading: "z", label: "eq-cagan-demand" }, L), surfaceKey({ heading: "z", label: "eq-cagan-demand" }, L)], ["code:a1fce4363854", "heading:594e519ae499"]);
  eq("key: a source empty once normalised gives way to the next", [surfaceKey({ code: " \n ", label: "eq-cagan-demand" }, L), surfaceKey({ tex: "\\, ~", heading: "Lists" })], ["label:9de743c9815c", "heading:4c14c4a453f9"]);
  eq("labels: a MyST page's targets, :label: and :name:, equation labels, \\label and footnotes",
    [...labelsIn("(Sec_One)=\n# Head\n:label: Short_Path_Ex1\n:name: \"flow_fig\"\n$$\nx \\label{a:y0}\n$$ (eq:cagan_demand)\n[^footnote-1]: x\nnot a (label)= here")].sort(),
    ["a-y0", "eq-cagan-demand", "flow-fig", "footnote-1", "sec-one", "short-path-ex1"]);
  // the tie check, holding and failing
  const c = (family, shown) => ({ page: "p", family, viewport: "desktop", scheme: "light", drawn: shown, shown });
  const m = (family, n) => ({ page: "p", family, viewport: "desktop", scheme: "light", n });
  eq("tie: rows that number each reading's shown", tieOf([c("f", 2), c("g", "")], [m("f", 1), m("f", 2)]), { ok: true, readings: 1, surfaces: 2, off: [] });
  eq("tie: too few rows, rows for a reading not counted, rows for no count", tieOf([c("f", 2), c("g", "")], [m("f", 1), m("g", 1), m("h", 1)]),
    { ok: false, readings: 1, surfaces: 2, off: ["p|f|desktop|light: 1 rows, shown 2", "p|g|desktop|light: 1 rows, shown empty", "p|h|desktop|light: 1 rows, and no count"] });
  // the fingerprint, and each of its three parts in it
  const R = new Set(["F (F-Regular), web"]), F = new Set(["fonts/a.woff2"]), I = ["DejaVu Sans: style=Book fontversion=1 file=/x.ttf"];
  eq("fingerprint: the installed fonts, the font files and the rendered fonts", [fingerprint(R, F, I), fingerprint(R, new Set(), I), fingerprint(R, F, []), fingerprint(new Set(), F, I)],
    ["c41673c74de7fcaeb5cbe6bf963afc37aab9216358aa61e1c49f43245b4b998e", "064f7ba8039d40c738238b8eb5c858f0b80e3f030c7914f96a4ed6d4498aaf63",
      "051b0140ed88dcd2eb8f510984383a9291f3190b89e185140cdcd6aef5901c84", "964ba3f3156ac910583b5c393d4d304b17bacc6fbfd43bd5797ed951f4a433e9"]);
  // the writer's rules: a value that is not one its column takes is written empty, and a problem, never a throw
  const row = { page: "p", family: "f", viewport: "desktop", scheme: "light", n: 1, key: "", width: 10, height: 5, column: "", overflow: -1, text: "x-odd.tag_1",
    font_size: 16, line_height: "", body_font_size: "", body_line_height: "", colour: "#000000", background: "#ffffff", contrast: "21.00" };
  const clean = sanitiseMetricRows([row, { ...row, n: 2, overflow: 0, font_size: "abc" }, { ...row, n: 3, overflow: 0, text: "", font_size: "", colour: "", background: "", contrast: "", line_height: 20 }]);
  eq("writer: a value its column does not take is written empty and named; an odd tag is a tag",
    { rows: clean.rows.map((x) => [x.overflow, x.text, x.font_size, x.line_height]), problems: clean.problems.map((x) => [x.n, /overflow|font_size|line_height/.exec(x.why)?.[0]]) },
    { rows: [["", "x-odd.tag_1", 16, ""], [0, "", "", ""], [0, "", "", ""]], problems: [[1, "overflow"], [2, "font_size"], [3, "line_height"]] });
  // the measures, on a page of their own
  const browser = await chromium.launch(process.env.HARNESS_CHROMIUM ? { executablePath: process.env.HARNESS_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(UNIT_PAGE);
    const one = async (sel, t = UNIT_THEME) => (await measureDrawn(page, sel, t)).surfaces[0];
    const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));
    eq("measure: two styles with as many characters: the first", pick(await one("#tie"), ["text", "colour"]), { text: "span", colour: "#111111" });
    eq("measure: whitespace and zero-width characters not counted", pick(await one("#space"), ["colour"]), { colour: "#111111" });
    eq("measure: hidden text left out (display, visibility, opacity, a 1px box, a clip, a clip-path)", pick(await one("#hidden"), ["colour"]), { colour: "#111111" });
    eq("measure: glyphs drawn as ::before content (the theme's glyphs), with no line height", pick(await one("#glyph"), ["text", "font_size", "line_height", "colour"]), { text: "i-g", font_size: 20, line_height: "", colour: "#111111" });
    eq("measure: a translucent text colour, composited over its background", pick(await one("#translucent"), ["colour", "background", "contrast"]), { colour: "#808080", background: "#ffffff", contrast: "3.95" });
    eq("measure: the dominant text's size and line height, not the surface's", pick(await one("#size"), ["font_size", "line_height"]), { font_size: 20, line_height: 30 });
    eq("measure: an inline box has no overflow to read", pick(await one("#inline"), ["overflow"]), { overflow: "" });
    eq("measure: translucent backgrounds composited in order over the first opaque one", pick(await one("#bg"), ["colour", "background", "contrast"]), { colour: "#ffffff", background: "#8080c0", contrast: "3.64" });
    const n = await measureDrawn(page, ".n", UNIT_THEME);
    eq("measure: n is the place among the drawn matches, and only the shown are measured", { drawn: n.drawn, shown: n.shown, n: n.surfaces.map((x) => x.n) }, { drawn: 3, shown: 2, n: [1, 3] });
    eq("body text: the first shown match, its width the column", await bodyText(page, { content: "#u-root", bodyText: "p.b" }), { body_font_size: 17, body_line_height: 25, column: 400 });
    // the theme's own label sites, on markup in its own form
    const label = async (sel) => (await measureDrawn(page, sel, theme)).surfaces[0]?.source?.label ?? null;
    eq("theme: a surface with no id of its own takes no label from the box round it", await label(".u-own"), null);
    if (theme.side === "sphinx") eq("theme: a display's label is on its div.math", await label(".u-mjx"), "equation-q");
    else {
      eq("theme: a display's label is on the block mystmd draws round it", await label(".u-katex"), "q");
      eq("theme: a footnote's label, without the fn- mystmd writes before it", await label("#fn-note-1"), "note-1");
    }
    eq("measure: a style is its colour, size, family and weight", pick(await one("#weight"), ["colour"]), { colour: "#222222" });
    eq("measure: lengths to 1/100 px", pick(await one("#frac"), ["width", "height"]), { width: 100.13, height: 20.5 });
    let badGlyphs = null;
    try { badGlyphs = await one("#tie", { content: "body", glyphs: ":::", sourceOf: function sourceOf() { return {}; } }); } catch (e) { badGlyphs = { threw: oneLine(e.message, 80) }; }
    eq("measure: measures that throw keep the surface, with the fault, and no measures", { n: badGlyphs?.n, fault: !!badGlyphs?.fault, width: badGlyphs?.width ?? null, threw: badGlyphs?.threw ?? null }, { n: 1, fault: true, width: null, threw: null });
    eq("theme: a cell with no input has no code, not its output's", (await measureDrawn(page, theme.side === "sphinx" ? ".u-noinput" : "#u-cell", theme)).surfaces[0]?.source?.code ?? null, null);
    // the fonts a glyph's ::before draws in are read with the text's
    const fontsPage = await browser.newPage();
    await fontsPage.setContent(UNIT_PAGE);
    await measureDrawn(fontsPage, "#tie", UNIT_THEME);
    const textFonts = await renderedFonts(fontsPage);
    await measureDrawn(fontsPage, "#glyph", UNIT_THEME);
    const withGlyphs = await renderedFonts(fontsPage);
    eq("fonts: the ones a glyph's ::before is drawn in are read", [...withGlyphs].some((f) => !textFonts.has(f)), true);
    await fontsPage.close();
    const thrown = await one("#tie", THROWING_THEME);
    eq("measure: a source that throws keeps the measures, and says so", { keyFault: /deliberately/.test(thrown?.keyFault ?? ""), text: thrown?.text }, { keyFault: true, text: "span" });
  } finally {
    await browser.close();
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} the unit cases: the key's rules, the source labels, the tie check, the fingerprint and the measures${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

/** A CSV that run.mjs wrote, read with `parse`: its rows, or null and a mismatch where it is missing or malformed. */
async function rowsOf(file, parse, problems, what) {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text == null) { problems.push(`expected ${what}, and found none`); return null; }
  try { return parse(text); } catch (e) { problems.push(`${what} does not parse: ${e.message}`); return null; }
}

/** The self-test's drawn table less the selector that throws, written into `dir`: a run.mjs run that no count fails. */
async function quietTable(dir) {
  const t = YAML.parse(await readFile(join(HERE, "drawn.yml"), "utf8"));
  t.families = t.families.filter((f) => !(typeof f.selector === "string" && f.selector.endsWith(":captioned")));
  const file = join(dir, "drawn.yml");
  await writeFile(file, YAML.stringify(t));
  return file;
}

/** A copy of a built site, and the file in it of the page `stem`. */
async function siteCopy(goodDir, dir, stem) {
  await cp(goodDir, dir, { recursive: true });
  const rel = theme.pagePath(stem);
  return join(dir, rel === "" || rel.endsWith("/") ? join(rel, "index.html") : rel);
}

const runMjs = (args, env) => spawnSync(process.execPath, [join(HERE, "..", "run.mjs"), ...args], { encoding: "utf8", env });
const quietEnv = (extra = {}) => { const env = { ...process.env, ...extra }; delete env.GITHUB_STEP_SUMMARY; if (!extra.GITHUB_ACTIONS) delete env.GITHUB_ACTIONS; return env; };

// run.mjs, as in GitHub Actions, on a build of the good site whose typography page forces problems with the metrics
// and holds two values that once stopped the writer: the content root's own querySelectorAll, which only the body
// text's reading calls, throws (six body-text faults), and so does the solution box's scrollWidth, which only its
// measures read (six measure faults); and a bordered table, to which Chrome gives a client width past its scroll width,
// draws its text in an element whose tag has a `.` and a `_`, and whose computed line height is forced to a value the
// column does not take (six more measure faults, from the writer's rules). With the drawn table less the selector that
// throws (so no count fails the run), run.mjs must exit 0, print the "Style metrics problems" warning and the problems
// in its summary, record the eighteen faults in provenance.json, and write every row: the solution's without its
// measures, the table's with an overflow of 0, the odd tag and no line height, and none with body measures.
const FAULT_BOX = theme.side === "sphinx" ? ".solution" : "#selftest-sol-1";
const ODD_TAG = "x-odd.tag_1";
const FAULT_TABLE = `<table class="docutils" border="1" style="border:2px solid #000000;border-collapse:separate;width:300px;height:40px"><tbody><tr><td><${ODD_TAG}>the text this table draws, in an element whose tag is odd</${ODD_TAG}></td></tr></tbody></table>`;
const FAULT_SCRIPT = `<script>/* the self-test's forced problems with the metrics: the body text cannot be read, nor the solution's measures */
document.querySelector(${JSON.stringify(theme.content)}).querySelectorAll = () => { throw new Error("a body text that cannot be read, forced by the self-test"); };
for (const e of document.querySelectorAll(${JSON.stringify(FAULT_BOX)})) Object.defineProperty(e, "scrollWidth", { get() { throw new Error("a measure that throws, forced by the self-test"); } });
{ const odd = document.querySelector(${JSON.stringify(ODD_TAG.replace(".", "\\."))}), style = window.getComputedStyle;
  window.getComputedStyle = function (e, pseudo) {
    const s = style.call(window, e, pseudo);
    return e !== odd || pseudo ? s : new Proxy(s, { get(t, k) { if (k === "lineHeight") return "forced"; const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } });
  }; }</script>`;
async function faultCheck(goodDir, base) {
  const work = await mkdtemp(join(tmpdir(), "harness-selftest-fault-"));
  const problems = [];
  try {
    const dir = join(work, "site");
    const file = await siteCopy(goodDir, dir, DRAWN_PAGE);
    const main = theme.side === "sphinx" ? "</section></main>" : "</main></article>";
    await writeFile(file, (await readFile(file, "utf8")).replace(main, `${FAULT_TABLE}${main}`).replace("</body>", `${FAULT_SCRIPT}\n</body>`));
    const out = join(work, "out");
    const r = runMjs(["--dir", dir, "--base-path", base, "--table", join(HERE, "locators.yml"), "--drawn", await quietTable(work), "--labels", join(HERE, "labels.yml"),
      "--only", "header-title", "--pages", DRAWN_PAGE, "--quiet", "--out", out], quietEnv({ GITHUB_ACTIONS: "true" }));
    if (r.status !== 0) problems.push(`expected exit 0, a problem with the metrics being a warning, got ${r.status} (${(r.stderr || r.stdout).trim().split("\n").pop()})`);
    if (!r.stdout.includes("::warning title=Style metrics problems::")) problems.push("expected the \"Style metrics problems\" warning on stdout, and found none");
    if (!/Metrics problems: 18 \(measures 12, key 0, body text 6\)/.test(r.stdout)) problems.push(`expected the summary to give 12 measure and 6 body-text problems, got ${JSON.stringify(r.stdout.split("\n").find((l) => l.startsWith("Metrics problems")) ?? "no such line")}`);
    const prov = JSON.parse(await readFile(join(out, "provenance.json"), "utf8").catch(() => "null"));
    if (!prov) problems.push("expected provenance.json, and found none");
    const m = prov?.metrics, faults = m?.faults ?? [];
    const body = faults.filter((f) => f.kind === "body text"), measures = faults.filter((f) => f.kind === "measures");
    const thrown = measures.filter((f) => f.family === "solution" && /measure that throws, forced/.test(f.why)), ruled = measures.filter((f) => f.family === "table" && /line_height "forced".*written empty/.test(f.why));
    if (m?.fault_counts?.["body text"] !== 6 || m?.fault_counts?.measures !== 12 || faults.length !== 18 || m?.tied_to_counts !== true || m?.not_tied?.length !== 0
      || body.some((f) => f.family !== null || !/body text that cannot be read, forced/.test(f.why)) || thrown.length !== 6 || ruled.length !== 6)
      problems.push(`expected provenance metrics to record six body-text faults and twelve measure faults (six thrown, six by the writer's rules), tied to the counts, got ${JSON.stringify({ fault_counts: m?.fault_counts, faults: faults.slice(0, 2), tied: m?.tied_to_counts }).slice(0, 300)}`);
    const want = parseMetricsCsv(await readFile(join(HERE, "expected-good-metrics.csv"), "utf8")).filter((x) => x.page === DRAWN_PAGE);
    const rows = await rowsOf(join(out, "metrics.csv"), parseMetricsCsv, problems, "metrics.csv");
    if (rows) {
      const sol = rows.filter((x) => x.family === "solution"), tab = rows.filter((x) => x.family === "table");
      if (rows.length !== want.length + 6 || rows.some((x) => x.body_font_size !== "" || x.column !== ""))
        problems.push(`expected the page's ${want.length} rows and the table's 6, none with body measures, got ${rows.length} rows (${JSON.stringify(rows.find((x) => x.body_font_size !== "") ?? null).slice(0, 160)})`);
      if (sol.length !== 6 || sol.some((x) => x.width !== "" || x.text !== "" || !x.key.startsWith("label:")))
        problems.push(`expected the solution's six rows written without their measures and with their key, got ${JSON.stringify(sol[0] ?? null).slice(0, 200)}`);
      if (tab.length !== 6 || tab.some((x) => x.overflow !== "0" || x.text !== ODD_TAG || x.line_height !== "" || x.font_size === ""))
        problems.push(`expected the table's six rows with an overflow of 0, the text in ${ODD_TAG} and no line height, got ${JSON.stringify(tab[0] ?? null).slice(0, 200)}`);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs on the good site built for ${base}, its body text and a measure forced to fail, with a bordered table, an odd tag and a value the writer's rules refuse: warnings, recorded in provenance, every row written, exit 0${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

// run.mjs without --labels, as CI runs it: a copy of the harness in a repository of its own, whose lectures/ holds
// this corpus's table of contents and a MyST typography.md with the fixtures' labels. It must read the labels from
// lectures/typography.md, key the typography page's surfaces as the expected metrics do, and name in provenance the
// pages with no source.
async function lecturesCheck(goodDir, base) {
  const work = await mkdtemp(join(tmpdir(), "harness-selftest-lectures-"));
  const problems = [];
  try {
    const root = join(work, "repo"), harness = join(root, "tests", "harness");
    await cp(join(HERE, ".."), harness, { recursive: true, filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src) });
    await symlink(join(HERE, "..", "node_modules"), join(harness, "node_modules"));
    await mkdir(join(root, "lectures"), { recursive: true });
    for (const f of ["_toc.yml", "myst.yml"]) await cp(join(HERE, "..", "..", "..", "lectures", f), join(root, "lectures", f)).catch(() => {});
    await writeFile(join(root, "lectures", `${DRAWN_PAGE}.md`), ["(typography)=", "# Typography", "", "(lists)=", "## Lists", "",
      ":::{exercise}", ":label: selftest-ex-1", ":::", "", ":::{solution} selftest-ex-1", ":label: selftest_sol_1", ":::", ""].join("\n"));
    const out = join(work, "out");
    const r = spawnSync(process.execPath, [join(harness, "run.mjs"), "--dir", goodDir, "--base-path", base, "--table", join(HERE, "locators.yml"),
      "--drawn", join(HERE, "drawn.yml"), "--only", "header-title", "--pages", DRAWN_PAGE, "--quiet", "--out", out], { encoding: "utf8", env: quietEnv() });
    if (r.status !== 1) problems.push(`expected exit 1 for the selector that throws, got ${r.status} (${(r.stderr || r.stdout).trim().split("\n").pop()})`);
    const prov = JSON.parse(await readFile(join(out, "provenance.json"), "utf8").catch(() => "null"));
    const l = prov?.metrics?.labels;
    if (l?.from !== "lectures/<page>.md" || !l?.no_source?.includes("intro") || l?.no_source?.includes(DRAWN_PAGE) || l?.labels !== 4)
      problems.push(`expected the labels read from lectures/<page>.md (four on ${DRAWN_PAGE}), the pages with no source named, got ${JSON.stringify(l).slice(0, 200)}`);
    const want = parseMetricsCsv(await readFile(join(HERE, "expected-good-metrics.csv"), "utf8")).filter((x) => x.page === DRAWN_PAGE);
    const rows = await rowsOf(join(out, "metrics.csv"), parseMetricsCsv, problems, "metrics.csv");
    if (rows && JSON.stringify(rows.map((x) => `${metricKeyOf(x)} ${x.key}`)) !== JSON.stringify(want.map((x) => `${metricKeyOf(x)} ${x.key}`)))
      problems.push(`expected the keys of expected-good-metrics.csv's ${DRAWN_PAGE} rows, got ${rows.filter((x, i) => x.key !== want[i]?.key).slice(0, 2).map((x) => `${metricKeyOf(x)} ${x.key}`).join("; ") || "other rows"}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs on the good site built for ${base} without --labels: the labels read from lectures/${DRAWN_PAGE}.md${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

// The fingerprint, through run.mjs: three runs on a build of the good site whose typography page uses a web font of
// the site's own and holds a frame that uses another, with a stand-in fc-list on PATH that lists one font at the
// version HARNESS_SELFTEST_FONTVERSION gives. The second run moves the installed font's version, and the fingerprint
// must move; the third has the first's version, and the frame's font changed, and is served on another port, and the
// fingerprint must be the first's. The main frame's font file is listed by its path under the base with a hash of its
// bytes, and the frame's apart.
async function fontCheck(goodDir, base) {
  const work = await mkdtemp(join(tmpdir(), "harness-selftest-fonts-"));
  const problems = [];
  try {
    const bin = join(work, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "fc-list"), `#!/bin/sh
case " $* " in *" fontversion "*) echo "Selftest Sans:style=Book:fontversion=$HARNESS_SELFTEST_FONTVERSION:file=/selftest/selftest-sans.ttf" ;;
  *) echo "Selftest Sans:style=Book:file=/selftest/selftest-sans.ttf" ;; esac
`);
    await chmod(join(bin, "fc-list"), 0o755);
    const dir = join(work, "site");
    const file = await siteCopy(goodDir, dir, DRAWN_PAGE);
    await mkdir(join(dir, "fonts"));
    for (const f of ["main", "frame-a", "frame-b"]) await writeFile(join(dir, "fonts", `${f}.woff2`), `not a font: ${f}`);
    const frame = (f) => `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:SelftestFrame;src:url(${base}fonts/${f}.woff2)}</style></head><body><p style="font-family:SelftestFrame">a frame's text</p></body></html>`;
    const main = theme.side === "sphinx" ? "</section></main>" : "</main></article>";
    await writeFile(file, (await readFile(file, "utf8")).replace(main, `<style>@font-face{font-family:SelftestWeb;src:url(${base}fonts/main.woff2)}</style><p style="font-family:SelftestWeb">text in the site's web font</p><iframe src="${base}frame.html" style="width:200px;height:60px"></iframe>${main}`));
    const table = await quietTable(work);
    const once = async (version, frameFont) => {
      await writeFile(join(dir, "frame.html"), frame(frameFont));
      const out = join(work, `out-${version}-${frameFont}`);
      const r = runMjs(["--dir", dir, "--base-path", base, "--table", join(HERE, "locators.yml"), "--drawn", table, "--labels", join(HERE, "labels.yml"),
        "--only", "header-title", "--pages", DRAWN_PAGE, "--quiet", "--out", out], quietEnv({ PATH: `${bin}${delimiter}${process.env.PATH}`, HARNESS_SELFTEST_FONTVERSION: version }));
      if (r.status !== 0) problems.push(`fonts, version ${version}: expected exit 0, got ${r.status} (${(r.stderr || r.stdout).trim().split("\n").pop()})`);
      return JSON.parse(await readFile(join(out, "provenance.json"), "utf8").catch(() => "null"))?.environment?.fonts ?? null;
    };
    const [one, two, three] = [await once("1.000", "frame-a"), await once("2.000", "frame-a"), await once("1.000", "frame-b")];
    if (!one || !two || !three) problems.push("fonts: expected environment.fonts in each run's provenance.json");
    else {
      if (one.installed?.count !== 1) problems.push(`fonts: expected the stand-in fc-list's one font, got ${JSON.stringify(one.installed)}`);
      if (one.fingerprint === two.fingerprint) problems.push("fonts: the installed font's version moved, and the fingerprint did not");
      if (one.fingerprint !== three.fingerprint) problems.push("fonts: only the frame's font and the port moved, and the fingerprint did too");
      if (!one.files.some((f) => /^fonts\/main\.woff2 sha256:[0-9a-f]{12}$/.test(f))) problems.push(`fonts: expected the main frame's font file by its path under the base, with a hash, got ${JSON.stringify(one.files)}`);
      if (!one.frame_files.some((f) => f.includes("frame-a.woff2")) || !three.frame_files.some((f) => f.includes("frame-b.woff2"))) problems.push(`fonts: expected the frame's font files listed apart, got ${JSON.stringify(one.frame_files)} and ${JSON.stringify(three.frame_files)}`);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs's fingerprint on the good site built for ${base}: it moves with an installed font's version, not with a frame's font or the port${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

const labels = YAML.parse(await readFile(join(HERE, "labels.yml"), "utf8"));
const table = await readTable(join(HERE, "locators.yml"), theme.side);
const drawn = await readDrawn(join(HERE, "drawn.yml"), theme.side);
const work = await mkdtemp(join(tmpdir(), "harness-selftest-"));
let bad = 0;
try {
  if (!write) {
    const problems = await unitChecks();
    bad += problems.length;
    if (problems.length) annotate("error", ["self-test: the unit cases", ...problems]);
  }
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
      const warned = await faultCheck(join(into, "good"), base);
      bad += warned.length;
      if (warned.length) annotate("error", [`self-test: run.mjs's warning for a problem with the metrics, on the good site built for ${base}`, ...warned]);
      // the source labels and the fingerprint read no base: once is enough
      if (base === BASES[0]) {
        for (const [what, c] of [["run.mjs without --labels", lecturesCheck], ["run.mjs's fingerprint", fontCheck]]) {
          const found = await c(join(into, "good"), base);
          bad += found.length;
          if (found.length) annotate("error", [`self-test: ${what}, on the good site built for ${base}`, ...found]);
        }
      }
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
if (!write) console.log(bad ? "the self-test failed: the harness does not read its fixtures as expected" : "the self-test passed");
if (!write && !bad) annotate("notice", [`self-test passed: both fixture sites read as expected at ${BASES.join(" and ")}, their rows, their drawn counts and their metrics`]);
process.exit(bad ? 1 : 0);
