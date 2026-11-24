// The run: every site feature on its page, at its viewport, in both colour schemes; then the page-wide checks on every
// page at the three viewports, in both schemes. Each check gets a fresh browser context, so nothing one check writes
// (`localStorage`, a cookie, the scroll position) reaches another, and on the live sites, which share the origin
// quantecon.github.io, nothing one site writes reaches the other's checks.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd. What differs
// between the two sites is in theme.mjs: how a page is addressed, how a colour scheme is set and checked, what an
// error marker looks like, and how each feature's behaviour is exercised.
import { chromium } from "@playwright/test";
import { SCHEMES } from "./csv.mjs";
import { PAGE_VIEWPORTS, VIEWPORTS, countParts, describeCounts, fetchUrl, load, oneLine, partsOf, withTimeout } from "./util.mjs";

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
      const c = {
        page, context: ctx, feature: f, scheme, viewport: f.viewport, site, theme, url, counts,
        load: w.snapshot(),
        selector: selectorOf,
        part: (name = "") => page.locator(selectorOf(name)),
        fetch: (u, o) => fetchUrl(page, u, o),
        pageUrl: (stem) => site.url + theme.pagePath(stem),
        reload: async (target = page.url()) => { const n = await load(page, target); if (!n.ok) throw new Error(n.detail); await theme.settle(page); },
      };
      try {
        res = await withTimeout(120_000, () => impl(c), "the behaviour");
        if (!res || !["pass", "fail", "skip", "error"].includes(res.result)) throw new Error(`the behaviour gave no result (${JSON.stringify(res)})`);
      } catch (e) {
        res = { result: "error", detail: `the behaviour threw: ${oneLine(e.message, 240)}` };
      }
    }
    rows.push({ ...base, check: "behaviour", result: res.result, detail: oneLine(res.detail, 600) });
    return rows;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function pageTask(browser, run, stem, viewport, scheme) {
  const { theme, site } = run;
  const base = { page: stem, family: "page", viewport, scheme };
  const checks = ["error-marker", "console", "overflow"];
  const ctx = await newContext(browser, theme, viewport, scheme, site.origin);
  try {
    const page = await ctx.newPage();
    const w = watch(page);
    const nav = await load(page, site.url + theme.pagePath(stem));
    if (!nav.ok) return rowsOf(base, checks, "error", `the page did not load: ${nav.detail}`);
    await theme.settle(page);
    const snap = w.snapshot();
    const sch = await theme.verifyScheme(page, scheme);
    if (!sch.ok) return rowsOf(base, checks, "error", `the ${scheme} scheme did not take effect: ${sch.detail}`);
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
    return rows;
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
 * Resolves to { rows, browserVersion }, the rows in the order: features in the table's order (light, then dark;
 * present, then behaviour), then pages in the site's order (desktop, tablet, phone; light, then dark).
 */
export async function runChecks({ theme, table, site, pages, jobs = 4, only = null, pageChecks = true, onTask = () => {} }) {
  const browser = await chromium.launch(process.env.HARNESS_CHROMIUM ? { executablePath: process.env.HARNESS_CHROMIUM } : {});
  site = { ...site, pages };
  const run = { theme, site, pages };
  try {
    const tasks = [];
    for (const f of table.features) {
      if (only && !only.has(f.id)) continue;
      for (const scheme of SCHEMES) tasks.push(async () => { const r = await featureTask(browser, run, f, scheme); onTask(`${f.id} ${scheme}`, r); return r; });
    }
    if (pageChecks) {
      for (const stem of pages) for (const viewport of PAGE_VIEWPORTS) for (const scheme of SCHEMES) {
        tasks.push(async () => { const r = await pageTask(browser, run, stem, viewport, scheme); onTask(`${stem} ${viewport} ${scheme}`, r); return r; });
      }
    }
    const rows = (await pool(tasks, jobs)).flat();
    return { rows, browserVersion: browser.version() };
  } finally {
    await browser.close().catch(() => {});
  }
}
