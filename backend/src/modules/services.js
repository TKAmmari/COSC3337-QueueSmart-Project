// Service management module: the advising services students can queue for.
// Tables: services (name, description, duration, priority, advisors) and queues
// (every service has exactly one queue; its status says if the service is open).
const { db, newId, transaction } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { notify } = require('./notifications');
const { estimateWait } = require('./waitTime');

const PRIORITIES = ['low', 'medium', 'high'];
const MAX_ADVISORS = 10;

const serviceRules = {
  name: { label: 'Service name', required: true, type: 'string', maxLength: 100 },
  description: { label: 'Description', required: true, type: 'string', maxLength: 500 },
  duration: { label: 'Expected duration', required: true, type: 'integer', min: 1, max: 240 },
  priority: { label: 'Priority level', required: true, type: 'string', oneOf: PRIORITIES }
};

const SERVICE_SELECT = `
  SELECT s.service_id, s.name, s.description, s.expected_duration, s.priority_level,
         s.advisors_on_duty, q.queue_id, q.status
  FROM services s JOIN queues q ON q.service_id = s.service_id`;

// Database row -> the shape the front end already uses.
function toService(row) {
  return {
    id: row.service_id,
    name: row.name,
    description: row.description,
    duration: row.expected_duration,
    priority: row.priority_level,
    open: row.status === 'open',
    advisors: row.advisors_on_duty,
    queueId: row.queue_id
  };
}

function listServices() {
  return db.prepare(`${SERVICE_SELECT} ORDER BY s.created_at, s.rowid`).all().map(toService);
}

function getService(id) {
  const row = db.prepare(`${SERVICE_SELECT} WHERE s.service_id = ?`).get(id);
  if (!row) throw new ApiError(404, 'Service not found.');
  return toService(row);
}

// User ids of the students waiting for a service, in line order.
function waitingUsers(serviceId) {
  return db.prepare(`SELECT e.user_id FROM queue_entries e JOIN queues q ON q.queue_id = e.queue_id
    WHERE q.service_id = ? AND e.status = 'waiting' ORDER BY e.position`).all(serviceId).map((r) => r.user_id);
}

function checkUniqueName(name, ignoreId) {
  const taken = db.prepare('SELECT 1 FROM services WHERE name = ? COLLATE NOCASE AND service_id IS NOT ?').get(name.trim(), ignoreId || null);
  if (taken) {
    throw new ApiError(400, 'A service with this name already exists.', [{ field: 'name', message: 'A service with this name already exists.' }]);
  }
}

const insertService = transaction((service) => {
  const now = Date.now();
  db.prepare(`INSERT INTO services (service_id, name, description, expected_duration, priority_level, advisors_on_duty, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)`).run(service.id, service.name, service.description, service.duration, service.priority, now);
  db.prepare("INSERT INTO queues (queue_id, service_id, status, created_at) VALUES (?, ?, 'open', ?)").run(newId('q'), service.id, now);
});

function createService(body) {
  validate(body, serviceRules);
  checkUniqueName(body.name);
  const id = newId('s');
  insertService({ id, name: body.name.trim(), description: body.description.trim(), duration: body.duration, priority: body.priority });
  return getService(id);
}

function updateService(id, body) {
  getService(id);
  validate(body, serviceRules);
  checkUniqueName(body.name, id);
  db.prepare('UPDATE services SET name = ?, description = ?, expected_duration = ?, priority_level = ? WHERE service_id = ?')
    .run(body.name.trim(), body.description.trim(), body.duration, body.priority, id);
  return getService(id);
}

const setServiceOpen = transaction((id, body) => {
  const service = getService(id);
  validate(body, { open: { label: 'Open', required: true, type: 'boolean' } });
  if (service.open !== body.open) {
    db.prepare('UPDATE queues SET status = ? WHERE service_id = ?').run(body.open ? 'open' : 'closed', id);
    const status = body.open ? 'open' : 'closed to new students';
    waitingUsers(id).forEach((userId) => notify(userId, `${service.name} is now ${status}. Your spot is kept.`, 'info'));
  }
  return getService(id);
});

// How many advisors are helping with this service right now. The wait estimate
// divides by this, so every student in line is told their new estimated wait.
const setAdvisors = transaction((id, body) => {
  const service = getService(id);
  validate(body, { advisors: { label: 'Advisors on duty', required: true, type: 'integer', min: 1, max: MAX_ADVISORS } });
  if (service.advisors === body.advisors) return service;

  const users = waitingUsers(id);
  const oldWaits = users.map((userId, i) => estimateWait(service, i + 1));
  db.prepare('UPDATE services SET advisors_on_duty = ? WHERE service_id = ?').run(body.advisors, id);
  const updated = getService(id);
  users.forEach((userId, i) => {
    const wait = estimateWait(updated, i + 1);
    if (wait === oldWaits[i]) return; // e.g. the student at #1 waits 0 either way
    const who = `${updated.advisors} advisor${updated.advisors === 1 ? '' : 's'}`;
    notify(userId, `${updated.name} now has ${who} on duty. Your estimated wait is now about ${wait} min.`, 'info');
  });
  return updated;
});

module.exports = { PRIORITIES, MAX_ADVISORS, listServices, getService, createService, updateService, setServiceOpen, setAdvisors };
