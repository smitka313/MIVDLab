#!/usr/bin/env node
/**
 * Serves the static export in ./out the way GitHub Pages does:
 *  - under an optional base path (NEXT_PUBLIC_BASE_PATH, e.g. /classpulse)
 *  - /dir  -> 301 to /dir/ when dir/index.html exists
 *  - /page -> page.html fallback
 *  - unknown paths -> 404.html with status 404
 * Usage: node scripts/serve-static.mjs [port]   (default 3200)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3200);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

if (!fs.existsSync(root)) {
  console.error("No ./out folder. Run `npm run build` first.");
  process.exit(1);
}

const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (base) {
      if (p === base) p = base + "/";
      if (!p.startsWith(base + "/")) return send404(res);
      p = p.slice(base.length);
    }
    const file = path.join(root, p);
    if (!file.startsWith(root)) return send404(res);
    if (isFile(file)) return send(res, file, 200);
    if (isFile(path.join(file, "index.html"))) {
      if (!p.endsWith("/")) {
        res.writeHead(301, { Location: `${base}${p}/${url.search}` });
        return res.end();
      }
      return send(res, path.join(file, "index.html"), 200);
    }
    if (isFile(file + ".html")) return send(res, file + ".html", 200);
    return send404(res);
  })
  .listen(port, () => console.log(`ClassPulse static preview: http://localhost:${port}${base}/`));

function send(res, file, status) {
  res.writeHead(status, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "max-age=600" });
  fs.createReadStream(file).pipe(res);
}
function send404(res) {
  const f = path.join(root, "404.html");
  if (isFile(f)) return send(res, f, 404);
  res.writeHead(404).end("Not found");
}
