// The counter: one Durable Object that counts every call the site makes to Calil.
// Only the site's relay reaches it, through a binding; the Worker's own address answers 404 to everyone.
//   POST /take {"kind":"check"|"library","n":1..,"system":"Tokyo_Chiyoda"?} -> {ok:true,...} | {ok:false,reason,...}
//   POST /rest {}                                                           -> {ok:true,until}

import { emptyBook, limitFor, rest, take, takeRequest } from "./book.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export class Counter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || (pathname !== "/take" && pathname !== "/rest")) return json({ error: "not_found" }, 404);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    const book = (await this.ctx.storage.get("book")) || emptyBook();
    const now = Date.now();
    let answer;
    if (pathname === "/rest") answer = rest(book, now);
    else {
      const wanted = takeRequest(body);
      if (!wanted) return json({ error: "bad_request" }, 400);
      answer = take(book, wanted, now, limitFor(this.env, wanted.kind));
    }
    try {
      await this.ctx.storage.put("book", book);
    } catch {
      return json({ ok: false, reason: "busy" }); // could not write: say no, so nothing goes uncounted
    }
    return json(answer);
  }
}

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
