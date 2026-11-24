// Helpers every check uses: viewports, page loads with one retry, settling, counting a locator, fetching a link.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.

// #15's three viewports, and `wide`, where the Sphinx theme hides a feature at 1280 (bin/site-features.yml's header).
// Plain viewports, not emulated devices: no touch, no mobile user agent, device scale factor 1.
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  wide: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  phone: { width: 390, height: 844 },
};
export const PAGE_VIEWPORTS = ["desktop", "tablet", "phone"];

/** One line, at most `max` characters, for a CSV detail. */
export function oneLine(s, max = 400) {
  const t = String(s ?? "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Load `url`, once more after 3 s if the first try answers 5xx or fails to connect (the live sites have answered
 * 503 for a moment). Resolves to { ok, status, detail }; `ok` is a 2xx or 3xx final answer.
 */
export async function load(page, url) {
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
      const status = r ? r.status() : 0;
      if (status >= 500 && attempt === 1) { last = `answered ${status}`; await sleep(3000); continue; }
      return { ok: status > 0 && status < 400, status, detail: `${url} answered ${status}${attempt > 1 ? ` (second try; the first ${last})` : ""}` };
    } catch (e) {
      last = oneLine(e.message, 160);
      if (attempt === 2) return { ok: false, status: 0, detail: `${url} did not load: ${last}` };
      await sleep(3000);
    }
  }
}

/** Wait until the document stops changing: the element count and the page height hold for three polls 250 ms apart. */
export async function stableDom(page, { timeout = 10_000 } = {}) {
  await page.waitForFunction(() => {
    const w = window;
    const sig = `${document.getElementsByTagName("*").length}:${document.documentElement.scrollHeight}`;
    if (w.__harnessSig === sig) w.__harnessPolls = (w.__harnessPolls ?? 0) + 1;
    else { w.__harnessSig = sig; w.__harnessPolls = 0; }
    return w.__harnessPolls >= 3;
  }, undefined, { timeout, polling: 250 }).catch(() => {});
}

/** Network idle (bounded), web fonts, then a stable document. */
export async function settleBase(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  await stableDom(page);
}

// Visible as Playwright means it: a non-empty bounding box and no `visibility: hidden`.
const COUNT = (els) => [
  els.length,
  els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden"); }).length,
];

/** The locator's parts: a string is one unnamed part, a mapping is named parts, null is no locator. */
export function partsOf(locator) {
  if (locator == null) return null;
  return typeof locator === "string" ? [["", locator]] : Object.entries(locator);
}

/**
 * Count every part of a locator on the page: [{ name, selector, matched, visible }]. A selector the page cannot parse
 * throws, and the check that asked becomes an `error` row.
 */
export async function countParts(page, locator) {
  const out = [];
  for (const [name, selector] of partsOf(locator)) {
    const [matched, visible] = await page.locator(selector).evaluateAll(COUNT);
    out.push({ name, selector, matched, visible });
  }
  return out;
}

export function describeCounts(counts) {
  return counts.map((c) => `${c.name ? `${c.name} ` : ""}${c.matched} (${c.visible} visible)`).join("; ");
}

const answers = new Map(); // one result per URL for the run: fewer requests (to github.com above all), and a host that
                           // does not answer costs its time once, not once per check

/** Did the request get an answer about the link? Not when it failed to connect, was rate-limited (429) or hit a 5xx. */
export const answered = (r) => r.status > 0 && r.status !== 429 && r.status < 500;

/**
 * Fetch `url` from the page's browser context, following redirects; on a 429 or a 5xx, or a failure to connect, twice
 * more, after its Retry-After (at most 10 s) or 3 s and 6 s, each try given 15 s: at most about a minute for a host
 * that never answers. Resolves to { status, url, error, body? }; status 0 when no answer came. The result, answered
 * or not, is kept for the rest of the run, so each URL is asked for once.
 */
export async function fetchUrl(page, url, { body = false, method = "GET" } = {}) {
  const key = `${method} ${url}${body ? " +body" : ""}`;
  if (!answers.has(key)) answers.set(key, fetchOnce(page, url, body, method));
  return answers.get(key);
}

async function fetchOnce(page, url, body, method) {
  let out;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await page.context().request.fetch(url, { method, maxRedirects: 10, failOnStatusCode: false, timeout: 15_000 });
      out = { status: r.status(), url: r.url(), body: body ? await r.text().catch(() => "") : undefined, retried: attempt > 1 };
      if (answered(out) || attempt === 3) return out;
      await sleep(Math.min(10, Number(r.headers()["retry-after"]) || 3 * attempt) * 1000);
    } catch (e) {
      out = { status: 0, url, error: oneLine(e.message, 160) };
      if (attempt === 3) return out;
      await sleep(3000 * attempt);
    }
  }
  return out;
}

/** "a.b/c answers 200" for a detail, the URL shortened. */
export function said(url, r) {
  const u = String(url).replace(/^https?:\/\//, "");
  if (!r.status) return `${u} did not answer (${r.error})`;
  return `${u} answers ${r.status}${r.status === 429 ? " (rate-limited)" : ""}`;
}

/** Run `fn` with a time limit; a check that hangs becomes an error row rather than a hung job. */
export async function withTimeout(ms, fn, what) {
  let timer;
  try {
    return await Promise.race([fn(), new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`${what} took longer than ${ms / 1000} s`)), ms); })]);
  } finally { clearTimeout(timer); }
}

/**
 * A behaviour that meets the site in a state it cannot go on from (a control not shown, or not pressable, or a step
 * that leads nowhere) throws this: the row is `fail`, a fact about the site, where any other throw is an `error`,
 * a check that could not run.
 */
export class SiteFault extends Error {}

/**
 * Press a control as a reader would: it must be shown within 5 s and take the click within 10 s, else a SiteFault
 * says which. `target` is a Locator (its first match) or an ElementHandle.
 */
export async function press(target, what, { button, force, timeout = 10_000 } = {}) {
  const el = typeof target.first === "function" ? target.first() : target;
  const shown = typeof el.waitFor === "function"
    ? await el.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
    : await el.waitForElementState("visible", { timeout: 5000 }).then(() => true, () => false);
  if (!shown && !force) throw new SiteFault(`${what} is not shown, so it cannot be operated`);
  try {
    await el.click({ timeout, ...(button ? { button } : {}), ...(force ? { force } : {}) });
  } catch (e) {
    if (e?.name === "TimeoutError") throw new SiteFault(`${what} could not be pressed: ${oneLine(String(e.message).split("\n")[0], 160)}`);
    throw e;
  }
}

export { sleep };
