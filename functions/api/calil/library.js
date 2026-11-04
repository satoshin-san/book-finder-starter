// GET /api/calil/library?pref=東京都&city=千代田区 -> the library systems in that area.
// The key stays here; the page only ever sees the library names.

import { CALIL, REFUSALS, calilMode, calilSettings, json, validCity, validPref, validSystem } from "./_shared.js";
import { mayCallCalil, restCalil } from "./_counter.js";

export const SAMPLE_SYSTEMS = [{ systemid: "Sample_Library", systemname: "見本の図書館（本物では ありません）" }];
const MAX_SYSTEMS = 50;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pref = url.searchParams.get("pref") || "";
  const city = url.searchParams.get("city") || "";
  if (!validPref(pref) || !validCity(city)) return json({ error: "bad_request" }, 400);

  const mode = calilMode(env);
  if (mode === "sample") return json({ mode, systems: SAMPLE_SYSTEMS });
  if (mode === "closed") return json({ error: "closed" }, 503);
  if (!(await mayCallCalil(env, "library", 1))) return json({ error: "busy" }, 429);

  const query = new URLSearchParams({ appkey: env.CALIL_APPKEY, pref, format: "json", callback: "" });
  if (city) query.set("city", city);
  let res;
  try {
    res = await calilSettings.fetch(`${CALIL}/library?${query}`);
  } catch {
    return json({ error: "unavailable" }, 502);
  }
  if (REFUSALS.has(res.status)) {
    await restCalil(env);
    return json({ error: "busy" }, 429);
  }
  if (!res.ok) return json({ error: "unavailable" }, 502);
  let list;
  try {
    list = await res.json();
  } catch {
    return json({ error: "unavailable" }, 502);
  }
  // Only the two fields the page needs, each checked, one entry per system
  const systems = [];
  const seen = new Set();
  for (const lib of Array.isArray(list) ? list : []) {
    const systemid = String(lib?.systemid ?? "");
    const systemname = String(lib?.systemname ?? "").slice(0, 60);
    if (!validSystem(systemid) || !systemname || seen.has(systemid)) continue;
    seen.add(systemid);
    systems.push({ systemid, systemname });
    if (systems.length >= MAX_SYSTEMS) break;
  }
  return json({ mode, systems });
}
