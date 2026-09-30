/* Service management: create or edit services */
(function () {
  const shell = QS.shell.mount({ role: 'admin', title: 'Service management', active: 'services.html' });
  if (!shell) return;
  const { main } = shell;
  const { esc, priority } = QS.fmt;
  const R = QS.validate.rules;
  let editing = QS.fmt.param('edit');

  main.innerHTML = `
    <div class="grid-side" style="grid-template-columns:1fr 1.1fr">
      <section class="panel"><div class="panel-head"><h2>Services</h2><button class="btn btn-ghost btn-sm" type="button" data-new>New service</button></div><ul class="svc-list" id="svc-list"></ul></section>
      <section class="panel">
        <div class="panel-head"><h2 id="form-title">New service</h2></div>
        <form id="svc-form">
          <div class="field">
            <div class="field-row"><label for="name">Service name<span class="req" aria-hidden="true">*</span></label><span class="counter" id="name-count"></span></div>
            <input class="input" id="name" name="name" type="text" maxlength="100" data-counter="name-count" required>
          </div>
          <div class="field">
            <div class="field-row"><label for="description">Description<span class="req" aria-hidden="true">*</span></label><span class="counter" id="desc-count"></span></div>
            <textarea class="input" id="description" name="description" maxlength="500" data-counter="desc-count" required></textarea>
            <span class="hint">Students see this when choosing a service.</span>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="duration">Expected duration (minutes)<span class="req" aria-hidden="true">*</span></label>
              <input class="input" id="duration" name="duration" type="number" min="1" max="240" step="1" inputmode="numeric" required>
              <span class="hint">Used to estimate wait times. 1 to 240.</span>
            </div>
            <fieldset class="field">
              <legend>Priority level<span class="req" aria-hidden="true">*</span></legend>
              <div class="segmented">
                <label><input type="radio" name="priority" value="low"><span>Low</span></label>
                <label><input type="radio" name="priority" value="medium"><span>Medium</span></label>
                <label><input type="radio" name="priority" value="high"><span>High</span></label>
              </div>
            </fieldset>
          </div>
          <div class="btn-row"><button class="btn btn-primary" type="submit" id="save-btn">Create service</button><button class="btn btn-ghost" type="button" data-cancel>Cancel</button></div>
        </form>
      </section>
    </div>`;

  const form = main.querySelector('#svc-form');
  const validator = QS.validate.attach(form, {
    name: [R.required('Service name'), R.maxLen(100, 'Service name'), (v) => {
      const dup = QS.store.getServices().find(s => s.name.toLowerCase() === v.trim().toLowerCase() && s.id !== editing);
      return dup ? 'A service with this name already exists.' : '';
    }],
    description: [R.required('Description'), R.maxLen(500, 'Description')],
    duration: [R.required('Expected duration'), R.integer(1, 240, 'Expected duration')],
    priority: [R.oneOf(['low', 'medium', 'high'], 'priority level')]
  }, data => {
    const saved = QS.store.saveService({ id: editing || undefined, name: data.name.trim(), description: data.description.trim(), duration: Number(data.duration), priority: data.priority });
    QS.ui.toast(editing ? `Saved changes to ${saved.name}.` : `Created ${saved.name}. Its queue is open.`, 'success');
    load(saved.id);
  });

  function load(id) {
    editing = id || null;
    const s = id ? QS.store.getService(id) : null;
    form.reset();
    form.querySelectorAll('.field').forEach(f => { f.classList.remove('is-invalid'); const e = f.querySelector('.field-error'); if (e) e.textContent = ''; });
    if (s) {
      form.elements.name.value = s.name; form.elements.description.value = s.description;
      form.elements.duration.value = s.duration;
      form.querySelector(`input[name=priority][value=${s.priority}]`).checked = true;
    }
    form.querySelectorAll('[data-counter]').forEach(el => el.dispatchEvent(new Event('input')));
    main.querySelector('#form-title').textContent = s ? `Edit ${s.name}` : 'New service';
    main.querySelector('#save-btn').textContent = s ? 'Save changes' : 'Create service';
    history.replaceState(null, '', s ? `services.html?edit=${s.id}` : 'services.html');
    renderList();
  }

  function renderList() {
    main.querySelector('#svc-list').innerHTML = QS.store.getServices().map(s => `<li>
      <div><span class="name">${esc(s.name)}</span><span class="small muted" style="display:block">${s.duration} min, ${s.open ? 'open' : 'closed'}</span></div>
      <span class="acts">${priority(s.priority)}<button class="btn btn-sm ${s.id === editing ? 'btn-primary' : 'btn-ghost'}" type="button" data-edit="${s.id}"${s.id === editing ? ' aria-current="true"' : ''}>${s.id === editing ? 'Editing' : 'Edit'}</button></span></li>`).join('');
    main.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => load(b.dataset.edit)));
  }

  main.querySelector('[data-new]').addEventListener('click', () => { load(null); form.elements.name.focus(); });
  main.querySelector('[data-cancel]').addEventListener('click', () => load(null));
  load(editing && QS.store.getService(editing) ? editing : null);
  void validator;
})();
