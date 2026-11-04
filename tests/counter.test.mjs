import { test } from "node:test";
import assert from "node:assert/strict";
import { CALIL_LIMIT, MINUTE_MS, REST_MS, SYSTEM_PER_MINUTE, emptyBook, limitFor, rest, take, takeRequest } from "../workers/counter/src/book.js";
import worker, { Counter } from "../workers/counter/src/index.js";

const T0 = 1_000 * MINUTE_MS;

test("book: 900 calls are allowed in an hour, and the next one waits", () => {
  const book = emptyBook();
  for (let i = 0; i < 900; i++) assert.equal(take(book, { kind: "library", n: 1, system: "" }, T0, 900).ok, true);
  assert.deepEqual(take(book, { kind: "library", n: 1, system: "" }, T0, 900), { ok: false, reason: "busy", used: 900, limit: 900 });
  assert.equal(take(book, { kind: "check", n: 1, system: "" }, T0, 900).ok, true, "check and library are counted apart");
});

test("book: a call counts for at least 60 full minutes, then stops", () => {
  const book = emptyBook();
  take(book, { kind: "check", n: 10, system: "" }, T0, 10);
  assert.equal(take(book, { kind: "check", n: 1, system: "" }, T0 + 60 * MINUTE_MS - 1, 10).ok, false);
  assert.equal(take(book, { kind: "check", n: 1, system: "" }, T0 + 61 * MINUTE_MS, 10).ok, true);
});

test("book: calls at the end of a minute still count an hour later, so no 60 minutes hold more than the limit", () => {
  const book = emptyBook();
  const late = T0 + MINUTE_MS - 1; // the last moment of a minute
  for (let i = 0; i < 900; i++) assert.equal(take(book, { kind: "library", n: 1, system: "" }, late, 900).ok, true);
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, late + 1, 900).ok, false, "the next minute begins");
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, T0 + 60 * MINUTE_MS, 900).ok, false, "59 minutes and 1 ms later");
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, late + 60 * MINUTE_MS, 900).ok, false, "exactly 60 minutes later");
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, T0 + 61 * MINUTE_MS, 900).ok, true, "more than 60 minutes later");
});

test("book: one library system gets 20 books a minute; a refusal writes nothing", () => {
  const book = emptyBook();
  assert.equal(take(book, { kind: "check", n: 10, system: "A" }, T0, 900).ok, true);
  assert.equal(take(book, { kind: "check", n: 10, system: "A" }, T0, 900).ok, true);
  assert.deepEqual(take(book, { kind: "check", n: 1, system: "A" }, T0, 900), { ok: false, reason: "library_busy" });
  assert.equal(take(book, { kind: "check", n: 1, system: "B" }, T0, 900).used, 21);
  assert.equal(take(book, { kind: "check", n: 1, system: "A" }, T0 + MINUTE_MS, 900).reason, "library_busy", "the minute before still counts");
  assert.equal(take(book, { kind: "check", n: 1, system: "A" }, T0 + 2 * MINUTE_MS, 900).ok, true);
  assert.equal(SYSTEM_PER_MINUTE, 20);
});

test("book: one library system never gets more than 20 books across a minute's edge", () => {
  const book = emptyBook();
  const late = T0 + MINUTE_MS - 1;
  assert.equal(take(book, { kind: "check", n: 10, system: "A" }, late, 900).ok, true);
  assert.equal(take(book, { kind: "check", n: 10, system: "A" }, late, 900).ok, true);
  assert.equal(take(book, { kind: "check", n: 10, system: "A" }, late + 1, 900).reason, "library_busy");
});

test("book: a rest blocks everything until it ends and is never shortened", () => {
  const book = emptyBook();
  rest(book, T0);
  rest(book, T0 - MINUTE_MS);
  assert.equal(book.restUntil, T0 + REST_MS);
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, T0 + REST_MS - 1, 900).reason, "resting");
  assert.equal(take(book, { kind: "library", n: 1, system: "" }, T0 + REST_MS, 900).ok, true);
});

test("settings: hourly limits default to 900 and can never go above Calil's 1000", () => {
  assert.equal(limitFor({}, "check"), 900);
  assert.equal(limitFor({ CHECK_PER_HOUR: "500" }, "check"), 500);
  assert.equal(limitFor({ CHECK_PER_HOUR: "5000" }, "check"), CALIL_LIMIT);
  assert.equal(limitFor({ LIBRARY_PER_HOUR: "lots" }, "library"), 900);
  assert.equal(limitFor({ LIBRARY_PER_HOUR: "-1" }, "library"), 900);
});

test("take: only known kinds, whole counts within each kind's maximum, and a system id only for check", () => {
  assert.deepEqual(takeRequest({ kind: "check", n: 10, system: "Tokyo_Chiyoda" }), { kind: "check", n: 10, system: "Tokyo_Chiyoda" });
  for (const bad of [{}, { kind: "other", n: 1 }, { kind: "check", n: 11 }, { kind: "check", n: 0 }, { kind: "check", n: 1.5 },
    { kind: "library", n: 2 }, { kind: "library", n: 1, system: "A" }, { kind: "check", n: 1, system: "a b" }, { kind: "__proto__", n: 1 }]) {
    assert.equal(takeRequest(bad), null, JSON.stringify(bad));
  }
});

function storage({ failWrite = false } = {}) {
  const map = new Map();
  return { get: async (k) => structuredClone(map.get(k)), put: async (k, v) => { if (failWrite) throw new Error("full"); map.set(k, structuredClone(v)); } };
}
const post = (path, body) => new Request(`https://counter${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

test("counter: remembers counts across calls, and refuses bad requests", async () => {
  const c = new Counter({ storage: storage() }, { LIBRARY_PER_HOUR: "1" });
  assert.equal((await (await c.fetch(post("/take", { kind: "library", n: 1 }))).json()).ok, true);
  assert.equal((await (await c.fetch(post("/take", { kind: "library", n: 1 }))).json()).ok, false);
  assert.equal((await c.fetch(post("/take", "not json"))).status, 400);
  assert.equal((await c.fetch(post("/take", { kind: "x", n: 1 }))).status, 400);
  assert.equal((await c.fetch(new Request("https://counter/take"))).status, 404);
  assert.equal((await c.fetch(post("/other", {}))).status, 404);
});

test("counter: if the count cannot be written, the answer is no", async () => {
  const c = new Counter({ storage: storage({ failWrite: true }) }, {});
  assert.deepEqual(await (await c.fetch(post("/take", { kind: "check", n: 1 }))).json(), { ok: false, reason: "busy" });
});

test("worker: its own address answers 404 to everyone", async () => {
  assert.equal((await worker.fetch(new Request("https://counter.example/take", { method: "POST" }))).status, 404);
});
