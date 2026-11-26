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
// each build of the good site: served at the base it was built for, it checks it; at the other base, its build-base
// check stops it with exit 2. Exit 1 on any mismatch, so the job fails before the real run. In GitHub Actions each
// site's mismatches are also an ::error:: annotation, so the run's annotations say what CI read.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, parseCsv, toCsv } from "../lib/csv.mjs";
import { runChecks } from "../lib/engine.mjs";
import { serve } from "../lib/server.mjs";
import { readTable } from "../lib/table.mjs";
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

async function check(name, dir, base, table) {
  const server = await serve(dir, base);
  try {
    const site = { mode: "dir", base: server.base, url: server.url, origin: new URL(server.url).origin, publishedBase: new URL(server.base, theme.publishedBase).href };
    const { rows } = await runChecks({ theme, table, site, order: PAGES, jobs: 4 });
    if (write) { process.stdout.write(`--- ${name} at ${base}\n${toCsv(rows)}`); return []; }
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
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name} at ${base}: ${want.length} expected rows, ${rows.length} written${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
    for (const p of problems) console.log(`       ${p}`);
    return problems;
  } finally {
    await server.close();
  }
}

// run.mjs on a build of the good site, one feature, no page-wide checks: the exit status and what it says on stderr
async function baseCheck(dir, built) {
  const out = await mkdtemp(join(tmpdir(), "harness-selftest-out-"));
  const env = { ...process.env };
  delete env.GITHUB_STEP_SUMMARY; // this run's summary is not the job's
  const run = (base) => spawnSync(process.execPath, [join(HERE, "..", "run.mjs"), "--dir", dir, "--base-path", base,
    "--table", join(HERE, "locators.yml"), "--only", "header-title", "--no-pages", "--quiet", "--out", out], { encoding: "utf8", env });
  const other = BASES.find((b) => b !== built);
  const problems = [];
  try {
    const right = run(built), wrong = run(other);
    if (right.status !== 0) problems.push(`built for ${built}, at ${built}: expected exit 0, got ${right.status} (${right.stderr.trim().split("\n").pop()})`);
    if (wrong.status !== 2 || !/was not built for the base/.test(wrong.stderr)) problems.push(`built for ${built}, at ${other}: expected exit 2 from the build-base check, got ${wrong.status} (${wrong.stderr.trim().split("\n").pop()})`);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} run.mjs's build-base check: the good site built for ${built} runs at ${built} and stops at ${other}${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
  for (const p of problems) console.log(`       ${p}`);
  return problems;
}

const table = await readTable(join(HERE, "locators.yml"), theme.side);
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
      if (problems.length) annotate("error", [`self-test: run.mjs's build-base check`, ...problems]);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
if (!write) console.log(bad ? "the self-test failed: the harness does not read its fixtures as expected" : "the self-test passed");
if (!write && !bad) annotate("notice", [`self-test passed: both fixture sites read as expected at ${BASES.join(" and ")}`]);
process.exit(bad ? 1 : 0);
