// Try the page on your own computer, always in sample mode (no key, nothing leaves your computer):
//   npm run dev            -> http://localhost:8788  (your shelf from public/data/books.json)
//   npm run dev -- --demo  -> the same, with a few made-up books so you can click around
// Only this computer can open it (127.0.0.1). For the real site, use your hosting service.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest as door } from "../functions/api/calil/_middleware.js";
import { onRequestGet as library } from "../functions/api/calil/library.js";
import { onRequestGet as check } from "../functions/api/calil/check.js";

const PORT = 8788;
const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const ROUTES = { "/api/calil/library": library, "/api/calil/check": check };
const ENV = { CALIL_MODE: "sample" };

// Made-up books for trying the page (titles say so; the numbers are only shaped like ISBNs)
const DEMO = {
  books: [
    { isbn: "9780000000002", title: "見本の本 1（ためし用）", author: "見本", tags: ["easy", "short"] },
    { isbn: "9780000000019", title: "見本の本 2（ためし用）", author: "見本", tags: ["cheer"] },
    { isbn: "9780000000026", title: "見本の本 3（ためし用）", author: "見本", tags: ["think"] },
  ],
};
const demo = process.argv.includes("--demo");

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = ROUTES[url.pathname];
  if (route) {
    const request = new Request(url, { method: req.method, headers: req.headers });
    return send(res, await door({ request, env: ENV, next: () => route({ request, env: ENV }) }));
  }
  if (demo && url.pathname === "/data/books.json") return send(res, Response.json(DEMO));
  const path = normalize(ROOT + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!path.startsWith(ROOT) || path.includes(`${sep}.`)) return send(res, new Response("Not found", { status: 404 }));
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "content-security-policy": CSP, "x-content-type-options": "nosniff" });
    res.end(body);
  } catch {
    send(res, new Response("Not found", { status: 404 }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Sample mode${demo ? " with made-up books" : ""}: http://localhost:${PORT}`));
