/* Student dashboard: current queue status, available services, notifications summary */
(function () {
  const shell = QS.shell.mount({ role: 'student', title: 'Dashboard', active: 'dashboard.html' });
  if (!shell) return;
  const { user, main } = shell;
  const { esc, mins, ago } = QS.fmt;

  function render() {
    const found = QS.store.findEntry(user.id);
    const called = QS.store.getCalled(user.id);
    const services = QS.store.getServices();
    const notes = QS.store.getNotifications(user.id);
    const unread = notes.filter(n => !n.read).length;

    let current;
    if (found) {
      current = QS.ui.ticket(found, {
        small: true,
        extra: `<div class="btn-row" style="margin-top:18px"><a class="btn btn-primary btn-sm" href="status.html">View queue status</a>
                <button class="btn btn-danger btn-sm" type="button" data-leave>Leave queue</button></div>`
      });
    } else if (called) {
      current = `<div class="panel"><div class="panel-head"><h2>It's your turn</h2><span class="pill st-served">Served</span></div>
        <p>Please go to the <strong>${esc(called.service)}</strong> advisor now.</p></div>`;
    } else {
      current = `<div class="panel empty"><h2>You're not in a queue</h2><p>Pick an advising service to get a place in line and an estimated wait.</p>
        <a class="btn btn-primary" href="join.html">Join a queue</a></div>`;
    }

    const rows = services.map(s => {
      const len = QS.store.getQueue(s.id).length;
      return `<li><div><span class="name">${esc(s.name)}</span>
          <span class="small muted" style="display:block">${s.open ? `${len} waiting, ${mins(QS.store.estimateWait(s.id, QS.store.projectedPosition(s.id)))} wait` : 'Closed today'}</span></div>
        ${s.open ? `<a class="btn btn-ghost btn-sm" href="join.html?service=${s.id}">Join</a>` : '<span class="pill st-closed">Closed</span>'}</li>`;
    }).join('');

    main.innerHTML = `
      <p class="lede">Hi ${esc(user.name.split(' ')[0])}. Here's where things stand at the Advising Center today.</p>
      <div class="grid-2">
        <div class="stack">
          <section aria-labelledby="cur-h"><h2 id="cur-h" class="sr">Current queue</h2>${current}</section>
          <section class="panel" aria-labelledby="svc-h">
            <div class="panel-head"><h2 id="svc-h">Available services</h2><span class="small muted">${services.filter(s => s.open).length} of ${services.length} open</span></div>
            <ul class="svc-list">${rows}</ul>
          </section>
        </div>
        <section class="panel" aria-labelledby="not-h">
          <div class="panel-head"><h2 id="not-h">Notifications</h2><span class="small muted">${unread} unread</span></div>
          <ul class="notif-list" style="max-height:none">${notes.length ? notes.slice(0, 5).map(n =>
            `<li class="notif ${n.read ? '' : 'is-unread'}"><p>${esc(n.text)}</p><time>${ago(n.time)}</time></li>`).join('')
            : '<li class="empty-small">No notifications yet.</li>'}</ul>
          ${unread ? '<p style="margin-top:12px"><button class="link" type="button" data-readall2>Mark all as read</button></p>' : ''}
        </section>
      </div>`;

    const leave = main.querySelector('[data-leave]');
    if (leave) leave.addEventListener('click', async () => {
      if (await QS.ui.confirm({ title: 'Leave this queue?', body: 'You will lose your place in line. You can join again later, but you will start at the back.', action: 'Leave queue', danger: true })) {
        QS.store.leaveQueue(user.id);
      }
    });
    const ra = main.querySelector('[data-readall2]');
    if (ra) ra.addEventListener('click', () => QS.store.markAllRead(user.id));
  }

  render();
  document.addEventListener('qs:change', render);
})();
