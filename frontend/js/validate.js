/* QueueSmart client-side validation.
 * Usage: QS.validate.attach(form, { fieldName: [rule, rule] }, onValid)
 * A rule is a function (value, form) => error message or '' when valid.
 * Errors show under the field, the field gets aria-invalid, and the first
 * invalid field is focused on submit. */
window.QS = window.QS || {};
(function (QS) {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  const rules = {
    required: label => v => (String(v).trim() ? '' : `${label} is required.`),
    minLen: (n, label) => v => (!v || v.trim().length >= n ? '' : `${label} must be at least ${n} characters.`),
    maxLen: (n, label) => v => (v.length <= n ? '' : `${label} must be ${n} characters or fewer (currently ${v.length}).`),
    email: () => v => (!v || EMAIL.test(v.trim()) ? '' : 'Enter a valid email address, like name@uh.edu.'),
    universityEmail: () => v => (!v || /@(uh\.edu|cougarnet\.uh\.edu)$/i.test(v.trim()) ? '' : 'Use your university email ending in @uh.edu or @cougarnet.uh.edu.'),
    password: () => v => {
      if (!v) return '';
      if (v.length < 8) return 'Password must be at least 8 characters.';
      if (!/[A-Z]/.test(v) || !/[a-z]/.test(v) || !/[0-9]/.test(v)) return 'Password needs an uppercase letter, a lowercase letter, and a number.';
      return '';
    },
    matches: (other, label) => (v, form) => (v === form.elements[other].value ? '' : `${label} must match the password.`),
    integer: (min, max, label) => v => {
      if (v === '') return '';
      const n = Number(v);
      if (!Number.isInteger(n)) return `${label} must be a whole number of minutes.`;
      if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
      return '';
    },
    oneOf: (list, label) => v => (list.indexOf(v) > -1 ? '' : `Choose a ${label}.`),
    notFuture: label => v => (!v || new Date(v + 'T00:00') <= today() ? '' : `${label} can't be in the future.`),
    notBefore: (other, label) => (v, form) => {
      const o = form.elements[other].value;
      return !v || !o || v >= o ? '' : `${label} must be on or after the start date.`;
    }
  };

  function valueOf(form, name) {
    const el = form.elements[name];
    if (!el) return '';
    if (el instanceof RadioNodeList || (el.length && el[0] && el[0].type === 'radio')) {
      const checked = Array.prototype.find.call(el, r => r.checked);
      return checked ? checked.value : '';
    }
    return el.value;
  }
  function fieldBox(form, name) {
    const el = form.elements[name];
    const node = el && (el.length && !el.tagName ? el[0] : el);
    return node ? node.closest('.field') : null;
  }
  function show(form, name, msg) {
    const box = fieldBox(form, name); if (!box) return;
    let err = box.querySelector('.field-error');
    if (!err) { err = document.createElement('p'); err.className = 'field-error'; err.id = `${form.id || 'f'}-${name}-error`; box.appendChild(err); }
    err.textContent = msg;
    box.classList.toggle('is-invalid', !!msg);
    box.querySelectorAll('input, select, textarea').forEach(i => {
      i.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) i.setAttribute('aria-describedby', err.id); else i.removeAttribute('aria-describedby');
    });
  }
  function check(form, schema, name) {
    const v = valueOf(form, name);
    for (const r of schema[name]) { const m = r(v, form); if (m) { show(form, name, m); return false; } }
    show(form, name, '');
    return true;
  }

  function attachCounters(form) {
    form.querySelectorAll('[data-counter]').forEach(el => {
      const out = form.querySelector(`#${el.dataset.counter}`), max = Number(el.getAttribute('maxlength') || el.dataset.max);
      const upd = () => { out.textContent = `${el.value.length}/${max}`; out.classList.toggle('is-near', el.value.length > max * 0.9); };
      el.addEventListener('input', upd); upd();
    });
  }

  QS.validate = {
    rules,
    attach(form, schema, onValid) {
      form.setAttribute('novalidate', '');
      const touched = {};
      Object.keys(schema).forEach(name => {
        const el = form.elements[name]; if (!el) return;
        const nodes = el.length && !el.tagName ? Array.prototype.slice.call(el) : [el];
        nodes.forEach(n => {
          if (n.type === 'radio' || n.tagName === 'SELECT' || n.type === 'date') {
            n.addEventListener('change', () => { touched[name] = true; check(form, schema, name); });
            return;
          }
          n.addEventListener('blur', ev => {
            // Skip when focus is moving to the submit button: the submit handler validates
            // everything, and showing the error now would shift the button mid-click.
            if (ev.relatedTarget && ev.relatedTarget.type === 'submit') return;
            touched[name] = true; check(form, schema, name);
          });
          n.addEventListener('input', () => { if (touched[name]) check(form, schema, name); });
        });
      });
      attachCounters(form);
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        let first = null;
        Object.keys(schema).forEach(name => { touched[name] = true; if (!check(form, schema, name) && !first) first = name; });
        if (first) {
          const el = form.elements[first];
          (el.length && !el.tagName ? el[0] : el).focus();
          return;
        }
        const data = {};
        Object.keys(schema).forEach(name => { data[name] = valueOf(form, name); });
        onValid(data, form);
      });
      return { showError: (name, msg) => show(form, name, msg) };
    }
  };
})(window.QS);
