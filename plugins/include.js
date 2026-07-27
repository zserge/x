// include.js — x.js plugin: include values from another element in the request.
// <button x-post="/submit" x-include="#extra-fields">save</button>
(function () {
  document.body.addEventListener('x:beforeSend', e => {
    const sel = e.detail.el.closest('[x-include]')?.getAttribute('x-include');
    if (!sel) return;
    const src = document.querySelector(sel);
    if (!src || e.detail.opts.method === 'GET') return;

    if (src.matches('form')) {
      const extra = new URLSearchParams(new FormData(src));
      const fd = e.detail.opts.body instanceof URLSearchParams
        ? e.detail.opts.body : new URLSearchParams(e.detail.opts.body || '');
      extra.forEach((v, k) => fd.append(k, v));
      e.detail.opts.body = fd;
    } else if (src.matches('input,select,textarea')) {
      const fd = e.detail.opts.body instanceof URLSearchParams
        ? e.detail.opts.body : new URLSearchParams(e.detail.opts.body || '');
      fd.append(src.name || sel.slice(1), src.value);
      e.detail.opts.body = fd;
    }
  });
})();
