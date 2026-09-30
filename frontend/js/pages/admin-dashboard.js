/* Advisor (administrator) dashboard: services, queue lengths, open/close quick actions */
(function () {
  const shell = QS.shell.mount({ role: 'admin', title: 'Advisor dashboard', active: 'admin-dashboard.html' });
  if (!shell) return;
  const { main } = shell;
  const { esc, mins, priority } = QS.fmt;

  function render() {
    const st = QS.store.stats();
    const services = QS.store.getServices();
    const maxLen = Math.max(1, ...services.map(s => QS.store.getQueue(s.id).length));

    main.innerHTML = `
      <dl class="stats" aria-label="Today at the Advising Center">
        <div><dt>Waiting now</dt><dd>${st.waiting}</dd></div>
        <div><dt>Served today</dt><dd>${st.served}</dd></div>
        <div><dt>Average wait</dt><dd>${st.avgWait} min</dd></div>
        <div><dt>Longest wait</dt><dd>${st.maxWait} min</dd></div>
        <div><dt>No-show rate</dt><dd>${st.noShowRate}%</dd></div>
      </dl>
      <section class="panel">
        <div class="panel-head"><h2>Services</h2><a class="btn btn-ghost btn-sm" href="services.html">Add a service</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th scope="col">Service</th><th scope="col">Priority</th><th scope="col">Queue</th><th scope="col">Next wait</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
          <tbody>${services.map(s => {
            const len = QS.store.getQueue(s.id).length;
            return `<tr>
              <td><strong>${esc(s.name)}</strong><span class="sub">${s.duration} min sessions, ${s.advisors} ${s.advisors === 1 ? 'advisor' : 'advisors'}</span></td>
              <td>${priority(s.priority)}</td>
              <td class="num">${len} waiting<span class="bar" aria-hidden="true"><i style="width:${(len / maxLen) * 100}%"></i></span></td>
              <td class="num">${s.open ? mins(QS.store.estimateWait(s.id, QS.store.projectedPosition(s.id))) : '<span class="muted">Not accepting</span>'}</td>
              <td><span class="pill ${s.open ? 'st-open' : 'st-closed'}">${s.open ? 'Open' : 'Closed'}</span></td>
              <td><div class="acts">
                <button class="btn btn-sm ${s.open ? 'btn-danger' : 'btn-ghost'}" type="button" data-toggle="${s.id}">${s.open ? 'Close queue' : 'Open queue'}</button>
                <a class="btn btn-sm btn-primary" href="admin-queue.html?service=${s.id}">Manage queue</a>
                <a class="btn btn-sm btn-ghost" href="services.html?edit=${s.id}">Edit</a></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>`;

    main.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const s = QS.store.getService(b.dataset.toggle);
      if (s.open) {
        const ok = await QS.ui.confirm({ title: `Close ${s.name}?`, body: 'Students already in line keep their place, but no one new can join until you open it again.', action: 'Close queue', danger: true });
        if (!ok) return;
      }
      const willOpen = !s.open; // read before the store flips it
      QS.store.setServiceOpen(s.id, willOpen);
      QS.ui.toast(`${s.name} is now ${willOpen ? 'open' : 'closed'}.`, 'success');
    }));
  }
  render();
  document.addEventListener('qs:change', render);
})();
