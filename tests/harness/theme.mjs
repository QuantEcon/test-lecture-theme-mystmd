// What is particular to this site, quantecon-theme.mystmd on the QuantEcon mystmd fork: how a page is addressed,
// how a colour scheme is set and checked, when a page has settled, and the behaviours whose markup is this theme's
// own. The engine (lib/) is the same in both corpora; this file is the mystmd side of the contract.
import { readFileSync, writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { press, settleBase, stableDom, oneLine, said, sleep } from "./lib/util.mjs";
import { MARKER_NAMES, errorMarkers } from "./lib/markers.mjs";
import { parseCsv } from "./lib/csv.mjs";
import * as B from "./lib/behave.mjs";
const { pass, fail, skip, yes } = B;

const FIRST = "intro"; // the site's first page, which mystmd serves at the base itself

/** A page's stem from a link on this site: `/test-lecture-theme-mystmd/code-cells#x` -> `code_cells`. */
function stemOf(href, base, site) {
  const path = new URL(href, base).pathname.replace(/\/index\.html$/, "/").replace(/\/+$/, "");
  const root = (site?.base ?? "/").replace(/\/+$/, "");
  if (path === root) return FIRST;
  return (path.split("/").pop() ?? "").replace(/\.html$/, "").replace(/-/g, "_");
}

const profile = {
  text: "article.article", // the lecture text
  para: "article.article main p:not(.qe-outline *)", // not the outline's "Powered by MyST Markdown"
  stemOf,
  maths: { all: ".katex", menu: null },
};


/** Open a Radix menu by its trigger and read its items: each one's label, and its link (its own or one inside it), or
 * null; Escape closes it again. */
async function menuLinks(c, trigger, items = '[role="menu"] a[href]', what = "the menu control") {
  await press(trigger, what);
  await sleep(700);
  const links = await c.page.locator(items).evaluateAll((as) => as.map((a) => ({
    label: a.textContent.trim(), href: a.getAttribute("href") ?? a.querySelector("a[href]")?.getAttribute("href") ?? null })));
  const open = await c.page.locator('[role="menu"]').count();
  await c.page.keyboard.press("Escape");
  await sleep(300);
  return { open: open > 0, links };
}

// The Downloads menu's items. Theme v3.2.1 draws each download as a Radix menu item (div[role="menuitem"]) with no
// link: selecting it fetches the file and saves it through a hidden a[download] it makes for the moment. So an item
// with no link is selected, the menu opened again for each since selecting one closes it, and what it did is read:
// the request the selection made (the file's URL and its status) and the download it started (the file's name).
const DOWNLOAD_ITEMS = '[role="menu"] [role="menuitem"]';

/** Select the menu's `i`th item: { url, status, error, file }, the first fetch it made and the file it downloaded. */
async function selectItem(c, trigger, items, i, label, what) {
  const { page } = c;
  await press(trigger, what);
  await sleep(700);
  let first = null; // the item's own fetch; a route's data request (`_data=`) is the site's, not the item's
  const onRequest = (req) => { if (!first && ["fetch", "xhr"].includes(req.resourceType()) && !req.url().includes("_data=")) first = req; };
  page.on("request", onRequest);
  try {
    const download = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
    await press(page.locator(items).nth(i), `the menu item "${label}"`);
    const d = await download;
    const res = first ? await first.response().catch(() => null) : null;
    if (await page.locator('[role="menu"]').count()) { await page.keyboard.press("Escape"); await sleep(300); }
    const file = d ? d.suggestedFilename() : null;
    if (!first) return { url: null, status: 0, error: "selecting it made no request", file };
    return res ? { url: first.url(), status: res.status(), file } : { url: first.url(), status: 0, error: first.failure()?.errorText ?? "no answer", file };
  } finally {
    page.off("request", onRequest);
  }
}

/** Open the menu and read its items, selecting each that is no link (`selected`, from selectItem). */
async function menuItems(c, trigger, items, what) {
  const m = await menuLinks(c, trigger, items, what);
  for (const [i, it] of m.links.entries()) if (!it.href) it.selected = await selectItem(c, trigger, items, i, it.label, what);
  return m;
}

/** An item in words: a link and what it answers, or what selecting a menu item did. */
async function itemWords(c, it) {
  if (it.href) {
    const u = new URL(it.href, c.page.url()).href;
    it.result = await c.fetch(u);
    it.url = u;
    return `"${it.label}", a link to ${said(u, it.result)}`;
  }
  const s = it.selected;
  it.result = s;
  it.url = s.url;
  const got = s.file ? `downloads ${s.file} when selected` : "starts no download when selected";
  return `"${it.label}", a menu item that ${got} (${s.url ? `its fetch: ${said(s.url, s)}` : s.error})`;
}

/** Does the item give this page's notebook? Its URL's file, or the name of the file it downloads. */
const givesNotebook = (it, stem) => (it.url && new URL(it.url).pathname.endsWith(`/${stem}.ipynb`)) || it.selected?.file === `${stem}.ipynb`;

const behaviours = {
  ...B.commonBehaviours(profile),

  async launch(c) {
    // the slot holds the control when the site configures launch: a link, or a menu of them
    const el = c.part().first();
    const href = await el.evaluate((e) => (e.matches("a[href]") ? e.getAttribute("href") : null));
    let targets;
    if (href) targets = [{ label: "the launch link", url: new URL(href, c.page.url()).href }];
    else {
      const trigger = el.locator("button").first();
      const m = await menuLinks(c, (await trigger.count()) ? trigger : el, undefined, "the launch control");
      targets = m.links.map((l) => ({ label: l.label || "a launch link", url: new URL(l.href, c.page.url()).href }));
    }
    return B.launchTargets(c, targets);
  },

  async "download-notebook"(c) {
    const m = await menuItems(c, c.part("control").first(), c.selector("items"), "the downloads control");
    if (!m.open) return fail("the downloads control opened no menu");
    if (!m.links.length) return fail("the downloads menu opens empty: a downloads control with nothing in it (QuantEcon/quantecon-theme.mystmd#212)");
    const words = [];
    for (const it of m.links) words.push(await itemWords(c, it));
    const nb = `${c.feature.page}.ipynb`;
    const mine = m.links.filter((it) => givesNotebook(it, c.feature.page));
    const offers = `the downloads menu offers ${words.join(", and ")}`;
    // the page's notebook must be offered, and answer 200; what else the menu offers is evidence, not the test
    if (!mine.length) return fail(`${offers}; none is this page's notebook (${nb})`);
    return B.verdictOf(`${offers}; this page's notebook (${nb}) is ${mine.map((it) => `"${it.label}"`).join(", ")}`, mine.map((it) => it.result));
  },

  async search(c) {
    const { page } = c;
    await press(c.part(), "the search control");
    const input = page.locator(".myst-search-dialog input").first();
    await input.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (!(await input.isVisible())) return fail("the search control opened no input");
    await input.fill("Cagan");
    await page.locator(".myst-search-dialog a[href]").first().waitFor({ timeout: 15_000 }).catch(() => {});
    await sleep(800);
    const hrefs = await page.locator(".myst-search-dialog a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    const hits = hrefs.filter((h) => stemOf(h, page.url(), c.site) === "math");
    const detail = `"Cagan" in the search dialog: ${hrefs.length} result link(s), ${hits.length} to the maths page`;
    return hits.length ? pass(detail) : fail(detail);
  },

  async "mobile-navigation"(c) {
    const { page } = c;
    const actions = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden"); };
      const bar = document.querySelector("button.qe-toc-toggle")?.closest("ul");
      return [...(bar?.children ?? [])].filter(vis).map((li) => {
        const x = li.querySelector("[aria-label]");
        return x?.getAttribute("aria-label") || li.querySelector("img[alt]")?.getAttribute("alt") || li.textContent.trim();
      }).filter(Boolean);
    });
    const m = await menuLinks(c, c.part("menu").first(), '[role="menu"] li', "the More actions menu");
    const inMenu = m.links.map((l) => l.label).filter(Boolean);
    await press(c.part("contents"), "the contents control");
    await sleep(900);
    const opened = await page.evaluate(() => { const t = document.querySelector("#qe-toc"); return !!t && t.matches(":popover-open") && t.getBoundingClientRect().width > 0; });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const detail = `visible in the toolbar: ${actions.join(", ")}; in the menu: ${inMenu.join(", ") || "nothing"}; the contents drawer opens: ${yes(opened)}; `
      + `the page ${o.sw > o.cw ? `scrolls sideways (scrollWidth ${o.sw} > clientWidth ${o.cw})` : `fits (scrollWidth ${o.sw})`}`;
    const result = opened && o.sw <= o.cw ? pass : fail;
    // the result is the drawer and the width; whether every action the Sphinx site offers at 390px is reachable is a
    // comparison of the two sites' lists, for a person
    return result(`${detail}. The drawer and the width decide this row; a person compares the action lists with the other site's`);
  },

  async "contents-drawer"(c) {
    const { page } = c;
    await press(c.part("toggle"), "the contents toggle");
    await sleep(900);
    const entries = await c.part("entries").evaluateAll((as) => as
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden"); })
      .map((a) => ({ href: a.getAttribute("href"), mark: a.getAttribute("aria-current") || [...a.classList, ...a.parentElement.classList].find((k) => /active|current|selected/i.test(k)) || null })));
    const want = c.site.pages.filter((x) => x !== c.site.pages[0]);
    const stems = entries.map((e) => stemOf(e.href, page.url(), c.site));
    const listed = stems.filter((s) => s !== c.site.pages[0]);
    const inOrder = JSON.stringify(listed) === JSON.stringify(want);
    const mine = entries.filter((e, i) => stems[i] === c.feature.page);
    const marked = mine.length === 1 && !!mine[0].mark && entries.filter((e) => e.mark).length === 1;
    await page.setViewportSize({ width: 1024, height: 800 });
    await sleep(900);
    const ov = await B.overlap(page, "#qe-toc", "article.article main .prose-qetext-light");
    const clear = ov.area === 0;
    const detail = `${entries.length} entries${inOrder ? ", every page in the site's order" : `; expected ${want.join(", ")}; listed ${listed.join(", ")}`}; `
      + `the current page marked: ${marked ? `yes (${mine[0].mark})` : "no: its entry carries no class or aria-current"}; at 1024px the open drawer ${ov.area == null ? `is not shown (drawer ${yes(ov.a)}, text ${yes(ov.b)})` : clear ? "leaves the text clear" : `covers ${ov.area}px² of the text (drawer ${ov.aBox.join("-")}, text ${ov.bBox.join("-")})`}`;
    return inOrder && marked && clear ? pass(detail) : fail(detail);
  },

  async "skip-links"(c) {
    const { page } = c;
    const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => { const a = document.activeElement; return { text: a?.textContent.trim().slice(0, 50) ?? "", skip: !!a?.matches("a.myst-skip-to-link") }; });
    let reached = null;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const a = document.activeElement;
        const cs = a ? getComputedStyle(a) : null;
        const ring = !!cs && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none");
        return { label: a?.getAttribute("aria-label") ?? "", ring };
      });
      if (f.label === "Change contrast") reached = { ...f, tabs: i + 2 };
    }
    let switched = false;
    if (reached) {
      const before = await dark();
      await page.keyboard.press("Enter");
      await sleep(600);
      switched = (await dark()) !== before;
    }
    const detail = `the first Tab focuses ${first.skip ? `a skip link ("${first.text}")` : `"${first.text}", not a skip link`}; `
      + `${reached ? `Tab reaches the contrast control in ${reached.tabs} presses, its focus ${reached.ring ? "visible" : "not visibly marked"}; Enter on it ${switched ? "switches" : "does not switch"} the scheme` : "Tab did not reach the contrast control in 40 presses"}`;
    return first.skip && reached && switched ? pass(detail) : fail(detail);
  },

  async authors(c) {
    const { page } = c;
    const n = await c.part().count();
    const found = [];
    for (let i = 0; i < n; i++) {
      const el = c.part().nth(i);
      const name = (await el.innerText()).trim();
      let href = await el.evaluate((e) => e.querySelector("a[href]")?.href ?? null);
      if (!href) {
        // a linked author is a button that opens a card holding the link (F082)
        const btn = el.locator("button").first();
        if (await btn.count()) {
          await press(btn, `the author ${name}`);
          await sleep(700);
          href = await page.locator("[data-radix-popper-content-wrapper] a[href]").first().evaluate((a) => a.href).catch(() => null);
          await page.keyboard.press("Escape");
          await sleep(300);
        }
      }
      found.push({ name, href });
    }
    const unlinked = found.filter((f) => !f.href);
    const res = await B.fetchAll(c, found.filter((f) => f.href).map((f) => f.href));
    const words = `${found.map((f) => `${f.name}: ${f.href ? res.find((r) => r.url === f.href).said : "no link"}`).join("; ")} (each link is in the card its name opens)`;
    if (unlinked.length) return fail(words);
    return B.verdictOf(words, res, { good: (r) => r.ok });
  },

  async "notebook-header"(c) {
    const control = c.page.locator('button[aria-label="Downloads"]').first();
    if (!(await control.count())) return skip("the page has no downloads control, so there is no notebook to read; a person compares the two stacks' notebooks");
    const m = await menuItems(c, control, DOWNLOAD_ITEMS, "the downloads control");
    const words = [];
    for (const it of m.links) words.push(await itemWords(c, it));
    const nb = m.links.find((it) => (it.url && /\.ipynb$/.test(new URL(it.url).pathname)) || /\.ipynb$/.test(it.selected?.file ?? ""));
    if (!nb) return skip(`the site offers no notebook download (the downloads menu ${m.links.length ? `offers ${words.join(", and ")}` : "holds nothing"}), so there is no notebook to read; a person compares the two stacks' notebooks`);
    const u = nb.url;
    if (!u) return skip(`"${nb.label}" downloads ${nb.selected.file} when selected, but ${nb.selected.error}, so there is no notebook to read; a person compares the two stacks' notebooks`);
    const r = await c.fetch(u, { body: true });
    if (r.status !== 200) return skip(`the page's notebook, "${nb.label}", cannot be read: ${said(u, r)}, so there is no downloaded notebook to read`);
    let first = "(not a notebook)";
    try { const j = JSON.parse(r.body); const cell = j.cells?.[0]; first = cell ? `${cell.cell_type}: "${oneLine([].concat(cell.source).join(""), 140)}"` : "(no cells)"; } catch {}
    return skip(`the downloaded notebook's first cell is ${first}. Whether it is this feature's parity is the owner's verdict (QuantEcon/quantecon-theme.mystmd#204)`);
  },

  async "code-copy"(c) {
    const { page } = c;
    const btn = c.part().first();
    const want = await btn.evaluate((b) => b.closest(".myst-code")?.querySelector("code")?.innerText ?? null);
    await btn.evaluate((b) => b.closest(".myst-code")?.scrollIntoView({ block: "center" }));
    await btn.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' myst-code ')][1]").hover().catch(() => {});
    await sleep(300);
    const copied = await B.copyWith(page, () => press(btn, "the copy button"));
    if (!copied.primed) return B.unprimed(copied);
    const { text: clip, untouched } = copied;
    const norm = (s) => (s ?? "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();
    const ok = want != null && !untouched && norm(clip) === norm(want);
    return { result: ok ? "pass" : "fail", detail: untouched ? "pressed on the first code block: the clipboard still holds the harness's marker, so the button copied nothing"
      : `pressed on the first code block: the clipboard holds ${norm(clip).length} characters ("${oneLine(clip, 60)}"), ${ok ? "its source" : `not its source (${norm(want).length} characters, "${oneLine(want, 60)}")`}` };
  },

  async "long-input"(c) {
    const bar = await c.part().first().elementHandle();
    const block = await bar.evaluateHandle((b) => b.closest(".qe-collapse"));
    return B.collapseFlow(c, block, bar);
  },

  async "long-output"(c) {
    const box = await c.part().first().elementHandle();
    const cap = await box.evaluate((e) => getComputedStyle(e).getPropertyValue("--qe-collapse-cap").trim() || e.style.getPropertyValue("--qe-collapse-cap"));
    const bar = await box.evaluateHandle((e) => e.querySelector(".qe-collapse__bar"));
    if (!(await bar.evaluate((b) => !!b))) return fail(`capped at ${cap || "?"}, but there is no bar to expand it`);
    const r = await B.collapseFlow(c, box, bar);
    return { result: r.result, detail: `capped at ${cap || "?"}: ${r.detail}` };
  },

  async "stderr-fold"(c) {
    const summary = c.part().first();
    const state = () => summary.evaluate((s) => {
      const d = s.parentElement;
      const body = [...d.children].find((x) => x !== s);
      // a closed <details> keeps its content's box: checkVisibility() is what says it is not drawn
      const r = body?.getBoundingClientRect();
      const drawn = !!body && (body.checkVisibility ? body.checkVisibility({ visibilityProperty: true }) : true);
      return { open: d.open, shown: drawn && r.width > 0 && r.height > 0 };
    });
    const before = await state();
    await press(summary, "the stderr toggle");
    await sleep(700);
    const after = await state();
    const detail = `the stderr text on load: ${before.shown ? "shown" : "hidden"}; after the toggle: ${after.shown ? "shown" : "hidden"}`;
    return !before.shown && after.shown ? pass(detail) : fail(detail);
  },

  async "output-images"(c) {
    const gaps = await c.part().evaluateAll((imgs) => imgs.map((img) => {
      const r = img.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && (img.checkVisibility ? img.checkVisibility({ visibilityProperty: true }) : getComputedStyle(img).visibility !== "hidden"))) return null;
      const k = (img.closest(".myst-jp-nb-block") ?? img.parentElement).getBoundingClientRect();
      return { l: Math.round(r.left - k.left), r: Math.round(k.right - r.right), w: Math.round(r.width) };
    }).filter(Boolean));
    if (!gaps.length) return skip("no output image is shown on load; a person looks at the figures page");
    const off = gaps.filter((g) => Math.abs(g.l - g.r) > 1);
    const detail = `${gaps.length} shown, each in its output: ${gaps.map((g) => `${g.w}px wide, ${g.l}px | ${g.r}px`).join("; ")}`;
    return off.length ? fail(`${off.length} not centred; ${detail}`) : pass(`all centred; ${detail}`);
  },
};
behaviours["notebook-header"].withoutLocator = true;

// A notice on the run listing the rows of the families below, so CI's reading of them is on the check run's
// annotations, readable without the artefact (as run.mjs's notice gives the drawn counts). It is written as run.mjs
// exits, from the rendered.csv it wrote, only in GitHub Actions and only for run.mjs itself (the self-test's runs are
// not the job's), and nothing in it can change the exit status. The families: those this site's last locator change
// touched (QuantEcon/project-theme-parity#74).
const NOTICE_FAMILIES = ["download-notebook", "download-pdf", "notebook-header"];
const HERE = dirname(fileURLToPath(import.meta.url));
if (process.env.GITHUB_ACTIONS === "true" && resolve(process.argv[1] ?? "") === join(HERE, "run.mjs")) {
  process.once("exit", () => {
    try {
      const at = process.argv.indexOf("--out");
      const out = at > 0 ? resolve(process.argv[at + 1]) : join(HERE, "..", "..", "_harness");
      const rows = parseCsv(readFileSync(join(out, "rendered.csv"), "utf8")).filter((r) => NOTICE_FAMILIES.includes(r.family));
      if (!rows.length) return;
      const text = rows.map((r) => `${r.family} ${r.check} ${r.viewport} ${r.scheme}: ${r.result}: ${r.detail}`).join("\n").slice(0, 4000);
      const escape = (x) => x.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
      writeSync(1, `::notice title=Rows of ${NOTICE_FAMILIES.join(", ")}::${escape(text)}\n`);
    } catch {}
  });
}

export default {
  side: "mystmd",
  repository: "QuantEcon/test-lecture-theme-mystmd",
  basePath: "/test-lecture-theme-mystmd/",
  publishedBase: "https://quantecon.github.io/test-lecture-theme-mystmd/",
  buildInfoPage: "build_info",
  homeFiles: ["index.html"],
  // the root route's own icon link, which mystmd writes beside the base's (bin/site-features.yml, favicon)
  escapesBase: (u) => u === "/favicon.ico",
  baseWhy: (base) => `the BASE_URL the build was made with (${base === "/" ? "empty: a pull request or a manual run" : "a push to main"}; `
    + ".github/workflows/ci.yml), so its links resolve as they do where that build is served",

  /** The site's pages, in its order: lectures/myst.yml's project.toc. */
  async pages(repo) {
    const doc = YAML.parse(await readFile(join(repo, "lectures", "myst.yml"), "utf8"));
    const out = [];
    const walk = (items) => { for (const it of items ?? []) { if (it.file) out.push(it.file.replace(/\.(md|ipynb)$/, "")); walk(it.children); } };
    walk(doc.project.toc);
    return out;
  },

  pagePath: (stem) => (stem === FIRST ? "" : `${stem.replace(/_/g, "-")}/`),

  // The theme takes its scheme from @myst-theme/site: on a static build it reads localStorage "myst:theme" first,
  // and without one follows prefers-color-scheme (useTheme, and the BlockingThemeLoader before hydration). Each
  // context emulates the preference and leaves the key unset, as for a reader who has not chosen.
  schemeHow: {
    light: "prefers-color-scheme emulated as light (the browser context's colorScheme); localStorage myst:theme left unset, so the theme follows the preference. Checked before every check: html has no dark class",
    dark: "prefers-color-scheme emulated as dark (the browser context's colorScheme); localStorage myst:theme left unset, so the theme follows the preference. Checked before every check: html.dark",
  },
  contextOptions: (scheme) => ({ colorScheme: scheme }),
  async verifyScheme(page, scheme) {
    const cls = await page.evaluate(() => document.documentElement.className);
    const dark = /(^|\s)dark(\s|$)/.test(cls);
    return { ok: dark === (scheme === "dark"), detail: `html class "${cls}"` };
  },

  // mystmd highlights code after hydration (the design notes on QuantEcon/project-theme-parity#15): a second past
  // network idle, then a stable document
  async settle(page) {
    await settleBase(page);
    await sleep(1000);
    await stableDom(page);
  },

  markerNames: MARKER_NAMES,
  errorMarkers,
  behaviours,
};
