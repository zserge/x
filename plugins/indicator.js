// indicator.js — x.js plugin: show/hide [x-indicator] elements during requests.
// Also toggles the .htmx-request CSS class on the triggering element.
(function () {
  const clear = (el) => {
    el.classList.remove("htmx-request");
    const sel = el.closest("[x-indicator]")?.getAttribute("x-indicator");
    if (sel)
      document.querySelectorAll(sel).forEach((i) => (i.style.display = "none"));
  };
  document.body.addEventListener("x:beforeSend", (e) => {
    const { el } = e.detail;
    el.classList.add("htmx-request");
    const sel = el.closest("[x-indicator]")?.getAttribute("x-indicator");
    if (sel)
      document.querySelectorAll(sel).forEach((i) => (i.style.display = ""));
  });

  document.body.addEventListener("x:afterSwap", (e) => clear(e.detail.el));
  document.body.addEventListener("x:aborted", (e) => clear(e.detail.el));
  document.body.addEventListener("x:error", (e) => clear(e.detail.el));
})();
