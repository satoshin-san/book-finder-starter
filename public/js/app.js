// The page: load your shelf, ask the questions, show the books that fit.

import { h } from "./dom.js";
import { QUESTIONS } from "./tags.js";
import { pickBooks, visibleQuestions } from "./pick.js";
import { libraryPanel } from "./library.js";

const main = document.getElementById("main");

async function loadBooks() {
  const res = await fetch("data/books.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`books.json: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.books) ? data.books : [];
}

function emptyShelf() {
  return h("section", { class: "card" },
    h("h2", {}, "本棚は まだ 0冊です"),
    h("p", {}, "data/books.csv に、あなたの好きな本を 書いてください。"),
    h("p", {}, "そのあと、npm run build:books を動かすと、ここに 本が並びます。"));
}

function bookCard(book) {
  return h("li", { class: "book" },
    h("p", { class: "title" }, book.title),
    book.author ? h("p", { class: "author" }, book.author) : null,
    h("p", { class: "isbn" }, `ISBN ${book.isbn}`),
    libraryPanel(book));
}

function questionsView(books) {
  const questions = visibleQuestions(QUESTIONS, books);
  const answers = new Map();
  const result = h("section", { class: "result", "aria-live": "polite" });

  const showPicks = () => {
    const picks = pickBooks(books, [...answers.values()]);
    result.replaceChildren(picks.length
      ? h("ul", { class: "books" }, picks.map(bookCard))
      : h("p", { class: "note" }, "答えを えらぶと、合う本が 出ます。"));
  };

  const blocks = questions.map((q) => h("fieldset", { class: "question" },
    h("legend", {}, q.text),
    q.choices.map((c) => h("button", {
      type: "button",
      class: "choice",
      "aria-pressed": "false",
      onclick: (e) => {
        answers.set(q.id, c.tag);
        for (const b of e.currentTarget.parentElement.querySelectorAll(".choice")) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        showPicks();
      },
    }, c.label))));

  showPicks();
  return h("div", {}, blocks, result);
}

async function start() {
  try {
    const books = await loadBooks();
    main.replaceChildren(books.length ? questionsView(books) : emptyShelf());
  } catch {
    main.replaceChildren(h("p", { class: "note" }, "本棚を 読みこめませんでした。public/data/books.json を 確かめてください。"));
  }
}

start();
