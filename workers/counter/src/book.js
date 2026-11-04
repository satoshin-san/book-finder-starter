// The counter's notebook: plain logic, kept apart from the Durable Object so tests can read it directly.
// Counts live in one-minute boxes. A call is kept for 61 boxes, so it counts for at least 60 full
// minutes wherever in its minute it came (60 boxes would let a call at :59 leave 1 second later).

export const MINUTE_MS = 60_000;
export const WINDOW_MINUTES = 61;
export const CALIL_LIMIT = 1000; // Calil's own hourly limit; ours can never be set above it
export const DEFAULT_PER_HOUR = { check: 900, library: 900 };
export const MAX_N = { check: 10, library: 1 };
export const SYSTEM_PER_MINUTE = 20; // books per library system, counted over this minute and the one before (a courtesy to each library)
export const REST_MS = 10 * MINUTE_MS;

// Hourly limit from the Worker's settings (CHECK_PER_HOUR / LIBRARY_PER_HOUR), never above Calil's
export function limitFor(env, kind) {
  const value = Number(env?.[`${kind.toUpperCase()}_PER_HOUR`]);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, CALIL_LIMIT) : DEFAULT_PER_HOUR[kind];
}

// A valid /take body, or null
export function takeRequest(body) {
  const kind = body?.kind;
  if (!Object.hasOwn(MAX_N, kind)) return null;
  const n = body.n;
  if (!Number.isInteger(n) || n < 1 || n > MAX_N[kind]) return null;
  const system = body.system ?? "";
  if (system !== "" && (kind !== "check" || !/^[A-Za-z0-9_]{1,64}$/.test(system))) return null;
  return { kind, n, system };
}

export function emptyBook() {
  return { boxes: {}, systems: {}, restUntil: 0 };
}

function sweep(book, minute) {
  for (const key of Object.keys(book.boxes)) if (Number(key.split(":")[1]) <= minute - WINDOW_MINUTES) delete book.boxes[key];
  for (const key of Object.keys(book.systems)) if (Number(key.split(":")[1]) < minute - 1) delete book.systems[key];
}

// Books one library system got in this minute and the one before, so no 60 seconds can hold more than the limit
function systemUsed(book, system, minute) {
  return (book.systems[`${system}:${minute}`] || 0) + (book.systems[`${system}:${minute - 1}`] || 0);
}

// May this call go to Calil? A refusal writes nothing.
export function take(book, { kind, n, system }, now, limit) {
  if (now < book.restUntil) return { ok: false, reason: "resting", retryAfter: Math.ceil((book.restUntil - now) / 1000) };
  const minute = Math.floor(now / MINUTE_MS);
  sweep(book, minute);
  const used = Object.entries(book.boxes).filter(([key]) => key.startsWith(`${kind}:`)).reduce((s, [, v]) => s + v, 0);
  if (used + n > limit) return { ok: false, reason: "busy", used, limit };
  const systemKey = `${system}:${minute}`;
  if (system && systemUsed(book, system, minute) + n > SYSTEM_PER_MINUTE) return { ok: false, reason: "library_busy" };
  const boxKey = `${kind}:${minute}`;
  book.boxes[boxKey] = (book.boxes[boxKey] || 0) + n;
  if (system) book.systems[systemKey] = (book.systems[systemKey] || 0) + n;
  return { ok: true, used: used + n, limit };
}

// Calil refused us: everyone waits; a rest is never shortened
export function rest(book, now) {
  book.restUntil = Math.max(book.restUntil, now + REST_MS);
  return { ok: true, until: book.restUntil };
}
