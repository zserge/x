// select.js — x.js plugin: extract a CSS fragment from the response.
// <button x-get="/page" x-select="#content" x-target="#main">load</button>
(function () {
  document.body.addEventListener("x:beforeSwap", (e) => {
    const sel = e.detail.el.closest("[x-select]")?.getAttribute("x-select");
    if (!sel) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = e.detail.html;
    const match = tpl.content.querySelector(sel);
    if (match) e.detail.html = match.outerHTML || match.textContent;
  });
})();
