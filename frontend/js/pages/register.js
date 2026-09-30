/* Registration screen */
(function () {
  const form = document.getElementById('register-form');
  const err = document.getElementById('reg-error');
  const R = QS.validate.rules;

  const v = QS.validate.attach(form, {
    name: [R.required('Full name'), R.minLen(2, 'Full name'), R.maxLen(60, 'Full name')],
    email: [R.required('Email'), R.email(), R.universityEmail(), R.maxLen(100, 'Email')],
    password: [R.required('Password'), R.password()],
    confirm: [R.required('Confirm password'), R.matches('password', 'Confirm password')],
    role: [R.oneOf(['student', 'admin'], 'role')]
  }, data => {
    if (QS.store.findUserByEmail(data.email)) {
      v.showError('email', 'An account with this email already exists. Sign in instead.');
      form.elements.email.focus();
      return;
    }
    QS.store.createUser(data);
    location.href = 'login.html?registered=1';
  });
  err.hidden = true;
})();
