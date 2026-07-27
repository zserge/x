// history.js — x.js plugin: push/replace browser history on swap.
// Reads x-push-url / x-replace-url attributes or HX-Push-Url / HX-Replace-Url headers.
(function () {
  document.body.addEventListener('x:afterSwap', e => {
    // Don't push again when we're responding to a popstate event.
    if (window._xPopstate) { window._xPopstate = false; return; }

    const { el, url, response } = e.detail;
    const push = response?.headers.get('HX-Push-Url')
      || el.closest('[x-push-url]')?.getAttribute('x-push-url');
    const repl = response?.headers.get('HX-Replace-Url')
      || el.closest('[x-replace-url]')?.getAttribute('x-replace-url');
    if (push) history.pushState({}, '', push === 'true' ? url : push);
    if (repl) history.replaceState({}, '', repl === 'true' ? url : repl);
  });
})();
