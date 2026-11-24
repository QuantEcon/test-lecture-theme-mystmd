// The behaviours both themes share, written once and given each theme's selectors by theme.mjs.
// Each resolves to { result: "pass" | "fail" | "skip", detail }; a throw becomes an `error` row.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { SiteFault, answered, oneLine, press, said, sleep } from "./util.mjs";

export const pass = (detail) => ({ result: "pass", detail });
export const fail = (detail) => ({ result: "fail", detail });
export const skip = (detail) => ({ result: "skip", detail });
export const yes = (b) => (b ? "yes" : "no");

/** The neighbouring page in the site's order, for "open another page". */
export function otherPage(c) {
  const i = c.site.pages.indexOf(c.feature.page);
  return c.site.pages[i + 1] ?? c.site.pages[i - 1];
}

const darkNow = (page, sel) => page.locator(sel).count().then((n) => n > 0);
const word = (dark) => (dark ? "dark" : "light");

/**
 * Toggle; open another page; reload; then change the operating system's colour scheme to the opposite of the
 * reader's choice. Passes when the toggle switches the page and the choice holds through the three.
 */
export async function darkModeFlow(c, { toggle = "toggle", dark }) {
  const { page } = c;
  const start = await darkNow(page, dark);
  await press(c.part(toggle), "the toggle");
  await sleep(500);
  const choice = !start;
  if ((await darkNow(page, dark)) !== choice) return fail(`the toggle did not switch the page: it stayed ${word(start)}`);
  const other = otherPage(c);
  await c.reload(c.pageUrl(other));
  const onOther = await darkNow(page, dark);
  await c.reload(c.url);
  const reloaded = await darkNow(page, dark);
  // An operating-system change to the opposite of the choice. Going through the choice first makes sure the last
  // step is a change, whatever the emulated scheme was, so a theme that listens for it hears one.
  const target = choice ? "light" : "dark";
  await page.emulateMedia({ colorScheme: word(choice) });
  await sleep(300);
  await page.emulateMedia({ colorScheme: target });
  await sleep(700);
  const afterOs = await darkNow(page, dark);
  const detail = `toggled from ${word(start)} to ${word(choice)}; on ${other}: ${word(onOther)}; after a reload: ${word(reloaded)}; `
    + `after an operating-system change to ${target}: ${word(afterOs)}`;
  return onOther === choice && reloaded === choice && afterOs === choice ? pass(detail) : fail(detail);
}

/** Press the control; full screen is entered; press the same element again; it is left. */
export async function fullscreenFlow(c, label) {
  const { page } = c;
  const el = await c.part().first().elementHandle();
  const before = await label(el);
  await press(el, "the full-screen control");
  await sleep(700);
  const entered = await page.evaluate(() => !!document.fullscreenElement);
  const between = await label(el);
  await press(el, "the full-screen control, the second time");
  await sleep(700);
  const left = await page.evaluate(() => !document.fullscreenElement);
  const detail = `first press: full screen ${entered ? "entered" : "not entered"}; second press, on the same element: `
    + `${left ? "left" : "still in full screen"}; the control's label: "${before}", then "${between}"`;
  return entered && left ? pass(detail) : fail(detail);
}

/** Increase once: the text grows; the size holds on another page and after a reload. */
export async function fontSizeFlow(c, { increase = "increase", text }) {
  const { page } = c;
  const size = () => page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().length > 20);
    return e ? parseFloat(getComputedStyle(e).fontSize) : null;
  }, text);
  const before = await size();
  if (before == null) return skip(`no text to measure (${text})`);
  await press(c.part(increase), "the increase control");
  await sleep(500);
  const after = await size();
  if (!(after > before)) return fail(`one press of increase left the text at ${before}px`);
  const other = otherPage(c);
  await c.reload(c.pageUrl(other));
  const onOther = await size();
  await c.reload(c.url);
  const reloaded = await size();
  const same = (x) => x != null && Math.abs(x - after) < 0.25;
  const detail = `text ${before}px, ${after}px after one press; on ${other}: ${onOther}px; after a reload: ${reloaded}px`;
  return same(onOther) && same(reloaded) ? pass(detail) : fail(detail);
}

/** Fetch each URL: [{ url, status, ok, answered }], ok meaning 2xx after redirects. */
export async function fetchAll(c, urls) {
  const out = [];
  for (const u of urls) {
    const r = await c.fetch(u);
    out.push({ url: u, status: r.status, error: r.error, ok: r.status >= 200 && r.status < 300, answered: answered(r), said: said(u, r) });
  }
  return out;
}

/** pass when every link answered 200, skip when one got no answer (a person checks it), else fail. */
export function verdictOf(words, results, ok = results.every((r) => r.status === 200)) {
  if (results.some((r) => !answered(r))) return skip(`${words}; a link got no answer, so a person checks it`);
  return ok ? pass(words) : fail(words);
}

const pageCache = new Map();
/** Does `href`, resolved against the page, lead to an element with its fragment's id? */
export async function targetExists(c, href) {
  const u = new URL(href, c.page.url());
  const here = new URL(c.page.url());
  const frag = decodeURIComponent(u.hash.slice(1));
  const samePage = u.origin === here.origin && u.pathname === here.pathname;
  if (samePage) {
    if (!frag) return { ok: true, how: "this page" };
    const ok = await c.page.evaluate((id) => !!document.getElementById(id), frag);
    return { ok, how: `#${frag} on this page` };
  }
  const key = u.href.replace(/#.*$/, "");
  if (!pageCache.has(key)) pageCache.set(key, await c.fetch(key, { body: true }));
  const r = pageCache.get(key);
  if (!answered(r)) return { ok: null, how: said(key, r) };
  if (!(r.status >= 200 && r.status < 300)) return { ok: false, how: said(key, r) };
  if (!frag) return { ok: true, how: `${u.pathname} answers ${r.status}` };
  const esc = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "(?:&|&amp;)");
  const ok = new RegExp(`\\sid=["']?${esc}["'\\s>]`).test(r.body);
  return { ok, how: `#${frag} on ${u.pathname}` };
}

// The hover cards a theme may show: Radix (mystmd), tippy (Sphinx's toolbar), plain tooltips.
const CARDS = '[data-radix-popper-content-wrapper], [role="tooltip"], .tippy-box, [data-state="open"][role="dialog"], .hover-card';

/** Hover the element; what card shows, if any (its text, shortened). */
export async function hoverCard(c, locator) {
  const { page } = c;
  await page.mouse.move(0, 0);
  await sleep(200);
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await sleep(1200);
  const text = await page.evaluate((sel) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden"); };
    const cards = [...document.querySelectorAll(sel)].filter(vis).map((e) => e.textContent.trim()).filter(Boolean);
    return cards.join(" / ");
  }, CARDS);
  const title = await locator.getAttribute("title");
  return { shown: !!text, text: oneLine(text, 120), title: title ? oneLine(title, 120) : null };
}

/** Is any part of the element inside the viewport? */
export async function inView(page, selectorOrHandle) {
  const fn = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (r.width > 0 || r.height > 0); };
  return typeof selectorOrHandle === "string" ? page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }, selectorOrHandle) : selectorOrHandle.evaluate(fn);
}

/** The clipboard's text, read through the page (the context grants clipboard-read). */
export async function clipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText()).catch((e) => `(clipboard unreadable: ${e.message})`);
}

/**
 * The collapse bar: capped on load, the bar expands the block to its full height, and a second press caps it again.
 * `block` is the element whose height the bar changes; `bar` the bar; both handles.
 */
export async function collapseFlow(c, block, bar) {
  const h = () => block.evaluate((e) => Math.round(e.getBoundingClientRect().height));
  const capped = await h();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await press(bar, "the bar");
  await sleep(700);
  const expanded = await h();
  await press(bar, "the bar, the second time");
  await sleep(900);
  const again = await h();
  const detail = `on load ${capped}px; after the bar ${expanded}px; after a second press ${again}px`;
  const ok = expanded > capped + 2 && Math.abs(again - capped) <= 2;
  return ok ? pass(detail) : fail(detail);
}

/** Visible text of the element, or null. */
export async function visibleText(handle) {
  return handle.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const vis = r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden");
    return vis ? e.innerText.trim() : null;
  });
}

/** The page's, a paragraph's and a link's colours. */
export async function colours(page, { surface, text, link }) {
  return page.evaluate(({ surface, text, link }) => {
    const pick = (sel) => document.querySelector(sel);
    const bg = (e) => {
      for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c; }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const s = pick(surface), t = pick(text), l = pick(link);
    return { page: s ? bg(s) : null, text: t ? getComputedStyle(t).color : null, link: l ? getComputedStyle(l).color : null };
  }, { surface, text, link });
}

/** Overlap of two boxes, in px², and the boxes. */
export async function overlap(page, a, b) {
  return page.evaluate(([a, b]) => {
    const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden") ? r : null; };
    const ra = vis(document.querySelector(a)), rb = vis(document.querySelector(b));
    if (!ra || !rb) return { area: null, a: !!ra, b: !!rb };
    const w = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
    const h = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
    return { area: Math.round(w * h), aBox: [Math.round(ra.left), Math.round(ra.right)], bBox: [Math.round(rb.left), Math.round(rb.right)] };
  }, [a, b]);
}

// ---- the behaviours that read the same on both themes, given the theme's profile -------------------------------
// profile: { text: the lecture text's container, para: its paragraphs, stemOf(href, base): a link's page stem,
//            maths: { all: every rendered expression, menu: the expression's context menu, or null } }

/** The notebook a launch target opens: Colab's GitHub path, as a github.com page. */
export function notebookOf(target) {
  const m = String(target).match(/^https:\/\/colab\.research\.google\.com\/github\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/blob/${m[3]}/${m[4]}` : target;
}

/** Fetch each launch target's notebook: [verdict, words]. */
export async function launchTargets(c, targets) {
  if (!targets.length) return fail("the control lists no target");
  const nb = `${c.feature.page}.ipynb`;
  const words = [], results = [];
  let ok = true;
  for (const o of targets) {
    const notebook = notebookOf(o.url);
    const r = await c.fetch(notebook); // a notebook two targets name is fetched once (fetchUrl keeps each result)
    const names = notebook.split(/[?#]/)[0].endsWith(`/${nb}`);
    ok &&= names && r.status === 200;
    results.push(r);
    words.push(`${o.label}: ${names ? `names ${nb}` : `does not name ${nb}`}, ${said(notebook, r)}`);
  }
  return verdictOf(words.join("; "), results, ok);
}

/** Fetch each download link: does it name this page's notebook, and answer 200? */
export async function downloadLinks(c, hrefs) {
  if (!hrefs.length) return fail("no link to fetch");
  const words = [], results = [];
  let ok = true;
  for (const h of hrefs) {
    const u = new URL(h, c.page.url()).href;
    const r = await c.fetch(u);
    const names = u.split(/[?#]/)[0].endsWith(`/${c.feature.page}.ipynb`);
    ok &&= names && r.status === 200;
    results.push(r);
    words.push(`"${h}" resolves to ${said(u, r)}${names ? "" : ", not this page's notebook"}`);
  }
  return verdictOf(words.join("; "), results, ok);
}

async function linkTargets(c, hrefs) {
  const res = [];
  for (const h of hrefs) res.push({ href: h, ...(await targetExists(c, h)) });
  return res;
}

function tally(res) {
  const bad = res.filter((r) => r.ok === false), open = res.filter((r) => r.ok === null);
  return `${res.length - bad.length - open.length} of ${res.length} lead to their targets${bad.length ? `; not: ${bad.slice(0, 4).map((r) => `${r.href} (${r.how})`).join(", ")}` : ""}`
    + `${open.length ? `; unanswered: ${open.slice(0, 3).map((r) => `${r.href} (${r.how})`).join(", ")}` : ""}`;
}

const cardWords = (card) => `hover: ${card.shown ? `a card ("${card.text}")` : "no card"}${card.title ? `, the link's title "${card.title}"` : ""}`;

/**
 * Each matched reference leads to its target: through its link where it is one (or holds one), else through the
 * card hovering it shows. The first is hovered, and any card recorded.
 */
async function referencesFlow(c) {
  const hrefs = await c.part().evaluateAll((els) => els.map((e) => (e.matches("a[href]") ? e : e.querySelector("a[href]"))?.getAttribute("href") ?? null));
  const linked = hrefs.filter(Boolean);
  const res = await linkTargets(c, linked);
  const card = await hoverCard(c, c.part().first());
  const unlinked = hrefs.length - linked.length;
  const detail = `${linked.length ? tally(res) : "none is a link"}${unlinked && linked.length ? `; ${unlinked} not a link` : ""}; ${cardWords(card)}`;
  if (res.some((r) => r.ok === false) || (unlinked && !card.shown)) return fail(detail);
  if (res.some((r) => r.ok === null)) return skip(`${detail}; a target page got no answer, so a person checks it`);
  return pass(detail);
}

export function commonBehaviours(p) {
  const out = {
    fullscreen: (c) => fullscreenFlow(c, (el) => el.evaluate((e) => e.getAttribute("aria-label") || e.getAttribute("data-tippy-content") || e.textContent.trim())),

    "font-size": (c) => fontSizeFlow(c, { increase: "increase", text: p.para }),

    "dark-mode": (c) => darkModeFlow(c, { toggle: "toggle", dark: c.selector("dark") }),

    async "dark-palette"(c) {
      const col = await colours(c.page, { surface: p.text, text: p.para, link: `${p.para} a` });
      const seen = `page ${col.page}, text ${col.text}, link ${col.link}`;
      if (c.scheme === "light") return skip(`the feature is the dark scheme's: its locator, the dark marker, is absent in light by design. The light colours, for the visual layer's before and after: ${seen}`);
      return skip(`dark: ${seen}. No palette is expected until QuantEcon/quantecon-theme.mystmd#237 decides one; a person compares the two schemes in the visual layer`);
    },

    async "edit-on-github"(c) {
      const href = await c.part().first().getAttribute("href");
      const file = /\/(edit|blob)\//.test(href);
      const view = href.replace("/edit/", "/blob/");
      const r = await c.fetch(view);
      return verdictOf(`${file ? "names the page's file" : "names the repository"}: ${href}; ${said(view, r)}`, [r]);
    },

    async "in-page-outline"(c) {
      const { page } = c;
      await page.evaluate(() => window.scrollTo(0, 1500));
      await sleep(1200);
      const state = await page.evaluate(({ nav, active }) => {
        const n = document.querySelector(nav);
        const r = n?.getBoundingClientRect();
        const inView = !!r && r.bottom > 0 && r.top < innerHeight && r.width > 0;
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const act = [...document.querySelectorAll(active)].filter(vis).map((a) => a.textContent.trim().slice(0, 40));
        const depth = {};
        for (const a of n ? n.querySelectorAll('a[href*="#"]') : []) {
          const id = decodeURIComponent(a.hash.slice(1));
          const t = id && document.getElementById(id);
          const h = t && (t.matches("h1,h2,h3,h4,h5,h6") ? t : t.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6"));
          if (h) depth[h.tagName.toLowerCase()] = (depth[h.tagName.toLowerCase()] ?? 0) + 1;
        }
        return { inView, act, depth, y: Math.round(scrollY) };
      }, { nav: c.selector("nav"), active: c.selector("active") });
      const detail = `scrolled to ${state.y}px: the outline in view: ${yes(state.inView)}; active: ${state.act.length ? `"${state.act[0]}"` : "none"}; `
        + `entries by heading: ${Object.entries(state.depth).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`;
      return state.inView && state.act.length >= 1 && state.depth.h4 >= 1 ? pass(detail) : fail(detail);
    },

    async "back-navigation"(c) {
      const { page } = c;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      const title = await page.title();
      const start = page.url();
      const link = c.part().first();
      const href = await link.getAttribute("href");
      await press(link, `the outline entry "${href}"`);
      await sleep(900);
      const followed = page.url();
      await page.goBack();
      await sleep(1500);
      const after = { title: await page.title(), url: page.url(), text: await page.locator(p.text).count() };
      const detail = `followed "${href}" (${followed.replace(start.split("#")[0], "") || "the same address"}); Back: ${after.url === start ? "the page's address again" : after.url}; `
        + `title ${after.title === title ? "unchanged" : `now "${after.title}"`}; the lecture text ${after.text ? "present" : "gone"}; errors: ${errors.length ? oneLine(errors.join(" | "), 200) : "none"}`;
      return after.title === title && after.text && !errors.length ? pass(detail) : fail(detail);
    },

    async "previous-next"(c) {
      const links = await c.part().evaluateAll((ls) => ls.map((l) => ({ rel: l.getAttribute("rel"), href: l.getAttribute("href") })));
      const pages = c.site.pages;
      const i = pages.indexOf(c.feature.page);
      const want = { prev: pages[i - 1], next: pages[i + 1] };
      const words = [];
      let ok = true;
      for (const rel of ["prev", "next"]) {
        const l = links.find((x) => x.rel === rel);
        const got = l ? p.stemOf(l.href, c.page.url(), c.site) : null;
        ok &&= got === want[rel];
        words.push(`${rel}: ${l ? l.href : "none"}${got === want[rel] ? "" : ` (the site's order gives ${want[rel] ?? "none"})`}`);
      }
      return { result: ok ? "pass" : "fail", detail: words.join("; ") };
    },

    async "back-to-top"(c) {
      const { page } = c;
      await page.evaluate(() => window.scrollTo(0, Math.min(4000, document.documentElement.scrollHeight - innerHeight)));
      await sleep(1200);
      const link = c.part().first();
      await press(link, "scrolled down, the link");
      await sleep(1500);
      const t = await page.evaluate(() => { const e = document.getElementById("top"); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), y: Math.round(scrollY), h: innerHeight }; });
      if (!t) return fail("followed it; the page has no #top");
      const detail = `followed it: scrollY ${t.y}, #top at ${t.top}px from the viewport's top`;
      return t.top >= -2 && t.top < t.h ? pass(detail) : fail(detail);
    },

    async "last-changed"(c) {
      await press(c.part("toggle"), "the Last changed control");
      await sleep(800);
      const panel = c.part("panel").first();
      const shown = await panel.isVisible();
      const links = await panel.evaluate((x) => [...x.querySelectorAll("a[href]")].map((a) => a.href));
      const commits = links.filter((h) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\//.test(h));
      const elsewhere = links.filter((h) => !h.startsWith("https://github.com/"));
      const detail = `opened: ${yes(shown)}; ${commits.length} commit link(s) of ${links.length}${elsewhere.length ? `; not to GitHub: ${elsewhere.slice(0, 3).join(", ")}` : ", every link to GitHub"}`;
      return shown && commits.length && !elsewhere.length ? pass(detail) : fail(detail);
    },

    async "licence-footer"(c) {
      const text = oneLine(await c.part().first().evaluate((e) => {
        const footer = e.closest("footer");
        if (footer) return footer.innerText;
        let best = e.parentElement;
        for (let x = e.parentElement, i = 0; x && i < 6; x = x.parentElement, i++) {
          if (/licensed under/i.test(x.innerText)) { best = x; if (/A theme by/i.test(x.innerText)) break; }
        }
        return best?.innerText ?? "";
      }), 300);
      const licence = /licensed under a Creative Commons Attribution-ShareAlike 4\.0/i.test(text);
      const credit = /A theme by QuantEcon/i.test(text);
      const detail = `the licence sentence: ${yes(licence)}; the theme credit: ${yes(credit)}; the footer reads "${text}"`;
      return licence && credit ? pass(detail) : fail(detail);
    },

    async "page-meta"(c) {
      const m = await c.page.evaluate(() => ({
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        og: document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
        title: document.title,
        missing: [["property", "og:title"], ["property", "og:image"], ["property", "og:site_name"], ["name", "twitter:card"]]
          .filter(([a, k]) => !document.querySelector(`meta[${a}="${k}"]`)).map(([, k]) => k),
      }));
      const address = c.site.publishedBase + c.theme.pagePath(c.feature.page);
      const norm = (u) => (u ?? "").replace(/index\.html$/, "").replace(/\/$/, "");
      const ok = norm(m.canonical) === norm(address) && norm(m.og) === norm(address) && !m.missing.length && !!m.title;
      return { result: ok ? "pass" : "fail", detail: `the page's address ${address}; canonical ${m.canonical ?? "none"}; og:url ${m.og ?? "none"}; ${m.missing.length ? `missing ${m.missing.join(", ")}` : "og:title, og:image, og:site_name and twitter:card present"}` };
    },

    async favicon(c) {
      // "The page's icon link": where a page has several, browsers take the last (quantecon-theme.mystmd writes its
      // base-path link after the root route's for that reason), so that one decides; the others are recorded
      const hrefs = await c.part().evaluateAll((ls) => ls.map((l) => l.getAttribute("href")));
      const words = [], results = [];
      for (const h of hrefs) {
        const u = new URL(h, c.page.url()).href;
        const r = await c.fetch(u);
        results.push({ ...r, under: u.startsWith(c.site.url) });
        words.push(`"${h}": ${said(u, r)}${u.startsWith(c.site.url) ? "" : ", outside the site's base"}`);
      }
      const used = results[results.length - 1];
      const detail = hrefs.length > 1 ? `the icon link a browser uses, the last of ${hrefs.length}: ${words[words.length - 1]}; also ${words.slice(0, -1).join("; ")}` : words.join("; ");
      return verdictOf(detail, [used], used.status === 200 && used.under);
    },

    async "static-assets"(c) {
      const mine = (u) => { try { return new URL(u).origin === c.site.origin; } catch { return false; } };
      const failed = c.load.failed.filter((f) => ["stylesheet", "script", "font", "image"].includes(f.type));
      const own = failed.filter((f) => mine(f.url));
      const other = failed.filter((f) => !mine(f.url));
      const show = (fs) => fs.slice(0, 5).map((f) => `${f.url.replace(c.site.origin, "")} (${f.status || f.error})`).join(", ");
      const detail = `${own.length ? `${own.length} of the site's own assets failed: ${show(own)}` : "every asset of the site loaded"}${other.length ? `; on other origins: ${show(other)}` : ""}`;
      return own.length ? fail(detail) : pass(detail);
    },

    "footnote-hover": referencesFlow,
    "citation-hover": referencesFlow,
    "xref-hover": referencesFlow,

    async "maths-accessibility"(c) {
      const { page } = c;
      const n = await page.evaluate(({ all, mml }) => ({ all: document.querySelectorAll(all).length, mml: document.querySelectorAll(mml).length }), { all: p.maths.all, mml: c.selector() });
      let menu = false, items = [];
      if (n.all) {
        const first = page.locator(p.maths.all).first();
        await first.scrollIntoViewIfNeeded();
        await press(first, "the first expression", { button: "right" });
        await sleep(800);
        if (p.maths.menu) {
          menu = await page.locator(p.maths.menu).first().isVisible().catch(() => false);
          if (menu) items = await page.locator(`${p.maths.menu} ${p.maths.item}`).evaluateAll((xs) => xs.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 8));
        }
      }
      const detail = `${n.mml} of ${n.all} expressions carry MathML; right-click: ${menu ? `the maths menu (${items.join(", ")})` : "no maths menu"}; the count against layer 2 waits for the drawn checks`;
      return n.all && n.all === n.mml ? pass(detail) : fail(detail);
    },

    async print(c) {
      const { page } = c;
      await page.emulateMedia({ media: "print" });
      await sleep(600);
      const shown = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; }, sel);
      const toolbar = await shown(c.selector("toolbar"));
      const outline = await shown(c.selector("outline"));
      const text = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { shown: getComputedStyle(e).display !== "none" && r.height > 0, cut: e.scrollWidth > e.clientWidth + 1, w: Math.round(r.width) }; }, p.text);
      const word = (v) => (v == null ? "absent" : v ? "printed" : "not printed");
      const detail = `the lecture text ${text?.shown ? `printed, ${text.cut ? "cut off at the side" : "nothing cut off"} (${text.w}px)` : "not printed"}; the toolbar ${word(toolbar)}; the outline ${word(outline)}; the printed page is not captured in this run`;
      return text?.shown && !text.cut ? pass(detail) : fail(detail);
    },
  };
  out["dark-palette"].withoutElement = true;
  return out;
}
