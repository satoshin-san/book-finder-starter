// The door of /api/calil/*: an emergency stop, GET only, a same-site mark, and a per-address speed limit.
// The mark and the speed limit are first filters, not identity checks: the counter is the real limit.

const WINDOW_MS = 60_000;
export const PER_ADDRESS_PER_MINUTE = 20;
const MAX_ADDRESSES = 5000; // remembered at once, so memory stays small
const hits = new Map();

function deny(error, status) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

// Browsers mark requests from the same site; older ones send a same-site Referer instead
export function fromOurPage(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  try {
    return new URL(request.headers.get("referer") || "").origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function tooFast(address, now = Date.now()) {
  if (hits.size >= MAX_ADDRESSES && !hits.has(address)) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
    if (hits.size >= MAX_ADDRESSES) return true;
  }
  const times = (hits.get(address) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_ADDRESS_PER_MINUTE) {
    hits.set(address, times);
    return true;
  }
  times.push(now);
  hits.set(address, times);
  return false;
}

export function resetDoor() {
  hits.clear();
}

// Emergency stop: set CALIL_ENABLED=false in your hosting settings (then deploy again)
export const paused = (env) => String(env?.CALIL_ENABLED ?? "").trim().toLowerCase() === "false";

export async function onRequest({ request, env, next }) {
  if (paused(env)) return deny("paused", 503);
  if (request.method !== "GET") return deny("method_not_allowed", 405);
  if (!fromOurPage(request)) return deny("forbidden", 403);
  if (tooFast(request.headers.get("cf-connecting-ip") || "unknown")) return deny("too_many_requests", 429);
  return next();
}
