// confirm.js — x.js plugin: show confirm() dialog before sending.
(function () {
  document.body.addEventListener('x:beforeSend', e => {
    const msg = e.detail.el.closest('[x-confirm]')?.getAttribute('x-confirm');
    if (msg && !confirm(msg)) e.preventDefault();  // cancel the send
  });
})();
