/* QueueSmart API client (Assignment 3).
 *
 * In A2 this file held mock data in localStorage. Now every function calls the
 * back-end API instead. The function names stayed the same, so the screens
 * barely changed.
 *
 * Notes for the team:
 * - The screens call these functions without await (e.g. const q = QS.store.getQueue(id)),
 *   so requests here are synchronous. We'll switch to async fetch() when we rework
 *   the screens in A4.
 * - GET results are cached until something changes, so a screen that asks for the
 *   same data many times only hits the server once.
 * - Every 3 seconds we check /api/version. If another tab or user changed something,
 *   we clear the cache and the screens re-render (e.g. the advisor serves a student).
 */
window.QS = window.QS || {};
(function (QS) {
  // Works when the page is served by our server, or opened as a file while the server runs.
  const API = (location.protocol === 'file:' ? 'http://localhost:3000' : '') + '/api';
  const TOKEN_KEY = 'queuesmart.token';
  const cache = {};
  let lastVersion = null;

  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }
  function clearCache() { Object.keys(cache).forEach(k => delete cache[k]); }

  // Sends one request and returns the parsed JSON. Throws an Error with the server's message.
  function request(method, path, body) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, API + path, false);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.send(body === undefined ? null : JSON.stringify(body));
    } catch (err) {
      throw new Error('Can’t reach the QueueSmart server. Start it with: cd backend, then npm start.');
    }

    const result = xhr.responseText ? JSON.parse(xhr.responseText) : {};
    if (xhr.status >= 400) {
      // Signed out (or the server restarted and forgot our session): go back to login.
      if (xhr.status === 401 && token) {
        setToken(null);
        if (!location.pathname.endsWith('login.html')) location.replace('login.html');
      }
      const error = new Error(result.error ? result.error.message : 'Something went wrong.');
      error.status = xhr.status;
      error.details = (result.error && result.error.details) || [];
      throw error;
    }
    return result;
  }

  function get(path) {
    if (!(path in cache)) cache[path] = request('GET', path);
    return cache[path];
  }

  // Any change: clear the cache, remember the new version, and tell the screens to re-render.
  function change(method, path, body) {
    const result = request(method, path, body || {});
    clearCache();
    lastVersion = request('GET', '/version').version;
    document.dispatchEvent(new CustomEvent('qs:change'));
    return result;
  }

  // For buttons the screens don't wrap in try/catch: show the error as a toast.
  function withToast(fn) {
    try { return fn(); } catch (err) { QS.ui.toast(err.message, 'error'); return null; }
  }

  // Remember the data version when the page loads, then check every 3 seconds
  // whether someone else changed the data.
  try { lastVersion = request('GET', '/version').version; } catch (err) { /* server not running yet */ }
  setInterval(() => {
    if (!getToken()) return;
    fetch(API + '/version')
      .then(res => res.json())
      .then(({ version }) => {
        if (lastVersion !== null && version !== lastVersion) {
          clearCache();
          document.dispatchEvent(new CustomEvent('qs:change', { detail: { external: true } }));
        }
        lastVersion = version;
      })
      .catch(() => { /* server not reachable right now, try again next time */ });
  }, 3000);

  QS.store = {
    reset() { setToken(null); return change('POST', '/demo/reset'); },

    // ----- accounts -----
    login(email, password) {
      const result = request('POST', '/auth/login', { email, password });
      setToken(result.token);
      clearCache();
      return result.user;
    },
    register(user) { return request('POST', '/auth/register', user).user; },
    logout() {
      try { request('POST', '/auth/logout', {}); } catch (err) { /* already signed out */ }
      setToken(null);
      clearCache();
    },
    currentUser() {
      if (!getToken()) return null;
      try { return get('/auth/me').user; } catch (err) { return null; }
    },
    getUser(id) {
      if (!id) return null; // walk-in students have no account
      try { return get(`/users/${id}`).user; } catch (err) { return null; }
    },

    // ----- services -----
    getServices() { return get('/services').services; },
    getService(id) { return this.getServices().find(s => s.id === id); },
    saveService(service) {
      const body = { name: service.name, description: service.description, duration: service.duration, priority: service.priority };
      return service.id
        ? change('PUT', `/services/${service.id}`, body).service
        : change('POST', '/services', body).service;
    },
    setServiceOpen(id, open) { return withToast(() => change('PATCH', `/services/${id}/status`, { open })); },

    // ----- appointments (students get their own, advisors get everyone's) -----
    getAppointments() { return get('/appointments').appointments; },
    bookAppointment(userId, serviceId, date, time) { return change('POST', '/appointments', { serviceId, date, time }).appointment; },
    updateAppointment(id, { date, time, serviceId }) { return change('PUT', `/appointments/${id}`, { date, time, serviceId }).appointment; },
    cancelAppointment(id) { return withToast(() => change('POST', `/appointments/${id}/cancel`)); },

    // ----- queues -----
    getQueue(serviceId) { return get(`/queues/${serviceId}`).entries; },
    estimateWait(serviceId, position) { return get(`/queues/${serviceId}/estimate?position=${position}`).estimatedWait; },
    projectedPosition(serviceId) { return get(`/queues/${serviceId}/projection`).position; },
    findEntry() { return get('/queues/me').current; },
    joinQueue(userId, serviceId, note) { return change('POST', `/queues/${serviceId}/join`, { note }).position; },
    leaveQueue() { return withToast(() => change('POST', '/queues/leave')); },
    serveNext(serviceId) { return withToast(() => change('POST', `/queues/${serviceId}/serve`).served); },
    removeEntry(serviceId, entryId, outcome) {
      return withToast(() => change('DELETE', `/queues/${serviceId}/entries/${entryId}`, { outcome: outcome === 'no-show' ? 'no-show' : 'removed' }));
    },
    moveEntry(serviceId, entryId, direction) { return withToast(() => change('POST', `/queues/${serviceId}/entries/${entryId}/move`, { direction })); },
    setEntryPriority(serviceId, entryId, priority) { return withToast(() => change('PATCH', `/queues/${serviceId}/entries/${entryId}/priority`, { priority })); },
    getCalled() { return get('/queues/me/called').called; },
    dismissCalled() { return withToast(() => change('DELETE', '/queues/me/called')); },

    // ----- history, notifications, stats -----
    getHistory() { return get('/history').history; },
    getNotifications() { return get('/notifications').notifications; },
    markAllRead() { return withToast(() => change('POST', '/notifications/read-all')); },
    stats() { return get('/stats').stats; }
  };
})(window.QS);
