// A plain static file server for a built site, under the path the live site uses.
//
// Modelled on QuantEcon/quantecon-theme.mystmd's themes/lecture/tests/visual/static-server.mjs: no routing, it behaves
// like the static host the site deploys to (GitHub Pages). Two things are added for that host's shape:
//   - the site is served under a base path (`/test-lecture-theme-sphinx/`, say), and nothing is served outside it,
//     so a root-relative link that escapes the base answers 404 here as it does on the live site;
//   - as GitHub Pages does, a directory without its trailing slash answers 301 to the slashed path, a path with no
//     extension is served from `<path>.html` when that file exists, and a missing path under the base is answered
//     with the site's own 404.html (status 404) when it has one.
//
// This file is the same in QuantEcon/test-lecture-theme-sphinx and QuantEcon/test-lecture-theme-mystmd.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".mjs": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".ipynb": "application/x-ipynb+json",
  ".map": "application/json",
  ".xml": "application/xml",
  ".xsl": "application/xml",
  ".txt": "text/plain; charset=UTF-8",
  ".csv": "text/csv; charset=UTF-8",
  ".md": "text/markdown; charset=UTF-8",
  ".inv": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** The base path, with a leading and a trailing slash: "/" or "/name/". */
export function normaliseBase(base) {
  const b = `/${String(base ?? "/").replace(/^\/+|\/+$/g, "")}/`;
  return b === "//" ? "/" : b;
}

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

/**
 * Serve `rootDir` at http://127.0.0.1:<port><base>. Resolves to { url, base, close }, `url` ending in the base.
 */
export async function serve(rootDir, base = "/", port = 0) {
  const root = resolve(rootDir);
  if (!(await stat(root).catch(() => null))?.isDirectory()) throw new Error(`not a directory: ${rootDir}`);
  base = normaliseBase(base);
  const notFound = async (res) => {
    const page = join(root, "404.html");
    if (await isFile(page)) {
      const body = await readFile(page);
      res.writeHead(404, { "Content-Type": TYPES[".html"], "Content-Length": body.length }).end(body);
    } else res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    // the base itself, without its slash, is a directory: redirect as for any other
    if (base !== "/" && pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: `${base}${url.search}` }).end();
      return;
    }
    if (!pathname.startsWith(base)) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    let file = normalize(join(root, pathname.slice(base.length)));
    // Serve only what lies inside the root: a prefix test on the path is not enough (`<root>-other/`).
    const rel = relative(root, file);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) { res.writeHead(403).end(); return; }
    try {
      let info = await stat(file).catch(() => null);
      if (!info && !extname(file) && (await isFile(`${file}.html`))) { file = `${file}.html`; info = await stat(file); }
      if (!info) return notFound(res);
      if (info.isDirectory()) {
        if (!pathname.endsWith("/")) { res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end(); return; }
        file = join(file, "index.html");
        if (!(await isFile(file))) return notFound(res);
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Content-Length": body.length });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      return notFound(res);
    }
  });
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  const { port: bound } = server.address();
  return {
    url: `http://127.0.0.1:${bound}${base}`,
    base,
    close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}
