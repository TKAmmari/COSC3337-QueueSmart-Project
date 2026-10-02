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

  //  PASSWORD strength meter logic 
  const pwdInput = document.getElementById('password');
  const meterContainer = document.getElementById('pwd-strength-container');
  const strengthText = document.getElementById('pwd-strength-text');
  const strengthHint = document.getElementById('pwd-strength-hint');
  const bars = [
    document.getElementById('str-bar-1'),
    document.getElementById('str-bar-2'),
    document.getElementById('str-bar-3'),
    document.getElementById('str-bar-4')
  ];

  pwdInput.addEventListener('input', () => {
    const val = pwdInput.value;
    if (!val) {
      meterContainer.style.display = 'none';
      return;
    }

    meterContainer.style.display = 'block';

    // Calculate strength score (0 to 4)
    let score = 0;
    if (val.length >= 8) score++;
    if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    // Color definitions matching password strentgh
    const levels = [
      { text: 'Weak', color: '#c8102e', hint: 'Add uppercase, numbers, or symbols' },
      { text: 'Fair', color: '#f59e0b', hint: 'Good start, add symbols or more characters' },
      { text: 'Good', color: '#33548f', hint: 'Strong password' },
      { text: 'Great!', color: '#1c7a4b', hint: 'Meets all university security guidelines' }
    ];

    const currentLevel = levels[Math.max(0, score - 1)];

    strengthText.textContent = `Strength: ${currentLevel.text}`;
    strengthText.style.color = currentLevel.color;
    strengthHint.textContent = currentLevel.hint;

    bars.forEach((bar, index) => {
      bar.style.background = index < score ? currentLevel.color : '#e2e8f0';
    });
  });
  
})();