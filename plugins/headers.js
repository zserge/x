// headers.js — x.js plugin: add custom request headers.
// <button x-get="/api" x-headers='{"Authorization":"Bearer tkn"}'>load</button>
(function () {
  document.body.addEventListener("x:beforeSend", (e) => {
    const raw = e.detail.el.closest("[x-headers]")?.getAttribute("x-headers");
    if (!raw) return;
    try {
      const hdrs = JSON.parse(raw);
      Object.entries(hdrs).forEach(([k, v]) => (e.detail.opts.headers[k] = v));
    } catch {
      /* ignore malformed JSON */
    }
  });
})();
