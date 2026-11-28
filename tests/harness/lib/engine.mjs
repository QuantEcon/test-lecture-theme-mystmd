// The run: every site feature on its page, at its viewport, in both colour schemes; then the page-wide checks on every
// page at the three viewports, in both schemes, and in the same page loads the families' drawn counts (D18) and the
// style metrics of every surface they count as shown (D19). Each check gets a fresh browser context, so nothing one
// check writes
// (`localStorage`, a cookie, the scroll position) reaches another, and on the live sites, which share the origin
// quantecon.github.io, nothing one site writes reaches the other's checks.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd. What differs
// between the two sites is in theme.mjs: how a page is addressed, how a colour scheme is set and checked, what an
// error marker looks like, and how each feature's behaviour is exercised.
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { SCHEMES } from "./csv.mjs";
import { PAGE_VIEWPORTS, VIEWPORTS, SiteFault, countDrawn, countParts, describeCounts, fetchUrl, load, oneLine, partsOf, withTimeout } from "./util.mjs";
import { bodyText, fontFile, labelOf, mathsEngines, measureDrawn, metricRow, renderedFonts } from "./visual.mjs";

const HYDRATION = /hydrat|did not match|server rendered HTML|Minified React error #(418|419|421|422|423|425)/i;

function watch(page) {
  const log = { console: [], pageErrors: [], failed: [] };
  page.on("console", (m) => log.console.push({ type: m.type(), text: m.text(), url: m.location()?.url ?? "" }));
  page.on("pageerror", (e) => log.pageErrors.push(String(e?.message ?? e)));
  page.on("response", (r) => { if (r.status() >= 400) log.failed.push({ url: r.url(), status: r.status(), type: r.request().resourceType() }); });
  page.on("requestfailed", (q) => log.failed.push({ url: q.url(), status: 0, type: q.resourceType(), error: q.failure()?.errorText ?? "" }));
  return { log, snapshot: () => ({ console: [...log.console], pageErrors: [...log.pageErrors], failed: [...log.failed] }) };
}

/** Console errors, hydration warnings and uncaught page errors, as one list of strings. */
export function consoleProblems(snap) {
  const out = [];
  for (const m of snap.console) {
    if (m.type === "error" || (m.type === "warning" && HYDRATION.test(m.text))) {
      const where = /Failed to load resource/.test(m.text) && m.url ? ` (${m.url})` : "";
      out.push(`${m.type === "error" ? "" : "warning: "}${m.text}${where}`);
    }
  }
  for (const e of snap.pageErrors) out.push(`uncaught: ${e}`);
  return out;
}

async function newContext(browser, theme, viewport, scheme, origin) {
  return browser.newContext({
    viewport: VIEWPORTS[viewport],
    permissions: ["clipboard-read", "clipboard-write"],
    ...theme.contextOptions(scheme, origin),
  });
}

function rowsOf(base, checks, result, detail) {
  return checks.map((check) => ({ ...base, check, result, detail }));
}

/**
 * The page's drawn counts not taken: an empty count for every family, and one `uncounted` entry saying why. No
 * metrics rows: a reading not counted is not measured, and provenance's `uncounted` says why for both.
 */
function notTaken(drawn, where, why) {
  if (!drawn) return { counts: [], uncounted: [] };
  return {
    counts: drawn.counted.map((f) => ({ ...where, family: f.id, drawn: "", shown: "" })),
    uncounted: [{ ...where, family: null, why }],
    metrics: [],
  };
}

async function featureTask(browser, run, f, scheme) {
  const { theme, site } = run;
  const base = { page: f.page, family: f.id, viewport: f.viewport, scheme };
  const checks = f.behaviour ? ["present", "behaviour"] : ["present"];
  const ctx = await newContext(browser, theme, f.viewport, scheme, site.origin);
  try {
    const page = await ctx.newPage();
    const w = watch(page);
    const url = site.url + theme.pagePath(f.page);
    const nav = await load(page, url);
    if (!nav.ok) return rowsOf(base, checks, "error", `the page did not load: ${nav.detail}`);
    await theme.settle(page);
    const sch = await theme.verifyScheme(page, scheme);
    if (!sch.ok) return rowsOf(base, checks, "error", `the ${scheme} scheme did not take effect: ${sch.detail}`);
    const rows = [];
    let counts = null;
    if (f.locator == null) rows.push({ ...base, check: "present", result: "none", detail: "no locator: this site has no counterpart (null in the locator table)" });
    else {
      try {
        counts = await countParts(page, f.locator);
        rows.push({ ...base, check: "present", result: counts[0].matched ? "pass" : "absent", detail: describeCounts(counts) });
      } catch (e) {
        rows.push({ ...base, check: "present", result: "error", detail: `the locator could not be counted: ${oneLine(e.message, 200)}` });
      }
    }
    if (!f.behaviour) return rows;
    const impl = theme.behaviours[f.id];
    let res;
    if (f.locator == null && !impl?.withoutLocator) res = { result: "none", detail: "no locator: nothing to exercise" };
    else if (!impl) res = { result: "skip", detail: "no automated behaviour for this feature in this run: a person exercises it" };
    else if (counts && !counts[0].matched && !impl.withoutElement) res = { result: "skip", detail: "nothing to exercise: the locator matched nothing" };
    else if (f.locator != null && !counts) res = { result: "error", detail: "the locator could not be counted, so nothing was exercised" };
    else {
      const selectorOf = (name = "") => {
        const hit = (partsOf(f.locator) ?? []).find(([n]) => n === name) ?? (name === "" ? partsOf(f.locator)?.[0] : undefined);
        if (!hit) throw new Error(`the locator has no part "${name}"`);
        return hit[1];
      };
      // the behaviour's time budget: its fetches stop retrying before it, well inside the 120 s limit below
      const deadline = Date.now() + 100_000;
      const c = {
        page, context: ctx, feature: f, scheme, viewport: f.viewport, site, theme, url, counts, deadline,
        load: w.snapshot(),
        selector: selectorOf,
        part: (name = "") => page.locator(selectorOf(name)),
        fetch: (u, o) => fetchUrl(page, u, { ...o, deadline }),
        pageUrl: (stem) => site.url + theme.pagePath(stem),
        reload: async (target = page.url()) => { const n = await load(page, target); if (!n.ok) throw new Error(n.detail); await theme.settle(page); },
      };
      try {
        res = await withTimeout(120_000, () => impl(c), "the behaviour");
        if (!res || !["pass", "fail", "skip", "error"].includes(res.result)) throw new Error(`the behaviour gave no result (${JSON.stringify(res)})`);
      } catch (e) {
        res = e instanceof SiteFault ? { result: "fail", detail: oneLine(e.message, 400) }
          : { result: "error", detail: `the behaviour threw: ${oneLine(e.message, 240)}` };
      }
    }
    rows.push({ ...base, check: "behaviour", result: res.result, detail: oneLine(res.detail, 600) });
    return rows;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// The page-wide checks on one page at one reading, then the drawn counts in the same load, and with them, when
// `run.metrics`, each shown surface's metrics: { rows, counts, uncounted, metrics, faults, fonts }. A page that does
// not load, or whose scheme does not take effect, gives error rows, empty counts and no metrics; a selector that
// throws gives that family an empty count, no metrics and an `uncounted` entry, which makes the run exit 1. `faults`
// names each metrics problem, a warning that never fails the run, by kind: `measures` (a surface's measures threw: its row is written with them empty),
// `key` (its source threw: its row has no key) and `body text` (the page's body text could not be read: its rows have
// no body measures). A measuring evaluation that throws for any other reason than its selector leaves the count to
// countDrawn, as without metrics, and is a `measures` problem; the count is never lost to the metrics. `fonts` is
// what the measured text rendered with, the font files the page's main frame loaded (each with the SHA-256 of its
// bytes) and those its frames loaded, and the maths engines, for provenance's environment.
async function pageTask(browser, run, stem, viewport, scheme) {
  const { theme, site, drawn } = run;
  const base = { page: stem, family: "page", viewport, scheme };
  const where = { page: stem, viewport, scheme };
  const checks = ["error-marker", "console", "overflow"];
  const ctx = await newContext(browser, theme, viewport, scheme, site.origin);
  try {
    const page = await ctx.newPage();
    const w = watch(page);
    const fontFiles = new Set(), frameFonts = new Set(), fontBodies = [];
    if (run.metrics) page.on("response", (r) => {
      if (r.request().resourceType() !== "font") return;
      fontBodies.push((async () => {
        try {
          const name = fontFile(r.url(), site);
          const body = await r.body().catch(() => null);
          (r.frame() === page.mainFrame() ? fontFiles : frameFonts).add(body ? `${name} sha256:${createHash("sha256").update(body).digest("hex").slice(0, 12)}` : name);
        } catch {}
      })());
    });
    const nav = await load(page, site.url + theme.pagePath(stem));
    if (!nav.ok) {
      const why = `the page did not load: ${nav.detail}`;
      return { rows: rowsOf(base, checks, "error", why), ...notTaken(drawn, where, why) };
    }
    await theme.settle(page);
    const snap = w.snapshot();
    const sch = await theme.verifyScheme(page, scheme);
    if (!sch.ok) {
      const why = `the ${scheme} scheme did not take effect: ${sch.detail}`;
      return { rows: rowsOf(base, checks, "error", why), ...notTaken(drawn, where, why) };
    }
    const rows = [];
    try {
      const m = await theme.errorMarkers(page);
      rows.push({ ...base, check: "error-marker", result: m.count ? "fail" : "pass", detail: m.count ? oneLine(m.detail, 600) : `none of: ${theme.markerNames}` });
    } catch (e) {
      rows.push({ ...base, check: "error-marker", result: "error", detail: `the markers could not be read: ${oneLine(e.message, 200)}` });
    }
    const problems = consoleProblems(snap);
    rows.push({
      ...base, check: "console", result: problems.length ? "fail" : "pass",
      detail: problems.length ? oneLine(`${problems.length} on load: ${problems.slice(0, 4).map((p) => oneLine(p, 180)).join(" | ")}${problems.length > 4 ? " | …" : ""}`, 900) : "no console error, hydration warning or uncaught error on load",
    });
    try {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      rows.push({ ...base, check: "overflow", result: o.sw > o.cw ? "fail" : "pass", detail: `scrollWidth ${o.sw} ${o.sw > o.cw ? ">" : "<="} clientWidth ${o.cw}` });
    } catch (e) {
      rows.push({ ...base, check: "overflow", result: "error", detail: `the widths could not be read: ${oneLine(e.message, 200)}` });
    }
    // the drawn counts: after settling, the scheme check and the error markers, in this load; one evaluation per
    // family, which with the metrics also measures every surface it counts as shown, so the two always agree
    const counts = [], uncounted = [], metrics = [], faults = [];
    let body = null;
    if (run.metrics && drawn) {
      try { body = await bodyText(page, theme); } catch (e) { faults.push({ ...where, kind: "body text", family: null, n: null, why: `the body text could not be read: ${oneLine(e.message, 200)}` }); }
    }
    const labels = new Set((run.labels?.[stem] ?? []).map(labelOf));
    for (const f of drawn?.counted ?? []) {
      try {
        let c = null, measureError = null;
        if (run.metrics) { try { c = await measureDrawn(page, f.selector, theme); } catch (e) { measureError = e; } }
        // a selector that throws throws here too, as without metrics; then it is the count's fault, not the metrics'
        c ??= await countDrawn(page, f.selector);
        if (measureError) faults.push({ ...where, kind: "measures", family: f.id, n: null, why: `the measuring evaluation threw, so the family's surfaces have no rows: ${oneLine(measureError.message, 200)}` });
        counts.push({ ...where, family: f.id, drawn: c.drawn, shown: c.shown });
        for (const s of c.surfaces ?? []) {
          try { metrics.push(metricRow(where, f.id, s, body, labels)); }
          catch (e) { faults.push({ ...where, kind: "measures", family: f.id, n: s.n, why: `the row could not be made: ${oneLine(e.message, 200)}` }); continue; }
          if (s.fault) faults.push({ ...where, kind: "measures", family: f.id, n: s.n, why: `the measures threw: ${oneLine(s.fault, 200)}` });
          if (s.keyFault) faults.push({ ...where, kind: "key", family: f.id, n: s.n, why: `the key's source threw: ${oneLine(s.keyFault, 200)}` });
        }
      } catch (e) {
        counts.push({ ...where, family: f.id, drawn: "", shown: "" });
        uncounted.push({ ...where, family: f.id, why: `the selector threw: ${oneLine(e.message, 200)}` });
      }
    }
    // the fonts the measured text rendered with, and the maths engines; a failure to read them is recorded, and is no
    // fault of the metrics
    let fonts = null;
    if (run.metrics && drawn) {
      await Promise.allSettled(fontBodies);
      fonts = { rendered: [], files: [...fontFiles], frames: [...frameFonts], engines: null, error: null };
      try { fonts.rendered = [...await renderedFonts(page)]; } catch (e) { fonts.error = oneLine(e.message, 200); }
      try { fonts.engines = await mathsEngines(page); } catch (e) { fonts.error ??= oneLine(e.message, 200); }
    }
    return { rows, counts, uncounted, metrics, faults, fonts };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function pool(tasks, jobs) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, worker));
  return results;
}

/**
 * Run every check. `site` is { url, origin, publishedBase, mode, base }: `url` the site's base URL, ending in "/".
 * `order` is every page of the site in its order, which the behaviours read (another page, previous and next, the
 * contents); `pages` the pages to give the page-wide checks, by default all of them. `drawn` is the drawn table
 * (table.mjs's readDrawn), or null for no counts; the counts are taken in the page-wide checks' loads, so none are
 * taken without them. `metrics` (default true) measures every surface the counts find shown; none without counts.
 * `labels` is each page's source labels ({ page: [label, …] }, visual.mjs's sourceLabels), the only ids a key takes.
 * Resolves to { rows, counts, uncounted, metrics, faults, fonts, browserVersion }, the rows in the order: features in
 * the table's order (light, then dark; present, then behaviour), then pages in the site's order (desktop, tablet,
 * phone; light, then dark); the counts in the pages' order, then the families in the drawn table's order; `uncounted`
 * each reading not taken, {page, viewport, scheme, family (null for the whole page), why}; the metrics in the counts'
 * order, then by `n`; `faults` each metrics problem, {page, viewport, scheme, kind, family, n, why}; `fonts` every
 * page reading's {rendered, files, frames, engines, error}, or null without metrics.
 */
export async function runChecks({ theme, table, drawn = null, site, order, pages = order, jobs = 4, only = null, pageChecks = true, metrics = true, labels = {}, onTask = () => {} }) {
  const browser = await chromium.launch(process.env.HARNESS_CHROMIUM ? { executablePath: process.env.HARNESS_CHROMIUM } : {});
  site = { ...site, pages: order };
  const run = { theme, site, drawn, metrics: metrics && !!drawn, labels };
  try {
    const tasks = [];
    for (const f of table.features) {
      if (only && !only.has(f.id)) continue;
      for (const scheme of SCHEMES) tasks.push(async () => { const rows = await featureTask(browser, run, f, scheme); onTask(`${f.id} ${scheme}`, rows); return { rows }; });
    }
    if (pageChecks) {
      for (const stem of pages) for (const viewport of PAGE_VIEWPORTS) for (const scheme of SCHEMES) {
        tasks.push(async () => { const r = await pageTask(browser, run, stem, viewport, scheme); onTask(`${stem} ${viewport} ${scheme}`, r.rows); return r; });
      }
    }
    const done = await pool(tasks, jobs);
    return {
      rows: done.flatMap((r) => r.rows),
      counts: done.flatMap((r) => r.counts ?? []),
      uncounted: done.flatMap((r) => r.uncounted ?? []),
      metrics: done.flatMap((r) => r.metrics ?? []),
      faults: done.flatMap((r) => r.faults ?? []),
      fonts: run.metrics ? done.map((r) => r.fonts).filter(Boolean) : null,
      browserVersion: browser.version(),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
