// "図書館で 確かめる" under each book: choose an area, then a library system, then see the answer.
// The page talks only to this site's relay (/api/calil/...); the relay holds the key.

import { h, externalLink } from "./dom.js";
import { PREFECTURES } from "./prefectures.js";
import { isbn10Of } from "./isbn.js";

const LINK_HOSTS = ["calil.jp"];

const ERROR_WORDS = {
  busy: "いま こんでいます。少し時間をおいて、もう一度 お試しください。",
  closed: "いまは 図書館を 調べられない設定です。",
  paused: "いまは 図書館を 調べるのを お休みしています。",
  too_many_requests: "少し まってから、もう一度 お試しください。",
};

async function getJson(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "unavailable");
  return data;
}

function calilLink(isbn) {
  const isbn10 = isbn10Of(isbn);
  return isbn10 ? externalLink(`https://calil.jp/book/${isbn10}`, "カーリルで 見る ↗", LINK_HOSTS) : null;
}

function credit() {
  return h("p", { class: "credit" }, "図書館の蔵書：", externalLink("https://calil.jp/", "カーリル", LINK_HOSTS));
}

function sampleNote(mode) {
  return mode === "sample" ? h("p", { class: "sample" }, "🧪 見本モードです。本物の図書館には つながっていません。") : null;
}

function answerView(book, data) {
  const found = data.books?.[0];
  const rows = Object.entries(found?.libraries || {});
  let body;
  if (!found || found.state === "error") body = h("p", { class: "note" }, "この本は、いまは 調べられませんでした。");
  else if (found.state === "running" || !data.done) body = h("p", { class: "note" }, "まだ 調べています。少し時間をおいて、もう一度 お試しください。");
  else if (!rows.length) body = h("p", { class: "note" }, "この図書館には、この本は ないようです。");
  else body = h("ul", { class: "libraries" }, rows.map(([name, status]) => h("li", {}, h("span", {}, name), " ", h("strong", {}, status))));
  // Sample answers are not Calil's, so they carry no Calil link or credit
  return data.mode === "sample" ? [sampleNote(data.mode), body] : [body, calilLink(book.isbn), credit()];
}

export function libraryPanel(book) {
  const result = h("div", { class: "lib-result", "aria-live": "polite" });
  const pref = h("select", { "aria-label": "都道府県" },
    h("option", { value: "" }, "都道府県を えらぶ"),
    PREFECTURES.map((p) => h("option", { value: p }, p)));
  const city = h("input", { type: "text", "aria-label": "市区町村（なくてもOK）", placeholder: "市区町村（なくてもOK）", maxlength: "20" });

  const showError = (err) => {
    const words = ERROR_WORDS[err.message] || "いまは 調べられませんでした。少し時間をおいて、もう一度 お試しください。";
    result.replaceChildren(h("p", { class: "note" }, words), calilLink(book.isbn));
  };

  const check = async (systemid) => {
    result.replaceChildren(h("p", { class: "note" }, "調べています…"));
    try {
      const params = new URLSearchParams({ isbn: book.isbn, systemid });
      result.replaceChildren(...answerView(book, await getJson(`/api/calil/check?${params}`)).filter(Boolean));
    } catch (err) {
      showError(err);
    }
  };

  const search = h("button", { type: "button", class: "choice", onclick: async () => {
    if (!pref.value) {
      result.replaceChildren(h("p", { class: "note" }, "まず、都道府県を えらんでください。"));
      return;
    }
    result.replaceChildren(h("p", { class: "note" }, "図書館を さがしています…"));
    try {
      const params = new URLSearchParams({ pref: pref.value });
      if (city.value.trim()) params.set("city", city.value.trim());
      const data = await getJson(`/api/calil/library?${params}`);
      if (!data.systems?.length) {
        result.replaceChildren(h("p", { class: "note" }, "この地域の図書館が 見つかりませんでした。"));
        return;
      }
      const pick = h("select", { "aria-label": "図書館" }, data.systems.map((s) => h("option", { value: s.systemid }, s.systemname)));
      result.replaceChildren(...[sampleNote(data.mode), pick,
        h("button", { type: "button", class: "choice", onclick: () => check(pick.value) }, "この図書館で 確かめる")].filter(Boolean));
    } catch (err) {
      showError(err);
    }
  } }, "図書館を さがす");

  return h("details", { class: "library" },
    h("summary", {}, "図書館で 確かめる"),
    h("div", { class: "lib-form" }, pref, city, search),
    result);
}
