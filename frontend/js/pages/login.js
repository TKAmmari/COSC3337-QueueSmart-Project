/* Login screen */
(function () {
  const already = QS.auth.current();
  if (already) { location.replace(QS.auth.home(already)); return; }

  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  const info = document.getElementById('login-info');
  const R = QS.validate.rules;

  if (QS.fmt.param('registered')) {
    info.hidden = false;
    info.textContent = 'Account created. We sent a verification link to your email (simulated). You can sign in now.';
  }

  QS.validate.attach(form, {
    email: [R.required('Email'), R.email(), R.maxLen(100, 'Email')],
    password: [R.required('Password')]
  }, data => {
    const user = QS.store.findUserByEmail(data.email);
    if (!user || user.password !== data.password) {
      err.hidden = false;
      err.textContent = 'That email and password don’t match an account. Check both and try again.';
      form.elements.password.value = '';
      form.elements.password.focus();
      return;
    }
    QS.auth.login(user);
    location.href = QS.auth.home(user);
  });

  document.getElementById('reset-demo').addEventListener('click', () => {
    QS.store.reset();
    info.hidden = false; err.hidden = true;
    info.textContent = 'Demo data was reset to the original mock data.';
  });

   
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword
        ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  });
  
})();