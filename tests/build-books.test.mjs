import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, normalizeIsbn, buildBooks } from "../scripts/build-books.mjs";

const HEADER = "isbn,title,author,tags\n";

test("the shelf in the repository starts empty", () => {
  const rows = parseCsv(readFileSync(new URL("../data/books.csv", import.meta.url), "utf8"));
  assert.deepEqual(buildBooks(rows), { books: [], problems: [] });
  const json = JSON.parse(readFileSync(new URL("../public/data/books.json", import.meta.url), "utf8"));
  assert.deepEqual(json, { books: [] });
});

test("csv: quotes, commas and line breaks inside quotes, and a BOM", () => {
  const rows = parseCsv('﻿' + HEADER + '9780000000002,"A, B ""C""","x\ny",easy\r\n');
  assert.deepEqual(rows[1], ["9780000000002", 'A, B "C"', "x\ny", "easy"]);
});

test("isbn: hyphens are dropped and the check digit must be right", () => {
  assert.equal(normalizeIsbn("978-0-00-000000-2"), "9780000000002");
  assert.equal(normalizeIsbn("9780000000003"), null);
  assert.equal(normalizeIsbn("4000000000"), null);
  assert.equal(normalizeIsbn("<script>"), null);
});

test("books: tags split by |, duplicates and bad rows are reported, never guessed", () => {
  const csv = HEADER
    + "9780000000002,本A,作者A,easy|short|easy\n"
    + "9780000000002,本A again,,\n"
    + "9780000000003,本B,,\n"
    + "9780000000019,,作者C,\n"
    + "9780000000026,本D,,Bad Tag\n";
  const { books, problems } = buildBooks(parseCsv(csv));
  assert.deepEqual(books, [{ isbn: "9780000000002", title: "本A", author: "作者A", tags: ["easy", "short"] }]);
  assert.equal(problems.length, 4);
  assert.match(problems[0], /line 3: .*already on the shelf/);
  assert.match(problems[1], /line 4: .*check digit/);
  assert.match(problems[2], /line 5: the title is empty/);
  assert.match(problems[3], /line 6: tag "Bad Tag"/);
});

test("books: a wrong header writes nothing", () => {
  assert.deepEqual(buildBooks(parseCsv("title,isbn\nx,y\n")).books, []);
  assert.match(buildBooks(parseCsv("title,isbn\n")).problems[0], /first line/);
});
