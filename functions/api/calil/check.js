// GET /api/calil/check?isbn=978...,978...&systemid=Tokyo_Chiyoda -> can these books be borrowed there?
// Calil answers in steps: the first call starts the search, then we ask again with its session.
// Every call, the first and each later one, is counted by the counter, and later ones wait POLL_MS.

import { CALIL, REFUSALS, calilMode, calilSettings, json, validSystem } from "./_shared.js";
import { mayCallCalil, restCalil } from "./_counter.js";
import { normalizeIsbn } from "../../../public/js/isbn.js";

export const MAX_BOOKS = 10;
export const POLL_MS = 2500; // Calil asks for 2 seconds or more between calls
export const MAX_CALLS = 4;
const MAX_LIBRARIES = 30;

// Sample answers, the same every time, so the page can be tried without any key
export function sampleBooks(isbns) {
  const words = ["貸出可", "貸出中", "蔵書なし"];
  return isbns.map((isbn) => {
    const word = words[Number(isbn.at(-1)) % words.length];
    return { isbn, state: "ok", libraries: word === "蔵書なし" ? {} : { "見本の図書館": word } };
  });
}

// One book's answer for one system: "ok" with its libraries, "running", or "error".
// An empty library list with "ok" means the system has no copy, which is not the same as "error".
function bookOf(data, isbn, systemid) {
  const entry = data?.books?.[isbn]?.[systemid];
  if (!entry || entry.status === "Error") return { isbn, state: "error", libraries: {} };
  if (entry.status === "Running") return { isbn, state: "running", libraries: {} };
  const libraries = {};
  for (const [name, status] of Object.entries(entry.libkey || {}).slice(0, MAX_LIBRARIES)) {
    if (typeof status === "string") libraries[String(name).slice(0, 60)] = status.slice(0, 20);
  }
  return { isbn, state: "ok", libraries };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("isbn") || "").split(",").filter(Boolean);
  const isbns = [...new Set(raw.map(normalizeIsbn))];
  const systemid = url.searchParams.get("systemid") || "";
  if (!raw.length || raw.length > MAX_BOOKS || isbns.includes(null) || !validSystem(systemid)) {
    return json({ error: "bad_request" }, 400);
  }

  const mode = calilMode(env);
  if (mode === "sample") return json({ mode, done: true, books: sampleBooks(isbns) });
  if (mode === "closed") return json({ error: "closed" }, 503);

  let session = "";
  let data = null;
  for (let call = 0; call < MAX_CALLS; call++) {
    if (call > 0) await calilSettings.sleep(POLL_MS);
    if (!(await mayCallCalil(env, "check", isbns.length, systemid))) return json({ error: "busy" }, 429);
    const query = session
      ? new URLSearchParams({ appkey: env.CALIL_APPKEY, session, format: "json", callback: "no" })
      : new URLSearchParams({ appkey: env.CALIL_APPKEY, isbn: isbns.join(","), systemid, format: "json", callback: "no" });
    let res;
    try {
      res = await calilSettings.fetch(`${CALIL}/check?${query}`);
    } catch {
      return json({ error: "unavailable" }, 502);
    }
    if (REFUSALS.has(res.status)) {
      await restCalil(env);
      return json({ error: "busy" }, 429);
    }
    if (!res.ok) return json({ error: "unavailable" }, 502);
    try {
      data = await res.json();
    } catch {
      return json({ error: "unavailable" }, 502);
    }
    if (data?.continue !== 1) break;
    session = String(data?.session ?? "");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(session)) break;
  }
  return json({ mode, done: data?.continue !== 1, books: isbns.map((isbn) => bookOf(data, isbn, systemid)) });
}
