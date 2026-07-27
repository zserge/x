// validate.js — x.js plugin: run browser validation before request.
// <form x-post="/submit" x-validate>...</form>
// Only applies to forms and inputs. Calls checkValidity() + reportValidity().
(function () {
  document.body.addEventListener("x:beforeSend", (e) => {
    const el = e.detail.el;
    if (!el.matches("form,input,select,textarea")) return;
    const validate = el.closest("[x-validate]");
    if (!validate) return;

    const form = el.matches("form") ? el : el.closest("form");
    const target = form || el;
    if (!target.checkValidity()) {
      target.reportValidity();
      e.preventDefault();
    }
  });
})();
