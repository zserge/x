// oob.js — x.js plugin: out-of-band swaps.
//
// Elements in a response tagged with x-swap-oob are pulled out and
// swapped into the element with the same id already on the page,
// instead of the normal target — for pushing an unrelated update (a
// toast, a counter) alongside the main response, in one request.
//
//   <div id="toast" x-swap-oob>Saved!</div>
//
// The attribute's value is the swap mode (outerHTML by default). If
// nothing is left after OOB fragments are removed, the primary swap is
// cancelled — a response can be OOB-only.
//
// Runs on x:beforeSwap, same as x-select — if a page uses both on the
// same response, whichever plugin's listener runs first decides what's
// left for the other to see.
(function () {
  document.body.addEventListener('x:beforeSwap', e => {
    const tpl = document.createElement('template');
    tpl.innerHTML = e.detail.html;
    const oobs = tpl.content.querySelectorAll('[x-swap-oob]');
    if (!oobs.length) return;

    oobs.forEach(el => {
      const mode = el.getAttribute('x-swap-oob') || 'outerHTML';
      el.removeAttribute('x-swap-oob');
      const target = document.getElementById(el.id);
      const html = mode === 'outerHTML' ? el.outerHTML : el.innerHTML;
      el.remove();
      if (!target) return;
      window.x.swap(mode, target, html);
      const fresh = document.getElementById(el.id);
      if (fresh) window.x.scan(fresh);
    });

    if (tpl.content.children.length === 0 && !tpl.content.textContent.trim()) {
      e.preventDefault();
      return;
    }
    e.detail.html = tpl.innerHTML;
  });
})();
