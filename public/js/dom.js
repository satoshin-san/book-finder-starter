// Building the page safely: text always goes in as text, never as HTML.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key.startsWith("on")) continue; // event handlers are never written as text
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Only https links on known hosts become links; anything else (javascript:, data:, http:, other sites) is dropped
export function safeUrl(href, hosts) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return hosts.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

// A link that leaves this site: opens in a new tab and tells the next site nothing about this page
export function externalLink(href, text, hosts) {
  const url = safeUrl(href, hosts);
  return url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text) : null;
}
