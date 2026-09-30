/* Join Queue: choose a service, see the estimated wait, join or leave */
(function () {
  const shell = QS.shell.mount({ role: 'student', title: 'Join a queue', active: 'join.html' });
  if (!shell) return;
  const { user, main } = shell;
  const { esc, mins } = QS.fmt;
  const R = QS.validate.rules;
  let selected = QS.fmt.param('service');

  function render() {
    const found = QS.store.findEntry(user.id);
    const services = QS.store.getServices();
    const inQueue = !!found;
    if (selected) { const s = QS.store.getService(selected); if (!s || !s.open) selected = null; }

    const banner = inQueue ? `<div class="alert alert-info" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <span>You're already #${found.position} in <strong>${esc(QS.store.getService(found.serviceId).name)}</strong>. Leave that queue to join a different one.</span>
        <span class="btn-row"><a class="btn btn-ghost btn-sm" href="status.html">View status</a><button class="btn btn-danger btn-sm" type="button" data-leave>Leave queue</button></span></div>` : '';

    const choices = services.map(s => {
      const len = QS.store.getQueue(s.id).length;
      const disabled = !s.open || inQueue;
      return `<label class="choice${s.open ? '' : ' is-closed'}">
        <input type="radio" name="service" value="${s.id}" ${disabled ? 'disabled' : ''} ${selected === s.id ? 'checked' : ''}>
        <span><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p></span>
        <span class="facts">${s.open ? `<strong>${mins(QS.store.estimateWait(s.id, QS.store.projectedPosition(s.id)))}</strong>${len} in line` : '<strong>Closed</strong>Opens tomorrow'}</span>
      </label>`;
    }).join('');

    main.innerHTML = `${banner}
      <form id="join-form" class="grid-side">
        <fieldset class="field" style="margin:0">
          <legend class="sr">Choose a service</legend>
          <p class="lede" style="margin-bottom:14px">Choose the advising service you need. Wait times are estimates based on the students ahead of you and the advisors on duty.</p>
          <div class="choices">${choices}</div>
        </fieldset>
        <aside class="panel summary" aria-live="polite">
          <div class="panel-head"><h2>Your spot</h2></div>
          <div id="summary"></div>
          <div class="field">
            <div class="field-row"><label for="note">Note for the advisor <span class="muted" style="font-weight:400">(optional)</span></label><span class="counter" id="note-count"></span></div>
            <textarea class="input" id="note" name="note" maxlength="200" data-counter="note-count" placeholder="e.g. I have a registration hold on my account" ${inQueue ? 'disabled' : ''}></textarea>
            <span class="hint">Only advisors can see this. Other students never see your name or reason for visiting.</span>
          </div>
          <button class="btn btn-primary btn-block" type="submit" ${inQueue ? 'disabled' : ''}>Join queue</button>
          <p class="note" style="margin-top:14px">Time-sensitive cases, such as a hold blocking registration, may be seen first, so your position can change.</p>
        </aside>
      </form>`;

    renderSummary();
    const form = main.querySelector('#join-form');
    form.addEventListener('change', ev => { if (ev.target.name === 'service') { selected = ev.target.value; renderSummary(); } });
    QS.validate.attach(form, {
      service: [v => (v ? '' : 'Choose a service to join.')],
      note: [R.maxLen(200, 'Note')]
    }, data => {
      try {
        const pos = QS.store.joinQueue(user.id, data.service, data.note.trim());
        location.href = `status.html?joined=${pos}`;
      } catch (e) { QS.ui.toast(e.message, 'error'); }
    });
    const leave = main.querySelector('[data-leave]');
    if (leave) leave.addEventListener('click', async () => {
      if (await QS.ui.confirm({ title: 'Leave this queue?', body: 'You will lose your place in line.', action: 'Leave queue', danger: true })) QS.store.leaveQueue(user.id);
    });
  }

  function renderSummary() {
    const box = main.querySelector('#summary');
    if (!selected) { box.innerHTML = '<p class="muted" style="margin-bottom:18px">Select a service to see where you would be in line.</p>'; return; }
    const s = QS.store.getService(selected), pos = QS.store.projectedPosition(s.id);
    box.innerHTML = `<dl>
      <dt>Service</dt><dd>${esc(s.name)}</dd>
      <dt>Your position</dt><dd>#${pos}</dd>
      <dt>Estimated wait</dt><dd>${mins(QS.store.estimateWait(s.id, pos))}</dd>
      <dt>Session length</dt><dd>${s.duration} min</dd>
      <dt>Advisors on duty</dt><dd>${s.advisors}</dd></dl>`;
  }

  render();
  // Re-render when another tab changes the queues, or when this student joins/leaves.
  let wasIn = !!QS.store.findEntry(user.id);
  document.addEventListener('qs:change', ev => {
    const isIn = !!QS.store.findEntry(user.id);
    if ((ev.detail && ev.detail.external) || isIn !== wasIn) { wasIn = isIn; render(); }
  });
})();
