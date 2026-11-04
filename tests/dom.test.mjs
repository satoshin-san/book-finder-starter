import { test } from "node:test";
import assert from "node:assert/strict";
import { safeUrl } from "../public/js/dom.js";

const HOSTS = ["calil.jp"];

test("links: only https on a known host", () => {
  assert.equal(safeUrl("https://calil.jp/book/4000000000", HOSTS), "https://calil.jp/book/4000000000");
  assert.equal(safeUrl("http://calil.jp/", HOSTS), null);
  assert.equal(safeUrl("https://evil.example/", HOSTS), null);
  assert.equal(safeUrl("https://calil.jp.evil.example/", HOSTS), null);
  assert.equal(safeUrl("javascript:alert(1)", HOSTS), null);
  assert.equal(safeUrl("data:text/html,x", HOSTS), null);
  assert.equal(safeUrl("https://user:pass@calil.jp/", HOSTS), null);
  assert.equal(safeUrl("not a url", HOSTS), null);
});
