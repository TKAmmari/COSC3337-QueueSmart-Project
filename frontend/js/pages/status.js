/* Queue Status: position, estimated wait, and status (waiting, almost ready, served) */
(function () {
  const shell = QS.shell.mount({ role: 'student', title: 'Queue status', active: 'status.html' });
  if (!shell) return;
  const { user, main } = shell;
  const { esc } = QS.fmt;

  function tracker(key) {
    const steps = [['waiting', 'Waiting'], ['almost', 'Almost ready'], ['served', 'Served']];
    const at = steps.findIndex(s => s[0] === key);
    return `<ol class="track${key === 'served' ? ' is-served' : ''}" aria-label="Queue progress">${steps.map((s, i) =>
      `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}>${s[1]}</li>`).join('')}</ol>`;
  }

  function render() {
    const found = QS.store.findEntry(user.id);
    const called = QS.store.getCalled(user.id);

    if (found) {
      const st = QS.ui.statusOf(found.position);
      const q = QS.store.getQueue(found.serviceId);
      // Privacy (A1): other students appear only as anonymous places in line.
      const ahead = q.slice(0, found.position).map((en, i) =>
        en.userId === user.id ? '<span class="me">You</span>' : `<span>Student #${i + 1}</span>`).join('');
      const msg = st.key === 'almost'
        ? '<div class="alert alert-info" style="background:var(--almost-soft);color:var(--almost);margin:0 0 18px">You\'re almost up. Please head back to the Advising Center and stay close.</div>'
        : '';
      main.innerHTML = `${msg}
        <div class="stack">
          ${QS.ui.ticket(found, { extra: tracker(st.key) })}
          <div class="grid-2">
            <section class="panel">
              <div class="panel-head"><h2>Line ahead of you</h2><span class="small muted">${found.position - 1} ${found.position - 1 === 1 ? 'student' : 'students'}</span></div>
              <div class="ahead">${ahead}</div>
              <p class="note" style="margin-top:16px">Names are hidden. Your position can move back if an advisor places a time-sensitive case ahead of you.</p>
            </section>
            <section class="panel">
              <div class="panel-head"><h2>About your estimate</h2></div>
              <p class="small muted">This is an estimate, not a guaranteed time. It updates whenever someone joins or leaves, a session ends, or an advisor changes priorities. We'll notify you when you're almost ready.</p>
              <div class="btn-row" style="margin-top:16px"><button class="btn btn-danger" type="button" data-leave>Leave queue</button></div>
              <details class="demo-tools"><summary>Demo controls (no backend yet)</summary>
                <p style="margin-top:8px">Simulates the advisor calling the next student so you can watch your status change.</p>
                <div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" data-sim>Advisor serves next student</button></div>
              </details>
            </section>
          </div>
        </div>`;
      main.querySelector('[data-leave]').addEventListener('click', async () => {
        if (await QS.ui.confirm({ title: 'Leave this queue?', body: 'You will lose your place in line. You can join again later, but you will start at the back.', action: 'Leave queue', danger: true })) QS.store.leaveQueue(user.id);
      });
      main.querySelector('[data-sim]').addEventListener('click', () => QS.store.serveNext(found.serviceId));
      return;
    }

    if (called) {
      main.innerHTML = `<article class="ticket">
          <div class="ticket-body">
            <div class="panel-head" style="margin:0"><h2 class="ticket-service">${esc(called.service)}</h2><span class="pill st-served">Served</span></div>
            <p style="margin-top:14px;font-size:17px">It's your turn. Please go to the advisor now.</p>
            ${tracker('served')}
            <div class="btn-row" style="margin-top:16px"><button class="btn btn-ghost" type="button" data-done>Done</button><a class="btn btn-ghost" href="history.html">View history</a></div>
          </div>
          <div class="ticket-stub is-served"><span class="label">Now serving</span><span class="pos" style="font-size:44px">You</span><span class="of">called ${QS.fmt.time(called.at)}</span></div>
        </article>`;
      main.querySelector('[data-done]').addEventListener('click', () => QS.store.dismissCalled(user.id));
      return;
    }

    main.innerHTML = `<div class="panel empty"><h2>You're not in a queue</h2>
      <p>Join a queue to see your position, estimated wait, and live status updates here.</p>
      <a class="btn btn-primary" href="join.html">Join a queue</a></div>`;
  }

  render();
  const joined = QS.fmt.param('joined');
  if (joined) { QS.ui.toast(`You're in line at position ${joined}.`, 'success'); history.replaceState(null, '', 'status.html'); }
  document.addEventListener('qs:change', render);
})();
