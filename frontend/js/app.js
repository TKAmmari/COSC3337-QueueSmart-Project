/* QueueSmart shared shell: session + role guard, sidebar navigation,
 * notification bell/panel, toasts, confirm dialog, and small formatters. */
window.QS = window.QS || {};
(function (QS) {
  const SESSION = 'queuesmart.session';

  // ---------- formatting ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} hr ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const mins = m => (m <= 0 ? 'You’re next' : m < 60 ? `~${m} min` : `~${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
  const date = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = t => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const priority = p => `<span class="prio prio-${esc(p)}">${esc(p[0].toUpperCase() + p.slice(1))}</span>`;
  const param = k => new URLSearchParams(location.search).get(k);
  QS.fmt = { esc, ago, mins, date, time, priority, param };

  // ---------- session ----------
  QS.auth = {
    current() {
      let id = null;
      try { id = sessionStorage.getItem(SESSION); } catch (err) { /* ignore */ }
      return id ? QS.store.getUser(id) : null;
    },
    login(user) { try { sessionStorage.setItem(SESSION, user.id); } catch (err) { /* ignore */ } },
    logout() { try { sessionStorage.removeItem(SESSION); } catch (err) { /* ignore */ } location.href = 'login.html'; },
    home(user) { return user.role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html'; },
    require(role) {
      const user = this.current();
      if (!user) { location.replace('login.html'); return null; }
      if (role && user.role !== role) { location.replace(this.home(user)); return null; }
      return user;
    }
  };

  // ---------- icons (inline so the app works offline) ----------
  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    join: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    status: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    services: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    queue: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20c0-3 2.5-5 5-5s5 2 5 5M12 20c0-3 2.5-5 5-5s5 2 5 5"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'
  };
  const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
  QS.icon = icon;

  const NAV = {
    student: [['dashboard.html', 'Dashboard', 'home'], ['join.html', 'Join a queue', 'join'], ['appointments.html', 'Appointments', 'calendar'], ['status.html', 'Queue status', 'status'], ['history.html', 'History', 'history']],
    admin: [['admin-dashboard.html', 'Dashboard', 'home'], ['services.html', 'Services', 'services'], ['admin-queue.html', 'Queue management', 'queue']]
  };

  // ---------- shell ----------
  let user, seen = new Set();
  QS.shell = {
    mount({ role, title, active }) {
      user = QS.auth.require(role);
      if (!user) return null;
      const root = document.getElementById('app');
      const links = NAV[user.role].map(([href, label, ic]) =>
        `<a href="${href}" class="nav-link${href === active ? ' is-active' : ''}"${href === active ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
      root.innerHTML = `
        <a class="skip" href="#main">Skip to content</a>
        <aside class="side">
          <a class="brand" href="${QS.auth.home(user)}"><span class="brand-mark" aria-hidden="true">Q</span><span>QueueSmart<small>Academic Advising</small></span></a>
          <nav aria-label="Main">${links}</nav>
          <div class="side-foot">
            <p class="who">${esc(user.name)}<small>${user.role === 'admin' ? 'Advisor (administrator)' : 'Student'}</small></p>
            <button class="nav-link" type="button" data-logout>${icon('out')}<span>Sign out</span></button>
          </div>
        </aside>
        <div class="main-col">
          <header class="top">
            <h1 class="page-title">${esc(title)}</h1>
            <div class="bell-wrap">
              <button class="bell" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="notif-panel">${icon('bell')}<span class="sr">Notifications</span><span class="badge" hidden></span></button>
              <section class="notif-panel" id="notif-panel" hidden aria-label="Notifications">
                <header><h2>Notifications</h2><button type="button" class="link" data-readall>Mark all read</button></header>
                <ul class="notif-list"></ul>
              </section>
            </div>
          </header>
          <main id="main" tabindex="-1"></main>
        </div>
        <div class="toasts" aria-live="polite"></div>`;

      const activeLink = root.querySelector('.nav-link.is-active');
      if (activeLink && window.matchMedia('(max-width: 760px)').matches) activeLink.parentNode.scrollLeft = activeLink.offsetLeft - 12;
      root.querySelector('[data-logout]').addEventListener('click', () => QS.auth.logout());
      const bell = root.querySelector('.bell'), panel = root.querySelector('.notif-panel');
      bell.addEventListener('click', () => {
        const open = panel.hidden; panel.hidden = !open; bell.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', ev => { if (!ev.target.closest('.bell-wrap')) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !panel.hidden) { panel.hidden = true; bell.focus(); } });
      root.querySelector('[data-readall]').addEventListener('click', () => QS.store.markAllRead(user.id));

      QS.store.getNotifications(user.id).forEach(n => seen.add(n.id));
      this.renderNotifications();
      document.addEventListener('qs:change', () => this.renderNotifications());
      return { user, main: root.querySelector('main') };
    },

    renderNotifications() {
      const list = QS.store.getNotifications(user.id), unread = list.filter(n => !n.read).length;
      const badge = document.querySelector('.bell .badge');
      badge.hidden = !unread; badge.textContent = unread;
      document.querySelector('.notif-list').innerHTML = list.length
        ? list.slice(0, 12).map(n => `<li class="notif ${n.read ? '' : 'is-unread'} notif-${n.type}"><p>${esc(n.text)}</p><time>${ago(n.time)}</time></li>`).join('')
        : '<li class="empty-small">No notifications yet. Updates about your queue appear here.</li>';
      // New notifications that arrived since the last render become toasts.
      list.filter(n => !seen.has(n.id)).reverse().forEach(n => { seen.add(n.id); QS.ui.toast(n.text, n.type === 'status' ? 'status' : 'info'); });
    }
  };

  // ---------- small UI helpers ----------
  QS.ui = {
    toast(text, kind) {
      const box = document.querySelector('.toasts'); if (!box) return;
      const t = document.createElement('div');
      t.className = `toast toast-${kind || 'info'}`; t.setAttribute('role', 'status'); t.textContent = text;
      box.appendChild(t);
      while (box.children.length > 3) box.firstElementChild.remove();
      setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 300); }, 4200);
    },
    confirm({ title, body, action, danger }) {
      return new Promise(resolve => {
        const d = document.createElement('dialog');
        d.className = 'dialog';
        d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p>
          <div class="actions"><button type="button" class="btn btn-ghost" value="no">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="yes">${esc(action)}</button></div>`;
        document.body.appendChild(d);
        const done = v => { d.close(); d.remove(); resolve(v); };
        d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => done(b.value === 'yes')));
        d.addEventListener('cancel', () => done(false));
        d.showModal();
      });
    },
    // The queue ticket shown on the student dashboard and the Queue Status screen.
    ticket(found, opts) {
      const svc = QS.store.getService(found.serviceId);
      const st = this.statusOf(found.position);
      const wait = QS.store.estimateWait(found.serviceId, found.position);
      return `<article class="ticket${opts && opts.small ? ' ticket-sm' : ''}" aria-label="Your queue ticket">
        <div class="ticket-body">
          <div class="panel-head" style="margin:0"><h2 class="ticket-service">${esc(svc.name)}</h2><span class="pill st-${st.key}">${st.label}</span></div>
          <dl class="ticket-meta">
            <div><dt>Estimated wait</dt><dd>${mins(wait)}</dd></div>
            <div><dt>Joined</dt><dd>${time(found.entry.joinedAt)}</dd></div>
            <div><dt>Session length</dt><dd>${svc.duration} min</dd></div>
          </dl>
          ${opts && opts.extra ? opts.extra : ''}
        </div>
        <div class="ticket-stub"><span class="label">Your position</span><span class="pos">${found.position}</span><span class="of">of ${found.total} in line</span></div>
      </article>`;
    },
    statusOf(position, called) {
      if (called) return { key: 'served', label: 'Served' };
      return position <= 2 ? { key: 'almost', label: 'Almost ready' } : { key: 'waiting', label: 'Waiting' };
    }
  };
})(window.QS);
