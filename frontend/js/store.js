/* QueueSmart mock data layer.
 * Every screen reads and writes data ONLY through QS.store, so in Assignment 3
 * these functions can be swapped for fetch() calls to the real API without
 * touching the screens. State is kept in localStorage so it survives page loads
 * and is shared between a student tab and an advisor tab. */
window.QS = window.QS || {};
(function (QS) {
  const KEY = 'queuesmart.state.v1';
  const MIN = 60 * 1000;
  const RANK = { high: 0, medium: 1, low: 2 };

  function uid(p) { return p + Math.random().toString(36).slice(2, 9); }
  function daysAgo(d, h, m) { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, m, 0, 0); return x.getTime(); }

  function seed() {
    const t = Date.now();
    const e = (id, name, priority, minsAgo, userId) =>
      ({ id, name, priority, joinedAt: t - minsAgo * MIN, userId: userId || null, lastPos: null });
    return {
      users: [
        { id: 'u1', name: 'Jordan Reyes', email: 'student@uh.edu', password: 'Student123!', role: 'student' },
        { id: 'u2', name: 'Maria Lopez', email: 'advisor@uh.edu', password: 'Advisor123!', role: 'admin' }
      ],
      services: [
        { id: 's1', name: 'Registration Help', description: 'Adding, dropping, or swapping classes and fixing registration errors.', duration: 10, priority: 'medium', open: true, advisors: 2 },
        { id: 's2', name: 'Degree Audit Review', description: 'Walk through your degree audit and confirm the requirements you still need.', duration: 15, priority: 'low', open: true, advisors: 1 },
        { id: 's3', name: 'Change of Major', description: 'Talk through switching majors, new requirements, and the petition form.', duration: 25, priority: 'low', open: true, advisors: 1 },
        { id: 's4', name: 'Registration Hold Resolution', description: 'Clear advising or graduation holds that are blocking registration.', duration: 15, priority: 'high', open: true, advisors: 1 },
        { id: 's5', name: 'Graduation Check', description: 'Final review of graduation eligibility before you apply to graduate.', duration: 30, priority: 'medium', open: false, advisors: 1 }
      ],
      queues: {
        s1: [e('e11', 'Kevin Tran', 'medium', 18), e('e12', 'Sofia Alvarez', 'medium', 11), e('e13', 'Ethan Brooks', 'medium', 7), e('e14', 'Grace Okafor', 'medium', 2)],
        s2: [e('e21', 'Marcus Lee', 'high', 31), e('e22', 'Aisha Khan', 'low', 24), e('e23', 'Jordan Reyes', 'low', 12, 'u1'), e('e24', 'Daniel Kim', 'low', 4)],
        s3: [e('e31', 'Hannah Nguyen', 'low', 9)],
        s4: [e('e41', 'Luis Romero', 'high', 14), e('e42', 'Chloe Martin', 'high', 6)],
        s5: []
      },
      appointments: [],

      history: [
        { id: 'h1', userId: 'u1', service: 'Registration Help', date: daysAgo(3, 10, 5), wait: 12, outcome: 'completed' },
        { id: 'h2', userId: 'u1', service: 'Registration Hold Resolution', date: daysAgo(9, 13, 40), wait: 21, outcome: 'completed' },
        { id: 'h3', userId: 'u1', service: 'Degree Audit Review', date: daysAgo(15, 9, 20), wait: 34, outcome: 'left queue' },
        { id: 'h4', userId: 'u1', service: 'Change of Major', date: daysAgo(22, 15, 10), wait: 0, outcome: 'canceled' },
        { id: 'h5', userId: 'u1', service: 'Registration Help', date: daysAgo(30, 11, 45), wait: 8, outcome: 'no-show' },
        { id: 'h6', userId: 'u1', service: 'Registration Help', date: daysAgo(41, 14, 0), wait: 16, outcome: 'completed' }
      ],
      servedLog: [ // today's sessions, used for the advisor's usage statistics
        ...[9, 14, 6, 22, 11, 17, 4, 25, 13, 8, 19].map((w, i) => ({ serviceId: ['s1', 's2', 's4', 's3'][i % 4], wait: w, at: t - (i + 1) * 20 * MIN, outcome: 'completed' })),
        { serviceId: 's1', wait: 0, at: t - 250 * MIN, outcome: 'no-show' }
      ],
      notifications: [
        { id: 'n1', userId: 'u1', type: 'queue', text: 'You joined the Degree Audit Review queue at position 4.', time: t - 12 * MIN, read: true },
        { id: 'n2', userId: 'u1', type: 'status', text: 'You moved up to position 3 in Degree Audit Review.', time: t - 6 * MIN, read: false },
        { id: 'n3', userId: 'u1', type: 'info', text: 'Graduation Check is closed today. Walk-ins reopen tomorrow at 9:00 AM.', time: t - 90 * MIN, read: false },
        { id: 'n4', userId: 'u2', type: 'queue', text: 'Registration Help now has 4 students waiting.', time: t - 2 * MIN, read: false }
      ],
      called: {} // userId -> { service, at }  (set when an advisor serves a student)
    };
  }

  let state = null;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* storage unavailable: keep in memory */ }
    document.dispatchEvent(new CustomEvent('qs:change'));
  }
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (err) { state = null; }
    if (!state || !state.users) { state = seed(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* ignore */ } }
    return state;
  }
  function s() { return state || load(); }

  // ---------- helpers ----------
  function service(id) { return s().services.find(x => x.id === id); }
  function queue(id) { return s().queues[id] || (s().queues[id] = []); }
  function appointments() {
    return s().appointments || (s().appointments = []);
  } 
  function notify(userId, text, type) {
    if (!userId) return;
    s().notifications.unshift({ id: uid('n'), userId, type: type || 'queue', text, time: Date.now(), read: false });
  }
  function insertByPriority(q, entry) {
    // Higher priority first; same priority keeps arrival order (A1 queue-ordering rule).
    let i = q.length;
    while (i > 0 && RANK[q[i - 1].priority] > RANK[entry.priority]) i--;
    q.splice(i, 0, entry);
  }
  // Tell any real students in a queue when their position changes.
  function syncPositions(sid) {
    const svc = service(sid);
    queue(sid).forEach((en, i) => {
      const pos = i + 1;
      if (en.userId && en.lastPos !== null && en.lastPos !== pos) {
        if (pos <= 2 && en.lastPos > 2) notify(en.userId, `Almost ready: you are now #${pos} in ${svc.name}. Please stay close to the advising center.`, 'status');
        else if (pos < en.lastPos) notify(en.userId, `You moved up to position ${pos} in ${svc.name}.`, 'queue');
        else notify(en.userId, `Your position in ${svc.name} changed to ${pos} because a time-sensitive case was placed ahead.`, 'queue');
      }
      en.lastPos = pos;
    });
  }
  function logHistory(userId, sid, joinedAt, outcome) {
    if (!userId) return;
    s().history.unshift({ id: uid('h'), userId, service: service(sid).name, date: Date.now(), wait: Math.max(0, Math.round((Date.now() - joinedAt) / MIN)), outcome });
  }

  QS.store = {
    reset() { try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ } state = null; load(); persist(); },

    // ----- accounts -----
    findUserByEmail(email) { return s().users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()); },
    getUser(id) { return s().users.find(u => u.id === id); },
    createUser({ name, email, password, role }) {
      const user = { id: uid('u'), name: name.trim(), email: email.trim().toLowerCase(), password, role };
      s().users.push(user);
      notify(user.id, 'Welcome to QueueSmart. Your university email has been verified.', 'info');
      persist();
      return user;
    },

    // ----- services -----
    getServices() { return s().services.slice(); },
    getService: service,
    saveService(data) {
      let saved;
      if (data.id) { saved = Object.assign(service(data.id), data); }
      else {
        saved = Object.assign({}, data, { id: uid('s'), open: true, advisors: 1 });
        s().services.push(saved); s().queues[saved.id] = [];
      }
      persist();
      return saved;
    },
    setServiceOpen(id, open) {
      const svc = service(id); svc.open = open;
      queue(id).forEach(en => notify(en.userId, `${svc.name} is now ${open ? 'open' : 'closed to new students'}. Your spot is kept.`, 'info'));
      persist();
    },

    // ----- appointments -----
    // Returns appointments for a specific user, or all appointments if userId is omitted (for advisors)
    getAppointments(userId) {
      const list = userId ? appointments().filter(a => a.userId === userId) : appointments();
      return list.slice().sort((a, b) => a.startAt - b.startAt);
    },

    bookAppointment(userId, serviceId, date, time) {
      const svc = service(serviceId);

      const appointment = {
        id: uid('a'),
        userId: userId,
        serviceId: serviceId,
        startAt: new Date(`${date}T${time}`).getTime(),
        status: 'scheduled'
      };

      appointments().push(appointment);

      notify(
        userId,
        `Your ${svc.name} appointment has been scheduled for ${date} at ${time}.`,
        'info'
      );

      persist();

      return appointment;
    },

    // Updates an appointment and dispatches an in-app notification
    updateAppointment(id, { date, time, serviceId }) {
      const apt = appointments().find(a => a.id === id);
      if (!apt) return null;
      if (serviceId) apt.serviceId = serviceId;
      if (date && time) apt.startAt = new Date(`${date}T${time}`).getTime();
      const svc = service(apt.serviceId);
      notify(apt.userId, `Your ${svc.name} appointment was updated to ${date} at ${time}.`, 'info');
      persist();
      return apt;
    },

    // Cancels an appointment, updates status to 'canceled', and sends notification
    cancelAppointment(id) {
      const apt = appointments().find(a => a.id === id);
      if (!apt) return null;
      apt.status = 'canceled';
      const svc = service(apt.serviceId);
      notify(apt.userId, `Your ${svc.name} appointment has been canceled.`, 'status');
      persist();
      return apt;
    },

    // ----- queues -----
    getQueue(id) { return queue(id).slice(); },
    estimateWait(sid, position) {
      // A1 rule: expected duration of the sessions ahead, divided by advisors on duty.
      const svc = service(sid);
      return Math.round(((position - 1) * svc.duration) / Math.max(1, svc.advisors));
    },
    // Where a new student would land, following the priority-then-arrival rule.
    projectedPosition(sid) {
      const q = queue(sid), pr = service(sid).priority;
      let i = q.length;
      while (i > 0 && RANK[q[i - 1].priority] > RANK[pr]) i--;
      return i + 1;
    },
    findEntry(userId) {
      const qs = s().queues;
      for (const sid of Object.keys(qs)) {
        const i = qs[sid].findIndex(en => en.userId === userId);
        if (i > -1) return { serviceId: sid, entry: qs[sid][i], position: i + 1, total: qs[sid].length };
      }
      return null;
    },
    joinQueue(userId, sid, note) {
      const svc = service(sid), user = this.getUser(userId);
      if (!svc || !svc.open) throw new Error('That service is closed right now.');
      if (this.findEntry(userId)) throw new Error('You are already in a queue. Leave it before joining another.');
      const entry = { id: uid('e'), name: user.name, priority: svc.priority, joinedAt: Date.now(), userId, note: note || '', lastPos: null };
      insertByPriority(queue(sid), entry);
      syncPositions(sid);
      delete s().called[userId];
      const pos = queue(sid).indexOf(entry) + 1;
      notify(userId, `You joined the ${svc.name} queue at position ${pos}.`, 'queue');
      persist();
      return pos;
    },
    leaveQueue(userId) {
      const found = this.findEntry(userId);
      if (!found) return;
      queue(found.serviceId).splice(found.position - 1, 1);
      logHistory(userId, found.serviceId, found.entry.joinedAt, 'left queue');
      notify(userId, `You left the ${service(found.serviceId).name} queue.`, 'queue');
      syncPositions(found.serviceId);
      persist();
    },
    serveNext(sid) {
      const q = queue(sid); if (!q.length) return null;
      const en = q.shift(), svc = service(sid);
      const wait = Math.round((Date.now() - en.joinedAt) / MIN);
      s().servedLog.unshift({ serviceId: sid, wait, at: Date.now(), outcome: 'completed' });
      if (en.userId) {
        s().called[en.userId] = { service: svc.name, at: Date.now() };
        logHistory(en.userId, sid, en.joinedAt, 'completed');
        notify(en.userId, `It's your turn. Please go to the ${svc.name} advisor now.`, 'status');
      }
      syncPositions(sid);
      persist();
      return en;
    },
    removeEntry(sid, eid, outcome) {
      const q = queue(sid), i = q.findIndex(en => en.id === eid); if (i < 0) return;
      const en = q.splice(i, 1)[0];
      if (outcome === 'no-show') s().servedLog.unshift({ serviceId: sid, wait: 0, at: Date.now(), outcome: 'no-show' });
      logHistory(en.userId, sid, en.joinedAt, outcome === 'no-show' ? 'no-show' : 'canceled');
      notify(en.userId, outcome === 'no-show'
        ? `You were marked as a no-show for ${service(sid).name}. You can join again from Join a queue.`
        : `An advisor removed you from the ${service(sid).name} queue.`, 'status');
      syncPositions(sid);
      persist();
    },
    moveEntry(sid, eid, dir) {
      const q = queue(sid), i = q.findIndex(en => en.id === eid), j = i + dir;
      if (i < 0 || j < 0 || j >= q.length) return;
      const tmp = q[i]; q[i] = q[j]; q[j] = tmp;
      syncPositions(sid);
      persist();
    },
    setEntryPriority(sid, eid, priority) {
      const q = queue(sid), en = q.find(x => x.id === eid); if (!en) return;
      en.priority = priority;
      q.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.joinedAt - b.joinedAt);
      syncPositions(sid);
      persist();
    },
    getCalled(userId) {
      const c = s().called[userId];
      return c && Date.now() - c.at < 30 * MIN ? c : null;
    },
    dismissCalled(userId) { delete s().called[userId]; persist(); },

    // ----- history & notifications -----
    getHistory(userId) { return s().history.filter(h => h.userId === userId).sort((a, b) => b.date - a.date); },
    getNotifications(userId) { return s().notifications.filter(n => n.userId === userId).sort((a, b) => b.time - a.time); },
    markAllRead(userId) { s().notifications.forEach(n => { if (n.userId === userId) n.read = true; }); persist(); },

    // ----- advisor statistics (A1: students served, avg/max wait, no-show rate) -----
    stats() {
      const log = s().servedLog, done = log.filter(l => l.outcome === 'completed');
      const waits = done.map(l => l.wait);
      return {
        served: done.length,
        avgWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
        maxWait: waits.length ? Math.max.apply(null, waits) : 0,
        noShowRate: log.length ? Math.round((log.filter(l => l.outcome === 'no-show').length / log.length) * 100) : 0,
        waiting: Object.keys(s().queues).reduce((a, k) => a + s().queues[k].length, 0)
      };
    }
  };

  // Keep tabs in sync: an advisor serving in one tab updates the student's tab.
  window.addEventListener('storage', ev => {
    if (ev.key === KEY) { state = null; load(); document.dispatchEvent(new CustomEvent('qs:change', { detail: { external: true } })); }
  });
})(window.QS);