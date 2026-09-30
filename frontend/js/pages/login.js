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
})();
