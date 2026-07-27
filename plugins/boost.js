// boost.js — x.js plugin: intercept <a> and <form> inside [x-boost] containers.
// Calls x.send() so the core handles fetch, swap, and lifecycle events.
(function () {
  document.addEventListener('click', e => {
    const boosted = e.target.closest('[x-boost]');
    if (!boosted) return;
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || link.getAttribute('target')) return;
    e.preventDefault();
    window.x.send(boosted, 'get', href);
  });

  document.addEventListener('submit', e => {
    const boosted = e.target.closest('[x-boost]');
    if (!boosted) return;
    const form = e.target.closest('form');
    if (!form) return;
    // Only intercept if the form doesn't already have its own x-* handler.
    if (form.matches('[x-get],[x-post],[x-put],[x-delete],[x-patch]')) return;
    e.preventDefault();
    const method = (form.getAttribute('method') || 'post').toLowerCase();
    window.x.send(form, method, form.getAttribute('action') || location.href);
  });
})();
