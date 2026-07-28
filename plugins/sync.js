// sync.js — x.js plugin: abort competing requests to the same target.
// <input x-get="/search" x-target="#results" x-trigger="keyup changed delay:200" x-sync>
// Modes: x-sync (default: replace), x-sync="abort", x-sync="drop", x-sync="queue"
(function () {
  const inflight = new Map();  // target selector → AbortController

  document.body.addEventListener('x:beforeSend', e => {
    const owner = e.detail.el.closest('[x-sync]');
    if (!owner) return;
    const mode = owner.getAttribute('x-sync') || 'replace';
    const key = e.detail.target.id || e.detail.url;

    if (mode === 'drop' && inflight.has(key)) {
      e.preventDefault();  // just skip
      return;
    }
    if (mode === 'abort' || mode === 'replace') {
      const prev = inflight.get(key);
      if (prev) prev.abort();
    }
    const ctrl = new AbortController();
    inflight.set(key, ctrl);
    e.detail.opts.signal = ctrl.signal;
  });

  // Clean up after swap or error
  const cleanup = e => {
    const key = e.detail.target?.id || e.detail.url;
    inflight.delete(key);
  };
  document.body.addEventListener('x:afterSwap', cleanup);
  document.body.addEventListener('x:error', cleanup);
})();
