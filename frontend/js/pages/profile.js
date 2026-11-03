/* My profile: view and edit the signed-in user's profile (user_profile table, A4).
 * Students and advisors both use this page. Email and role come from user_credentials
 * and can't be changed here. */
(function () {
  const shell = QS.shell.mount({ title: 'My profile', active: 'profile.html' });
  if (!shell) return;
  const { main } = shell;
  const { esc, date, time } = QS.fmt;
  const R = QS.validate.rules;
  const CONTACT = { 'in-app': 'In-app notifications', email: 'Email', phone: 'Phone' };

  main.innerHTML = `
    <p class="lede">Your contact details and how you'd like to hear from the advising center. This is saved to your account, so it's the same on every device.</p>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>Edit profile</h2></div>
        <form id="profile-form">
          <div class="field">
            <div class="field-row"><label for="name">Full name<span class="req" aria-hidden="true">*</span></label><span class="counter" id="name-count"></span></div>
            <input class="input" id="name" name="name" type="text" maxlength="60" autocomplete="name" data-counter="name-count" required>
            <span class="hint">Advisors see this name in the queue.</span>
          </div>
          <div class="field">
            <label for="phone">Phone (optional)</label>
            <input class="input" id="phone" name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="713-555-0100">
          </div>
          <fieldset class="field">
            <legend>Preferred contact method</legend>
            <div class="segmented">
              ${Object.entries(CONTACT).map(([value, label]) => `<label><input type="radio" name="contactMethod" value="${value}"><span>${label.replace(' notifications', '')}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="alert alert-error" id="profile-error" role="alert" hidden></div>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Save profile</button><button class="btn btn-ghost" type="button" data-reset>Undo changes</button></div>
        </form>
      </section>
      <aside class="panel summary" aria-labelledby="account-title">
        <div class="panel-head"><h2 id="account-title">Account</h2></div>
        <div id="account"></div>
      </aside>
    </div>`;

  const form = main.querySelector('#profile-form');
  const errorBox = main.querySelector('#profile-error');

  function fill(profile) {
    form.elements.name.value = profile.name;
    form.elements.phone.value = profile.phone;
    form.querySelectorAll('input[name="contactMethod"]').forEach(r => { r.checked = r.value === profile.preferences.contactMethod; });
    form.elements.name.dispatchEvent(new Event('input')); // refresh the character counter
    main.querySelector('#account').innerHTML = `<dl>
      <dt>Name</dt><dd>${esc(profile.name)}</dd>
      <dt>Email</dt><dd>${esc(profile.email)}</dd>
      <dt>Role</dt><dd>${profile.role === 'admin' ? 'Advisor (administrator)' : 'Student'}</dd>
      <dt>Phone</dt><dd>${profile.phone ? esc(profile.phone) : '<span class="muted">Not added</span>'}</dd>
      <dt>Contact by</dt><dd>${CONTACT[profile.preferences.contactMethod]}</dd>
      <dt>Last updated</dt><dd>${date(profile.updatedAt)}, ${time(profile.updatedAt)}</dd>
    </dl>`;
  }

  const validator = QS.validate.attach(form, {
    name: [R.required('Full name'), R.minLen(2, 'Full name'), R.maxLen(60, 'Full name')],
    phone: [R.maxLen(20, 'Phone'), v => (!v.trim() || /^[0-9+()\-.\s]{7,20}$/.test(v.trim()) ? '' : 'Enter a phone number like 713-555-0100.')],
    contactMethod: [R.oneOf(Object.keys(CONTACT), 'contact method'), (v, f) => (v === 'phone' && !f.elements.phone.value.trim() ? 'Add a phone number to be contacted by phone.' : '')]
  }, data => {
    errorBox.hidden = true;
    try {
      const saved = QS.store.saveProfile({ name: data.name.trim(), phone: data.phone.trim(), preferences: { contactMethod: data.contactMethod } });
      fill(saved);
      QS.ui.toast('Profile saved.', 'info');
    } catch (e) {
      // Server-side validation errors appear under the matching field.
      if (e.details && e.details.length) {
        e.details.forEach(d => validator.showError(d.field === 'contactMethod' ? 'contactMethod' : d.field, d.message));
      } else {
        errorBox.textContent = e.message;
        errorBox.hidden = false;
      }
    }
  });

  main.querySelector('[data-reset]').addEventListener('click', () => fill(QS.store.getProfile()));
  fill(QS.store.getProfile());
})();
