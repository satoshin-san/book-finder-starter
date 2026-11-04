import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

// Everything here may be published (tests too), so these checks read every text file.
// Files ending in .local.txt stay on your computer (see .gitignore) and are skipped.
const ROOTS = ["public", "functions", "workers", "scripts", "data", "tests"];
const TEXT = /\.(js|mjs|html|css|json|csv|md|toml|txt)$|^_headers$/;

function files(dir) {
  const url = new URL(`../${dir}/`, import.meta.url);
  let names;
  try { names = readdirSync(url); } catch { return []; }
  return names.flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(new URL(`../${path}`, import.meta.url)).isDirectory()) return files(path);
    return TEXT.test(name) && !name.endsWith(".local.txt") ? [path] : [];
  });
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ALL = [...ROOTS.flatMap(files), "package.json", ".gitignore", "README.md", "SECURITY.md", "LICENSE", "LICENSE-MIT", "LICENSE-CC-BY-4.0"];

test("no secret-looking values in any file that may be published", () => {
  const SECRETS = [
    /AKIA[0-9A-Z]{16}/, // cloud access key
    /\bsk-[A-Za-z0-9_-]{20,}/, // AI service key
    /\bgh[pousr]_[A-Za-z0-9]{30,}/, // code hosting token
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bappkey\s*[=:]\s*["']?[0-9a-f]{16,}/i, // a real-looking library service key
  ];
  for (const path of ALL) {
    const text = read(path);
    for (const pattern of SECRETS) assert.doesNotMatch(text, pattern, path);
  }
});

test("comments name no one (only roles), so no one's name is published by accident", () => {
  const COMMENT = /\/\/.*$|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|^\s*#.*$/gm;
  for (const path of ALL.filter((p) => /\.(js|mjs|html|css)$/.test(p))) {
    for (const comment of read(path).match(COMMENT) || []) {
      assert.doesNotMatch(comment, /さん|ちゃん|くん/, `${path}: ${comment.trim().slice(0, 60)}`);
    }
  }
});

// The words of the app this starter came from (its characters, its book list, its brand) must not be
// published, not even here as a list. Keep them on your computer, one per line, in
// tests/world-words.local.txt; without that file there is nothing to look for, so the check is skipped.
test("the starter carries no world of the app it came from", (t) => {
  let words = [];
  try { words = read("tests/world-words.local.txt").split(/\r?\n/).map((w) => w.trim()).filter(Boolean); } catch {}
  if (!words.length) return t.skip("no local word list");
  for (const path of ALL) {
    const text = read(path);
    for (const word of words) assert.ok(!text.includes(word), `${path} has a word from the local list`);
  }
});

test("the shelf ships empty: no book data is published with the starter", () => {
  assert.equal(read("data/books.csv").trim(), "isbn,title,author,tags");
  assert.deepEqual(JSON.parse(read("public/data/books.json")), { books: [] });
});
