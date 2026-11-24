#!/usr/bin/env node
// The self-test: the harness run on two fixture sites whose rows are known, before it is run on the real one.
//
//   node tests/harness/selftest/run.mjs        (npm run selftest)
//
// good/ and bad/ are small static sites in this theme's markup, served under this site's base path like the real
// one. Each is checked with locators.yml, the format of ../locators.yml, through the same engine and theme.mjs as
// the real run, on the pages intro, typography, code_cells and long_cells, and its rows are compared with
// expected-<site>.csv: every row must be there with the same result, and where an expected row has a detail, the
// actual detail must contain it (an empty detail matches any). Between them the two sites give every check type a
// passing and a failing row, and every result: a working toggle and a broken one, an error marker, a console error,
// an overflowing page, a null locator (`none`), a locator that matches nothing (`absent`), a check that could not
// decide (`skip`), and a page that is missing (`error`). Exit 1 on any mismatch, so the job fails before the real run.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, parseCsv, toCsv } from "../lib/csv.mjs";
import { runChecks } from "../lib/engine.mjs";
import { serve } from "../lib/server.mjs";
import { readTable } from "../lib/table.mjs";
import theme from "../theme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = ["intro", "typography", "code_cells", "long_cells"];
const write = process.argv.includes("--print"); // print each site's rows as CSV, to write a new expected file by hand

async function check(name, table) {
  const server = await serve(join(HERE, name), theme.basePath);
  try {
    const site = { mode: "dir", base: server.base, url: server.url, origin: new URL(server.url).origin, publishedBase: theme.publishedBase };
    const { rows } = await runChecks({ theme, table, site, pages: PAGES, jobs: 4 });
    if (write) { process.stdout.write(`--- ${name}\n${toCsv(rows)}`); return 0; }
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
    for (const k of got.keys()) problems.push(`unexpected row: ${k} ${got.get(k).result}`);
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name}: ${want.length} expected rows, ${rows.length} written${problems.length ? `, ${problems.length} mismatch(es)` : ""}`);
    for (const p of problems) console.log(`       ${p}`);
    return problems.length;
  } finally {
    await server.close();
  }
}

const table = await readTable(join(HERE, "locators.yml"), theme.side);
let bad = 0;
for (const name of ["good", "bad"]) bad += await check(name, table);
if (!write) console.log(bad ? "the self-test failed: the harness does not read its fixtures as expected" : "the self-test passed");
process.exit(bad ? 1 : 0);
