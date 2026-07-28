// disable.js — x.js plugin: disable element during request, prevent double-submit.
// <button x-post="/submit" x-disable>save</button>
(function () {
  document.body.addEventListener('x:beforeSend', e => {
    const el = e.detail.el;
    if (el.closest('[x-disable]')) {
      el._xWasDisabled = el.disabled;
      el.disabled = true;
    }
  });
  const restore = e => {
    const el = e.detail.el;
    if (el._xWasDisabled !== undefined) {
      el.disabled = el._xWasDisabled;
      delete el._xWasDisabled;
    }
  };
  document.body.addEventListener('x:afterSwap', restore);
  document.body.addEventListener('x:aborted', restore);
  document.body.addEventListener('x:error', restore);
})();
