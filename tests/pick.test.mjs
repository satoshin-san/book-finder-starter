import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBooks, visibleQuestions } from "../public/js/pick.js";
import { QUESTIONS } from "../public/js/tags.js";

// Made-up books for the tests (not a reading list)
const BOOKS = [
  { isbn: "9780000000002", title: "うみ", author: "", tags: ["easy", "short"] },
  { isbn: "9780000000019", title: "あさ", author: "", tags: ["easy"] },
  { isbn: "9780000000026", title: "そら", author: "", tags: ["think"] },
];

test("pick: more matching tags first, then by title; the same answers always give the same books", () => {
  const first = pickBooks(BOOKS, ["easy", "short"]);
  assert.deepEqual(first.map((b) => b.title), ["うみ", "あさ"]);
  for (let i = 0; i < 5; i++) assert.deepEqual(pickBooks([...BOOKS].reverse(), ["short", "easy"]), first);
});

test("pick: no answer or no match gives no books, and the limit holds", () => {
  assert.deepEqual(pickBooks(BOOKS, []), []);
  assert.deepEqual(pickBooks(BOOKS, [null]), []);
  assert.deepEqual(pickBooks(BOOKS, ["cheer"]), []);
  assert.equal(pickBooks(BOOKS, ["easy"], 1).length, 1);
});

test("questions: a choice no book can answer is hidden, and an empty question is dropped", () => {
  const shown = visibleQuestions(QUESTIONS, BOOKS);
  const mood = shown.find((q) => q.id === "mood");
  assert.deepEqual(mood.choices.map((c) => c.tag), ["think", "easy"]);
  assert.ok(shown.find((q) => q.id === "length"));
  assert.deepEqual(visibleQuestions(QUESTIONS, []), []);
});

test("questions: every question has an id, words, and tags in the same form as the CSV", () => {
  for (const q of QUESTIONS) {
    assert.ok(q.id && q.text && q.choices.length);
    for (const c of q.choices) assert.ok(c.tag === null || /^[a-z0-9][a-z0-9_-]{0,31}$/.test(c.tag), c.label);
  }
});
