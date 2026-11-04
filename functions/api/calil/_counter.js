// Ask the counter (a Durable Object bound as CALIL_COUNTER) before every call to Calil,
// so all visitors together stay under Calil's hourly limit.
// If the counter is missing, fails, or is too slow, the answer is "no": the relay closes instead of
// guessing, because a guess in every copy of the relay could add up past the limit. Not a route.

export const counterSettings = { waitMs: 1500 }; // tests may shorten the wait

export function counterBound(env) {
  const ns = env?.CALIL_COUNTER;
  return Boolean(ns && typeof ns.idFromName === "function");
}

async function ask(env, path, body) {
  if (!counterBound(env)) return null;
  let timer;
  try {
    const stub = env.CALIL_COUNTER.get(env.CALIL_COUNTER.idFromName("calil"));
    const res = await Promise.race([
      stub.fetch(`https://counter${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("counter_timeout")), counterSettings.waitMs); }),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data.ok === "boolean" ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// May we make a call that Calil counts as n (books for check, 1 for library)? Only a clear yes is yes.
export async function mayCallCalil(env, kind, n, system = "") {
  const body = system ? { kind, n, system } : { kind, n };
  const answer = await ask(env, "/take", body);
  return answer?.ok === true;
}

// Calil refused us: ask the counter to make everyone wait a while
export async function restCalil(env) {
  await ask(env, "/rest", {});
}
