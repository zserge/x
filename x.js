(function () {
  "use strict";
  const attr = (el, name) => el.closest(`[${name}]`)?.getAttribute(name);

  const METHODS = ["get", "post", "put", "patch", "delete"];

  const SWAP = {
    outerHTML: (t, f) => t.replaceWith(f),
    beforebegin: (t, f) => t.before(f),
    afterbegin: (t, f) => t.prepend(f),
    beforeend: (t, f) => t.append(f),
    afterend: (t, f) => t.after(f),
    delete: (t) => t.remove(),
    none: () => {},
  };

  const defaultTrigger = (el) =>
    el.matches("form")
      ? "submit"
      : el.matches("input,select,textarea")
        ? "change"
        : "click";

  const resolve = (el, sel) => {
    if (!sel) return el;
    if (sel === "this") return el;
    if (sel === "next") return el.nextElementSibling;
    if (sel === "previous") return el.previousElementSibling;
    if (sel === "document") return document;
    if (sel === "body") return document.body;
    if (sel === "window") return window;
    if (sel.startsWith("closest ")) return el.closest(sel.slice(8));
    if (sel.startsWith("find ")) return el.querySelector(sel.slice(5));
    return document.querySelector(sel);
  };

  const parseTriggers = (s) => {
    const triggers = s.split(",").map((s) => s.trim());
    return triggers.map((trigger) => {
      const [event, ...rest] = trigger.split(" ");
      const options = {};
      rest.forEach((opt) => {
        const [key, value = true] = opt.split(":");
        options[key] = value;
      });
      return { event, options };
    });
  };

  const fire = (el, name, detail, cancelable) =>
    el.dispatchEvent(
      new CustomEvent(name, {
        detail,
        cancelable: !!cancelable,
        bubbles: true,
      }),
    );

  // swap the given HTML into the target element using the specified mode
  const swap = (mode, target, html) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    if (
      mode === "innerHTML" &&
      tpl.content.children.length === 1 &&
      tpl.content.firstElementChild.tagName === target.tagName
    ) {
      target.replaceChildren(...tpl.content.firstElementChild.childNodes);
      return;
    }
    (SWAP[mode] || ((t, f) => t.replaceChildren(f)))(target, tpl.content);
  };

  // send an HTTP request and swap the response into the target element
  const send = async (el, method, url) => {
    let target = resolve(el, attr(el, "x-target"));
    let mode = attr(el, "x-swap") || "innerHTML";
    const opts = {
      method: method.toUpperCase(),
      headers: { "HX-Request": "true" },
    };
    if (el.matches("form") && opts.method !== "GET")
      opts.body = new URLSearchParams(new FormData(el));
    if (!fire(el, "x:beforeSend", { el, url, target, mode, opts }, true))
      return;
    const response = await fetch(url, opts);
    const hdrTrigger = response.headers.get("HX-Trigger");
    if (hdrTrigger) {
      try {
        const data = JSON.parse(hdrTrigger);
        Object.entries(data).forEach(([ev, d]) => fire(document.body, ev, d));
      } catch {
        fire(document.body, hdrTrigger);
      }
    }
    if (response.headers.get("HX-Redirect")) {
      window.location.href = response.headers.get("HX-Redirect");
      return;
    }
    if (response.headers.get("HX-Refresh") === "true") {
      window.location.reload();
      return;
    }
    if (response.headers.get("HX-Retarget"))
      target = resolve(el, response.headers.get("HX-Retarget"));
    if (response.headers.get("HX-Reswap"))
      mode = response.headers.get("HX-Reswap");
    const html = await response.text();
    fire(el, "x:afterSend", { el, url, opts, target, mode, response, html });
    const detail = { el, url, target, mode, html, response };
    if (!fire(el, "x:beforeSwap", detail, true)) return;
    swap(detail.mode, detail.target, detail.html);
    fire(el, "x:afterSwap", detail);
    scan(detail.target); // rebind anything the swap just brought in
  };

  // process attributes and bind events to elements with x-get/x-post/x-put/x-patch/x-delete attributes
  const scan = (root = document.body) => {
    METHODS.forEach((m) => {
      const els = root.querySelectorAll(`[x-${m}]`);
      const list = root.matches?.(`[x-${m}]`) ? [root, ...els] : els;
      list.forEach((el) => {
        if (el.$_xbound) return;
        el.$_xbound = true;
        const raw = attr(el, "x-trigger") || defaultTrigger(el);
        parseTriggers(raw).forEach(({ event, options }) => {
          if (event === "load")
            return setTimeout(() => send(el, m, el.getAttribute(`x-${m}`)), 0);
          let fired, prevValue, delayTimer;
          el.addEventListener(event, (e) => {
            if (options.once && fired) return; // trigger once
            fired = true;
            // trigger only if value has changed:
            if (options.changed) {
              const prev = prevValue;
              prevValue = el.value;
              if (prev === el.value) return;
            }
            // trigger/send after a timeout:
            if (options.delay) {
              clearTimeout(delayTimer);
              delayTimer = setTimeout(
                () => send(el, m, el.getAttribute(`x-${m}`)),
                parseInt(options.delay),
              );
              return;
            }
            e?.preventDefault();
            send(el, m, el.getAttribute(`x-${m}`));
          });
        });
      });
    });
    fire(root, "x:scan", { root });
  };

  // initialise
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => scan())
    : scan();
  new MutationObserver((ms) => {
    for (const m of ms)
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) scan(n);
      });
  }).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // public API
  window.x = { send, swap, scan };
})();
