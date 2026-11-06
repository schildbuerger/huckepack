// Serves the built site (dist/) the way GitHub Pages does, for the Lighthouse check (issue #91):
// text files gzip-compressed, index.html for a folder, the 404 page for an unknown address. Python's
// http.server sends everything uncompressed, so a long trail page measured about three times heavier
// than visitors receive it. Usage: node scripts/serve-dist.mjs [port] (default 4321)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const root = join(import.meta.dirname, "..", "dist");
const port = Number(process.argv[2] ?? 4321);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".gpx": "application/gpx+xml; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const COMPRESS = new Set([".html", ".css", ".js", ".json", ".geojson", ".svg", ".xml", ".txt", ".gpx"]);

const find = async (path) => {
  const file = normalize(join(root, decodeURIComponent(path)));
  if (!file.startsWith(root)) return null;
  const s = await stat(file).catch(() => null);
  if (s?.isFile()) return file;
  if (s?.isDirectory()) return (await stat(join(file, "index.html")).catch(() => null)) ? join(file, "index.html") : null;
  return null;
};

createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  let file = await find(path);
  let status = 200;
  if (!file) {
    status = 404;
    file = join(root, "404.html");
  }
  const ext = extname(file);
  let body = await readFile(file);
  const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "max-age=600" };
  if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    body = gzipSync(body);
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
  }
  res.writeHead(status, headers);
  res.end(body);
}).listen(port, () => console.log(`dist/ on http://localhost:${port}`));
