/* History: past queues with date, service, and outcome */
(function () {
  const shell = QS.shell.mount({ role: 'student', title: 'History', active: 'history.html' });
  if (!shell) return;
  const { user, main } = shell;
  const { esc, date, time } = QS.fmt;
  const R = QS.validate.rules;
  let filter = { from: '', to: '', outcome: 'all' };

  main.innerHTML = `
    <p class="lede">Every queue you've joined, with how long you waited and how it ended. Only you can see your history.</p>
    <form id="filter-form" class="panel toolbar">
      <div class="field"><label for="from">From</label><input class="input" type="date" id="from" name="from"></div>
      <div class="field"><label for="to">To</label><input class="input" type="date" id="to" name="to"></div>
      <div class="field"><label for="outcome">Outcome</label>
        <select class="input" id="outcome" name="outcome">
          <option value="all">All outcomes</option><option value="completed">Completed</option><option value="left queue">Left queue</option>
          <option value="canceled">Canceled</option><option value="no-show">No-show</option></select></div>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Apply filters</button><button class="btn btn-ghost" type="reset">Clear</button></div>
    </form>
    <section class="panel" style="margin-top:20px"><div id="results"></div></section>`;

  const form = main.querySelector('#filter-form');
  QS.validate.attach(form, {
    from: [R.notFuture('Start date')],
    to: [R.notFuture('End date'), R.notBefore('from', 'End date')],
    outcome: [R.oneOf(['all', 'completed', 'left queue', 'canceled', 'no-show'], 'outcome')]
  }, data => { filter = data; renderRows(); });
  form.addEventListener('reset', () => setTimeout(() => {
    filter = { from: '', to: '', outcome: 'all' };
    form.querySelectorAll('.field').forEach(f => { f.classList.remove('is-invalid'); const e = f.querySelector('.field-error'); if (e) e.textContent = ''; });
    renderRows();
  }));

  function renderRows() {
    const rows = QS.store.getHistory(user.id).filter(h => {
      const d = new Date(h.date); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return (!filter.from || iso >= filter.from) && (!filter.to || iso <= filter.to) && (filter.outcome === 'all' || h.outcome === filter.outcome);
    });
    const box = main.querySelector('#results');
    if (!rows.length) {
      box.innerHTML = '<div class="empty"><h2>No visits match these filters</h2><p>Try a wider date range, or clear the filters.</p></div>';
      return;
    }
    box.innerHTML = `<div class="panel-head"><h2>Past queues</h2><span class="small muted">${rows.length} ${rows.length === 1 ? 'visit' : 'visits'}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Date</th><th scope="col">Service</th><th scope="col">Waited</th><th scope="col">Outcome</th></tr></thead>
        <tbody>${rows.map(h => `<tr>
          <td>${date(h.date)}<span class="sub">${time(h.date)}</span></td>
          <td>${esc(h.service)}</td>
          <td class="num">${h.wait} min</td>
          <td><span class="pill oc-${h.outcome.replace(' ', '-')}">${h.outcome[0].toUpperCase() + h.outcome.slice(1)}</span></td></tr>`).join('')}</tbody>
      </table></div>`;
  }
  renderRows();
  document.addEventListener('qs:change', renderRows);
})();
