// Shared by the relay routes. Not a route itself: it exports no onRequest handler.

import { counterBound } from "./_counter.js";
import { PREFECTURES } from "../../../public/js/prefectures.js";

export const CALIL = "https://api.calil.jp";
// fetch and sleep are swapped in tests, so no test ever reaches the real service
export const calilSettings = { fetch: (...args) => fetch(...args), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
// Calil answers that mean "stop calling for a while"
export const REFUSALS = new Set([403, 429, 503]);

// Which way the relay works:
//   "sample" = no key: answer with sample data and never call Calil (the starting state)
//   "closed" = a key but no counter: refuse, because nothing would keep all visitors under the hourly limit
//   "live"   = a key and a counter: call Calil, asking the counter first every time
export function calilMode(env) {
  if (String(env?.CALIL_MODE ?? "").trim() === "sample" || !env?.CALIL_APPKEY) return "sample";
  return counterBound(env) ? "live" : "closed";
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export const validPref = (pref) => PREFECTURES.includes(pref);
// A city name: letters only, short; anything else is refused before it reaches Calil
export const validCity = (city) => city === "" || /^[\p{L}\p{M}ー・ヶヵ]{1,20}$/u.test(city);
export const validSystem = (id) => /^[A-Za-z0-9_]{1,64}$/.test(id);
