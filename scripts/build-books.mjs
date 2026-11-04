// Build public/data/books.json from data/books.csv, the shelf you fill yourself.
// Run on your own computer: npm run build:books
// Nothing here talks to the network; it only checks and converts what you wrote.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeIsbn } from "../public/js/isbn.js";

export { normalizeIsbn };

export const COLUMNS = ["isbn", "title", "author", "tags"];
const TAG = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_TEXT = 200;

// A small CSV reader: commas, double quotes, "" inside quotes, and line breaks inside quotes
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// Rows -> books. Problems are collected, never guessed away, so you can fix them yourself.
export function buildBooks(rows) {
  const problems = [];
  if (!rows.length) return { books: [], problems: ["the CSV is empty: it needs the header line isbn,title,author,tags"] };
  const header = rows[0].map((h) => h.trim());
  if (COLUMNS.some((col, i) => header[i] !== col)) {
    return { books: [], problems: [`the first line must be: ${COLUMNS.join(",")}`] };
  }
  const books = [];
  const seen = new Set();
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [isbnRaw = "", title = "", author = "", tagsRaw = ""] = cells.map((c) => c.trim());
    const isbn = normalizeIsbn(isbnRaw);
    if (!isbn) return problems.push(`line ${line}: "${isbnRaw}" is not an ISBN-13 with a correct check digit`);
    if (seen.has(isbn)) return problems.push(`line ${line}: ${isbn} is already on the shelf`);
    if (!title) return problems.push(`line ${line}: the title is empty`);
    if (title.length > MAX_TEXT || author.length > MAX_TEXT) return problems.push(`line ${line}: the title or author is too long`);
    const tags = tagsRaw ? tagsRaw.split("|").map((t) => t.trim()).filter(Boolean) : [];
    const bad = tags.find((t) => !TAG.test(t));
    if (bad) return problems.push(`line ${line}: tag "${bad}" may use only a-z, 0-9, _ and -`);
    seen.add(isbn);
    books.push({ isbn, title, author, tags: [...new Set(tags)] });
  });
  return { books, problems };
}

function main() {
  const csv = new URL("../data/books.csv", import.meta.url);
  const out = new URL("../public/data/books.json", import.meta.url);
  const { books, problems } = buildBooks(parseCsv(readFileSync(csv, "utf8")));
  if (problems.length) {
    console.error(`Nothing was written. Please fix data/books.csv:\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(out, `${JSON.stringify({ books }, null, 2)}\n`);
  console.log(`${books.length} book(s) -> public/data/books.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
