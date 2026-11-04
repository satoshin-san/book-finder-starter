import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest as door, tooFast, resetDoor, PER_ADDRESS_PER_MINUTE } from "../functions/api/calil/_middleware.js";
import { calilMode, calilSettings } from "../functions/api/calil/_shared.js";
import { counterSettings } from "../functions/api/calil/_counter.js";
import { onRequestGet as library, SAMPLE_SYSTEMS } from "../functions/api/calil/library.js";
import { onRequestGet as check, POLL_MS } from "../functions/api/calil/check.js";

const KEY = "test-key-not-real";
const SITE = "https://site.example";
const req = (path, headers = { "sec-fetch-site": "same-origin" }, method = "GET") => new Request(SITE + path, { method, headers });

// A stand-in for Calil: records every call, answers from the given list
let calilCalls = [];
let sleeps = [];
function calilAnswers(...answers) {
  calilSettings.fetch = async (url) => {
    calilCalls.push(url);
    const next = answers.shift();
    return typeof next === "function" ? next() : next;
  };
}

// A stand-in for the counter binding
function counter(handler = () => Response.json({ ok: true })) {
  const calls = [];
  return {
    calls,
    idFromName: (name) => name,
    get: () => ({ fetch: async (url, init) => { calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body) }); return handler(); } }),
  };
}

beforeEach(() => {
  calilCalls = [];
  sleeps = [];
  calilAnswers();
  calilSettings.sleep = async (ms) => { sleeps.push(ms); };
  counterSettings.waitMs = 30;
  resetDoor();
});

const libPath = `/api/calil/library?pref=${encodeURIComponent("東京都")}&city=${encodeURIComponent("千代田区")}`;
const BOOK = "9780000000002";
const checkPath = (isbn = BOOK, systemid = "Tokyo_Chiyoda") => `/api/calil/check?isbn=${isbn}&systemid=${systemid}`;

// ---------- the door ----------

test("door: the emergency stop answers before anything else", async () => {
  const res = await door({ request: req("/api/calil/library"), env: { CALIL_ENABLED: "false" }, next: () => assert.fail() });
  assert.equal(res.status, 503);
});

test("door: GET only, and only with the same-site mark (or a same-site Referer)", async () => {
  const next = () => new Response("ok");
  assert.equal((await door({ request: req(libPath, {}, "POST"), env: {}, next })).status, 405);
  assert.equal((await door({ request: req(libPath, {}), env: {}, next })).status, 403);
  assert.equal((await door({ request: req(libPath, { "sec-fetch-site": "cross-site" }), env: {}, next })).status, 403);
  assert.equal((await door({ request: req(libPath, { referer: "https://other.example/" }), env: {}, next })).status, 403);
  assert.equal((await door({ request: req(libPath, { referer: `${SITE}/` }), env: {}, next })).status, 200);
});

test("door: one address gets 20 calls a minute; others still go ahead; a minute later it may call again", () => {
  for (let i = 0; i < PER_ADDRESS_PER_MINUTE; i++) assert.equal(tooFast("a", 1000), false);
  assert.equal(tooFast("a", 1000), true);
  assert.equal(tooFast("b", 1000), false);
  assert.equal(tooFast("a", 1000 + 60_001), false);
});

// ---------- the three modes ----------

test("mode: no key = sample, a key without a counter = closed, a key and a counter = live", () => {
  assert.equal(calilMode({}), "sample");
  assert.equal(calilMode({ CALIL_APPKEY: KEY }), "closed");
  assert.equal(calilMode({ CALIL_APPKEY: KEY, CALIL_COUNTER: counter() }), "live");
  assert.equal(calilMode({ CALIL_APPKEY: KEY, CALIL_COUNTER: counter(), CALIL_MODE: "sample" }), "sample");
});

test("sample mode: answers without ever calling Calil, and says it is a sample", async () => {
  const lib = await library({ request: req(libPath), env: {} });
  assert.deepEqual(await lib.json(), { mode: "sample", systems: SAMPLE_SYSTEMS });
  const res = await check({ request: req(checkPath("9780000000002,9780000000019")), env: {} });
  const body = await res.json();
  assert.equal(body.mode, "sample");
  assert.deepEqual(body.books.map((b) => b.isbn), ["9780000000002", "9780000000019"]);
  assert.deepEqual(await (await check({ request: req(checkPath("9780000000002,9780000000019")), env: {} })).json(), body);
  assert.equal(calilCalls.length, 0);
});

test("closed mode: a key without a counter never calls Calil", async () => {
  const env = { CALIL_APPKEY: KEY };
  assert.equal((await library({ request: req(libPath), env })).status, 503);
  assert.equal((await check({ request: req(checkPath()), env })).status, 503);
  assert.equal(calilCalls.length, 0);
});

// ---------- input checks ----------

test("library: only the 47 prefectures and a short, plain city name", async () => {
  for (const path of [
    "/api/calil/library",
    `/api/calil/library?pref=${encodeURIComponent("東京")}`,
    `/api/calil/library?pref=${encodeURIComponent("東京都")}&city=${encodeURIComponent("<script>")}`,
    `/api/calil/library?pref=${encodeURIComponent("東京都")}&city=${"あ".repeat(21)}`,
  ]) assert.equal((await library({ request: req(path), env: {} })).status, 400, path);
});

test("check: 1 to 10 valid ISBN-13s and a plain system id", async () => {
  const eleven = Array.from({ length: 11 }, () => BOOK).join(",");
  for (const path of [checkPath(""), checkPath("9780000000003"), checkPath(eleven), checkPath(BOOK, "x y"), checkPath(BOOK, "")]) {
    assert.equal((await check({ request: req(path), env: {} })).status, 400, path);
  }
});

// ---------- live mode ----------

test("library live: the counter is asked first, the key goes only to Calil, and only clean names come back", async () => {
  const c = counter();
  calilAnswers(Response.json([
    { systemid: "Tokyo_Chiyoda", systemname: "千代田区" },
    { systemid: "Tokyo_Chiyoda", systemname: "千代田区（二度目）" },
    { systemid: "bad id!", systemname: "x" },
    { systemid: "Univ_X", systemname: "" },
  ]));
  const res = await library({ request: req(libPath), env: { CALIL_APPKEY: KEY, CALIL_COUNTER: c } });
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { mode: "live", systems: [{ systemid: "Tokyo_Chiyoda", systemname: "千代田区" }] });
  assert.deepEqual(c.calls, [{ path: "/take", body: { kind: "library", n: 1 } }]);
  assert.match(calilCalls[0], new RegExp(`appkey=${KEY}`));
  assert.ok(!text.includes(KEY));
});

test("check live: waits 2.5 s between calls, counts every call, and tells 'no copy' apart from 'could not check'", async () => {
  const c = counter();
  calilAnswers(
    Response.json({ session: "s1", continue: 1, books: {} }),
    Response.json({
      continue: 0,
      books: {
        "9780000000002": { Tokyo_Chiyoda: { status: "OK", libkey: { "中央": "貸出可" } } },
        "9780000000019": { Tokyo_Chiyoda: { status: "OK", libkey: {} } },
        "9780000000026": { Tokyo_Chiyoda: { status: "Error" } },
      },
    }),
  );
  const res = await check({ request: req(checkPath("9780000000002,9780000000019,9780000000026")), env: { CALIL_APPKEY: KEY, CALIL_COUNTER: c } });
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.done, true);
  assert.deepEqual(body.books.map((b) => [b.state, b.libraries]), [["ok", { "中央": "貸出可" }], ["ok", {}], ["error", {}]]);
  assert.deepEqual(sleeps, [POLL_MS]);
  assert.ok(POLL_MS >= 2000);
  assert.equal(c.calls.length, 2);
  for (const call of c.calls) assert.deepEqual(call.body, { kind: "check", n: 3, system: "Tokyo_Chiyoda" });
  assert.match(calilCalls[1], /session=s1/);
  assert.ok(!text.includes(KEY));
});

test("live: a counter that says no, fails, or never answers means busy, and Calil is not called", async () => {
  for (const handler of [
    () => Response.json({ ok: false, reason: "busy" }),
    () => { throw new Error("offline"); },
    () => new Response("down", { status: 500 }),
    () => new Response("not json"),
    () => new Promise(() => {}),
  ]) {
    calilCalls = [];
    const env = { CALIL_APPKEY: KEY, CALIL_COUNTER: counter(handler) };
    assert.equal((await library({ request: req(libPath), env })).status, 429);
    assert.equal((await check({ request: req(checkPath()), env })).status, 429);
    assert.equal(calilCalls.length, 0);
  }
});

test("live: when Calil refuses, everyone is asked to rest and the page hears busy", async () => {
  for (const status of [403, 429, 503]) {
    const c = counter();
    calilAnswers(new Response("", { status }));
    const res = await check({ request: req(checkPath()), env: { CALIL_APPKEY: KEY, CALIL_COUNTER: c } });
    assert.equal(res.status, 429);
    assert.deepEqual(c.calls.map((x) => x.path), ["/take", "/rest"]);
  }
});

test("live: Calil still running after the last call is reported as not done, never as 'no copy'", async () => {
  const running = () => Response.json({ session: "s", continue: 1, books: { [BOOK]: { Tokyo_Chiyoda: { status: "Running" } } } });
  calilAnswers(running, running, running, running);
  const body = await (await check({ request: req(checkPath()), env: { CALIL_APPKEY: KEY, CALIL_COUNTER: counter() } })).json();
  assert.equal(body.done, false);
  assert.equal(body.books[0].state, "running");
  assert.equal(calilCalls.length, 4);
});
