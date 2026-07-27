// vals.js — x.js plugin: inject extra values into the request.
// <button x-post="/save" x-vals='{"priority":"high","source":"web"}'>save</button>
// For forms, merges into FormData. For non-forms, sets as JSON body.
(function () {
  document.body.addEventListener('x:beforeSend', e => {
    const raw = e.detail.el.closest('[x-vals]')?.getAttribute('x-vals');
    if (!raw || e.detail.opts.method === 'GET') return;
    let vals;
    try { vals = JSON.parse(raw); } catch { return; }

    if (e.detail.el.matches('form')) {
      // FormData: append each key-value pair
      const fd = e.detail.opts.body instanceof URLSearchParams
        ? e.detail.opts.body : new URLSearchParams(e.detail.opts.body || '');
      Object.entries(vals).forEach(([k, v]) => fd.append(k, v));
      e.detail.opts.body = fd;
    } else {
      // JSON body for non-form requests
      e.detail.opts.body = JSON.stringify(vals);
      e.detail.opts.headers['Content-Type'] = 'application/json';
    }
  });
})();
