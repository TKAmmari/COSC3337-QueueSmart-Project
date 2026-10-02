/* Queue management: view a service's queue, reorder/remove students, serve next (UI simulation) */
(function () {
  const shell = QS.shell.mount({ role: 'admin', title: 'Queue management', active: 'admin-queue.html' });
  if (!shell) return;
  const { main } = shell;
  const { esc, ago, priority, mins } = QS.fmt;
  const services = QS.store.getServices();
  let sid = QS.fmt.param('service');
  if (!QS.store.getService(sid)) sid = services[0].id;
  let lastServed = null;
  let search = '';
  let priorityFilter = 'all';
  const up = '<svg class="ic" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  const down = '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';

  function render() {
    const focusedSearch = main.querySelector('#queue-search');
    const restoreFocus = focusedSearch && document.activeElement === focusedSearch;
    const selection = restoreFocus ? focusedSearch.selectionStart : null;
    const svc = QS.store.getService(sid), q = QS.store.getQueue(sid);
    const visible = q.map((en, i) => ({ en, i })).filter(({ en }) => {
      const email = QS.store.getUser(en.userId)?.email || '';
      return (priorityFilter === 'all' || en.priority === priorityFilter) &&
        `${en.name} ${email}`.toLowerCase().includes(search.trim().toLowerCase());
    });
    main.innerHTML = `
      <div class="toolbar">
        <div class="field"><label for="svc">Service</label>
          <select class="input" id="svc">${QS.store.getServices().map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)} (${QS.store.getQueue(s.id).length})</option>`).join('')}</select></div>
        <span class="pill ${svc.open ? 'st-open' : 'st-closed'}" style="margin-bottom:9px">${svc.open ? 'Open' : 'Closed'}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-toggle style="margin-bottom:5px">${svc.open ? 'Close queue' : 'Open queue'}</button>
      </div>
      <div class="serving">
        <div><small>${lastServed ? 'Now serving' : 'Next up'}</small>
          <strong>${lastServed ? esc(lastServed.name) : q.length ? esc(q[0].name) : 'No one is waiting'}</strong></div>
        <button class="btn btn-primary" type="button" data-serve ${q.length ? '' : 'disabled'}>Serve next student</button>
      </div>
      <section class="panel">
        <div class="panel-head"><h2>${esc(svc.name)} queue</h2><span class="small muted">${q.length} waiting, ${svc.duration} min sessions, a new student would wait ${mins(QS.store.estimateWait(sid, QS.store.projectedPosition(sid)))}</span></div>
        <div class="toolbar" style="margin-bottom:16px">
          <div class="field"><label for="queue-search">Search students</label>
            <input class="input" id="queue-search" type="search" maxlength="100" placeholder="Name or email" value="${esc(search)}"></div>
          <div class="field"><label for="queue-priority">Filter by priority</label>
            <select class="input" id="queue-priority">${['all', 'high', 'medium', 'low'].map(p => `<option value="${p}" ${p === priorityFilter ? 'selected' : ''}>${p === 'all' ? 'All priorities' : p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div>
          <button class="btn btn-ghost" type="button" data-clear-filters>Clear filters</button>
        </div>
        <p class="small muted" role="status" aria-live="polite">Showing ${visible.length} of ${q.length} students. Filters only change the display; Serve next uses the full queue.</p>
        ${visible.length ? `<div class="table-wrap"><table>
          <thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Priority</th><th scope="col">Waiting</th><th scope="col">Est. wait</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
          <tbody>${visible.map(({ en, i }) => `<tr class="${i === 0 ? 'is-first' : ''}">
            <td><span class="qpos">${i + 1}</span></td>
            <td><strong>${esc(en.name)}</strong>${en.note ? `<span class="sub">“${esc(en.note)}”</span>` : ''}</td>
            <td><label class="sr" for="p-${en.id}">Priority for ${esc(en.name)}</label>
              <select class="input input-sm" id="p-${en.id}" data-prio="${en.id}">${['high', 'medium', 'low'].map(p => `<option value="${p}" ${en.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></td>
            <td class="num">${ago(en.joinedAt).replace(' ago', '')}</td>
            <td class="num">${mins(QS.store.estimateWait(sid, i + 1))}</td>
            <td><div class="acts">
              <button class="icon-btn" type="button" data-move="${en.id}" data-dir="-1" aria-label="Move ${esc(en.name)} up" ${i === 0 ? 'disabled' : ''}>${up}</button>
              <button class="icon-btn" type="button" data-move="${en.id}" data-dir="1" aria-label="Move ${esc(en.name)} down" ${i === q.length - 1 ? 'disabled' : ''}>${down}</button>
              <button class="btn btn-ghost btn-sm" type="button" data-noshow="${en.id}">No-show</button>
              <button class="btn btn-danger btn-sm" type="button" data-remove="${en.id}">Remove</button></div></td>
          </tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:14px">Students are ordered by priority, then arrival time. Changing a priority re-sorts the queue; the arrows let you override the order by hand.</p>`
        : q.length ? '<div class="empty"><h2>No students match these filters</h2><p>Try another name or email, select all priorities, or clear the filters.</p></div>' : '<div class="empty"><h2>No students in this queue</h2><p>When students join, they appear here in order.</p></div>'}
      </section>`;

    main.querySelector('#queue-search').addEventListener('input', e => { search = e.target.value; render(); });
    main.querySelector('#queue-priority').addEventListener('change', e => { priorityFilter = e.target.value; render(); main.querySelector('#queue-priority').focus(); });
    main.querySelector('[data-clear-filters]').addEventListener('click', () => { search = ''; priorityFilter = 'all'; render(); main.querySelector('#queue-search').focus(); });
    if (restoreFocus) {
      const input = main.querySelector('#queue-search');
      input.focus();
      if (selection !== null) input.setSelectionRange(selection, selection);
    }
    main.querySelector('#svc').addEventListener('change', e => { sid = e.target.value; lastServed = null; history.replaceState(null, '', `admin-queue.html?service=${sid}`); render(); });
    main.querySelector('[data-toggle]').addEventListener('click', () => {
      const willOpen = !svc.open; // read before the store flips it
      QS.store.setServiceOpen(sid, willOpen);
      QS.ui.toast(`${svc.name} is now ${willOpen ? 'open' : 'closed'}.`, 'success');
    });
    main.querySelector('[data-serve]').addEventListener('click', () => {
      lastServed = QS.store.serveNext(sid);
      if (lastServed) QS.ui.toast(`Called ${lastServed.name}. They have been notified.`, 'success');
    });
    main.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => QS.store.moveEntry(sid, b.dataset.move, Number(b.dataset.dir))));
    main.querySelectorAll('[data-prio]').forEach(s => s.addEventListener('change', () => { QS.store.setEntryPriority(sid, s.dataset.prio, s.value); QS.ui.toast('Priority updated. The queue was re-sorted.', 'success'); }));
    main.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => act(b.dataset.remove, 'removed')));
    main.querySelectorAll('[data-noshow]').forEach(b => b.addEventListener('click', () => act(b.dataset.noshow, 'no-show')));
  }

  async function act(eid, outcome) {
    const en = QS.store.getQueue(sid).find(x => x.id === eid);
    const ok = await QS.ui.confirm(outcome === 'no-show'
      ? { title: `Mark ${en.name} as a no-show?`, body: 'They will be removed from the queue and the visit is recorded as a no-show.', action: 'Mark no-show', danger: true }
      : { title: `Remove ${en.name} from the queue?`, body: 'They will lose their place and be notified.', action: 'Remove student', danger: true });
    if (ok) { QS.store.removeEntry(sid, eid, outcome); QS.ui.toast(`${en.name} was ${outcome === 'no-show' ? 'marked as a no-show' : 'removed'}.`, 'success'); }
  }

  render();
  document.addEventListener('qs:change', render);
})();
