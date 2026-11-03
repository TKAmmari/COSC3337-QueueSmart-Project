// Queue management module.
// Students join, leave, and check their position.
// Advisors serve the next student, remove students, reorder, and change priority.
//
// Queue order (A1 rule): high priority first, then medium, then low.
// Inside the same priority, whoever joined first goes first.
//
// How the database fits in (A4): every queue_entries row with status 'waiting' has a
// position (1, 2, 3, ...). A change works like this:
//   1. loadQueue()  reads the waiting entries in position order into an array
//   2. the same array logic we had in A3 changes the order (splice, sort, swap)
//   3. saveQueue()  writes the new positions back
// Each exported change runs inside one database transaction, so if anything fails
// halfway (validation, a constraint), nothing is saved.
const { db, data, newId, MINUTE, transaction } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { getService, listServices, PRIORITIES } = require('./services');
const { estimateWait } = require('./waitTime');
const { notify, notifyPositionChanges, ALMOST_READY } = require('./notifications');
const { endEntry } = require('./history');

const RANK = { high: 0, medium: 1, low: 2 };
const AGING_INTERVAL_MS = MINUTE; // how often the server checks for long waits
const CALLED_FOR_MS = 30 * MINUTE; // how long the "it's your turn" banner stays up

// ---------- reading and writing queues ----------

function toEntry(row) {
  return {
    id: row.entry_id,
    name: row.display_name,
    priority: row.priority,
    joinedAt: row.join_time,
    userId: row.user_id,
    note: row.note,
    lastPos: row.last_position,
    aged: row.aged === 1
  };
}

// The waiting students for a service, in line order. 404 if the service doesn't exist.
function getQueue(serviceId) {
  const { queueId } = getService(serviceId);
  return db.prepare("SELECT * FROM queue_entries WHERE queue_id = ? AND status = 'waiting' ORDER BY position")
    .all(queueId).map(toEntry);
}

const upsertEntry = db.prepare(`
  INSERT INTO queue_entries (entry_id, queue_id, user_id, display_name, position, priority, join_time, status, note, last_position, aged)
  VALUES (@id, @queueId, @userId, @name, @position, @priority, @joinedAt, 'waiting', @note, @lastPos, @aged)
  ON CONFLICT(entry_id) DO UPDATE SET
    position = excluded.position, priority = excluded.priority,
    last_position = excluded.last_position, aged = excluded.aged`);

// Saves the array order as positions 1..n. Entries that left the queue must be ended
// (history.endEntry) before this runs. Positions are first moved out of the way
// (+1,000,000) so the "one person per position" unique index never trips mid-update.
function saveQueue(serviceId, queue) {
  const { queueId } = getService(serviceId);
  db.prepare("UPDATE queue_entries SET position = position + 1000000 WHERE queue_id = ? AND status = 'waiting'").run(queueId);
  queue.forEach((entry, i) => {
    upsertEntry.run({ ...entry, queueId, position: i + 1, lastPos: entry.lastPos ?? null, aged: entry.aged ? 1 : 0 });
  });
}

function sortQueue(queue) {
  queue.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.joinedAt - b.joinedAt);
}

// Where someone with this priority would go: after everyone with the same or higher priority.
function insertPosition(queue, priority) {
  let i = queue.length;
  while (i > 0 && RANK[queue[i - 1].priority] > RANK[priority]) i -= 1;
  return i;
}

// Moves one entry to where its priority and join time put it, without re-sorting
// everyone else, so an advisor's manual moves (moveEntry) are kept.
function reposition(queue, entry) {
  queue.splice(queue.indexOf(entry), 1);
  let i = 0;
  while (i < queue.length && (RANK[queue[i].priority] < RANK[entry.priority]
    || (queue[i].priority === entry.priority && queue[i].joinedAt <= entry.joinedAt))) i += 1;
  queue.splice(i, 0, entry);
}

// Tells students whose place changed, then saves the new order.
function updatePositions(serviceId, queue) {
  notifyPositionChanges(getService(serviceId).name, queue);
  saveQueue(serviceId, queue);
}

// ---------- looking at queues ----------

// Advisors see the whole queue. Students only see their own name (A1 privacy rule).
function viewQueue(serviceId, user) {
  return getQueue(serviceId).map((entry, i) => {
    if (user.role === 'admin' || entry.userId === user.id) {
      return { id: entry.id, name: entry.name, priority: entry.priority, joinedAt: entry.joinedAt, userId: entry.userId, note: entry.note };
    }
    return { id: `place-${i + 1}`, name: null, priority: entry.priority, joinedAt: entry.joinedAt, userId: null, note: '' };
  });
}

// Where a new student would land if they joined now.
function previewJoin(serviceId) {
  const service = getService(serviceId);
  const position = insertPosition(getQueue(serviceId), service.priority) + 1;
  return { serviceId, position, estimatedWait: estimateWait(service, position) };
}

// Read-only advisor search: keep each match's actual position in the queue.
function searchQueue(serviceId, options = {}) {
  const query = options.query ?? '';
  const priority = options.priority ?? 'all';
  validate({ query, priority }, {
    query: { label: 'Search query', type: 'string', maxLength: 100 },
    priority: { label: 'Priority filter', type: 'string', oneOf: ['all', ...PRIORITIES] }
  });

  const entries = getQueue(serviceId);
  const emailOf = db.prepare('SELECT email FROM user_credentials WHERE user_id = ?');
  const term = query.trim().toLowerCase();
  const matches = entries.flatMap((entry, index) => {
    const email = (entry.userId && emailOf.get(entry.userId)?.email) || '';
    if (priority !== 'all' && entry.priority !== priority) return [];
    if (term && !`${entry.name} ${email}`.toLowerCase().includes(term)) return [];
    return [{
      id: entry.id, name: entry.name, priority: entry.priority,
      joinedAt: entry.joinedAt, userId: entry.userId, note: entry.note,
      position: index + 1
    }];
  });
  return { entries: matches, total: entries.length, matchCount: matches.length };
}

// The queue this user is in right now, or null.
function findEntry(userId) {
  const row = db.prepare(`SELECT e.*, q.service_id FROM queue_entries e JOIN queues q ON q.queue_id = e.queue_id
    WHERE e.user_id = ? AND e.status = 'waiting'`).get(userId);
  if (!row) return null;
  const service = getService(row.service_id);
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM queue_entries WHERE queue_id = ? AND status = 'waiting'").get(row.queue_id);
  return {
    serviceId: row.service_id,
    entry: toEntry(row),
    position: row.position,
    total,
    estimatedWait: estimateWait(service, row.position)
  };
}

// ---------- students ----------

const joinQueue = transaction((user, serviceId, body = {}) => {
  validate(body, { note: { label: 'Note', type: 'string', maxLength: 200 } });
  const service = getService(serviceId);
  if (!service.open) throw new ApiError(409, 'That service is closed right now.');
  if (findEntry(user.id)) throw new ApiError(409, 'You are already in a queue. Leave it before joining another.');

  const queue = getQueue(serviceId);
  const entry = {
    id: newId('e'),
    name: user.name,
    priority: service.priority,
    joinedAt: Date.now(),
    userId: user.id,
    note: (body.note || '').trim(),
    lastPos: null,
    aged: false
  };
  queue.splice(insertPosition(queue, entry.priority), 0, entry);
  updatePositions(serviceId, queue); // saves the new entry and tells anyone who got pushed back
  db.prepare('DELETE FROM called_alerts WHERE user_id = ?').run(user.id);

  const position = queue.indexOf(entry) + 1;
  notify(user.id, `You joined the ${service.name} queue at position ${position}.`);
  if (position <= ALMOST_READY) {
    notify(user.id, `Almost ready: you are now #${position} in ${service.name}. Please stay close to the advising center.`, 'status');
  }
  return { serviceId, position, total: queue.length, estimatedWait: estimateWait(service, position) };
});

const leaveQueue = transaction((userId) => {
  const found = findEntry(userId);
  if (!found) throw new ApiError(404, 'You are not in a queue.');
  const service = getService(found.serviceId);
  const queue = getQueue(found.serviceId);
  queue.splice(found.position - 1, 1);
  endEntry(found.entry.id, 'left queue');
  notify(userId, `You left the ${service.name} queue.`);
  updatePositions(found.serviceId, queue);
  return { left: true };
});

// ---------- advisors ----------

// Advisor calls the first student in line. Returns null if nobody is waiting.
const serveNext = transaction((serviceId) => {
  const queue = getQueue(serviceId);
  if (queue.length === 0) return null;
  const service = getService(serviceId);
  const entry = queue.shift();
  endEntry(entry.id, 'completed');

  if (entry.userId) {
    db.prepare(`INSERT INTO called_alerts (user_id, service_name, called_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET service_name = excluded.service_name, called_at = excluded.called_at`)
      .run(entry.userId, service.name, Date.now());
    notify(entry.userId, `It's your turn. Please go to the ${service.name} advisor now.`, 'status');
  }
  updatePositions(serviceId, queue);
  return entry;
});

function findIndex(queue, entryId) {
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) throw new ApiError(404, 'That student is not in this queue.');
  return index;
}

// outcome: 'removed' (saved in history as canceled) or 'no-show'
const removeEntry = transaction((serviceId, entryId, body = {}) => {
  const outcome = body.outcome || 'removed';
  validate({ outcome }, { outcome: { label: 'Outcome', type: 'string', oneOf: ['removed', 'no-show'] } });
  const service = getService(serviceId);
  const queue = getQueue(serviceId);
  const [entry] = queue.splice(findIndex(queue, entryId), 1);

  if (outcome === 'no-show') {
    endEntry(entry.id, 'no-show');
    notify(entry.userId, `You were marked as a no-show for ${service.name}. You can join again from Join a queue.`, 'status');
  } else {
    endEntry(entry.id, 'canceled');
    notify(entry.userId, `An advisor removed you from the ${service.name} queue.`, 'status');
  }
  updatePositions(serviceId, queue);
  return { ...entry, outcome };
});

// direction: -1 moves up one place, 1 moves down one place
const moveEntry = transaction((serviceId, entryId, body = {}) => {
  validate(body, { direction: { label: 'Direction', required: true, type: 'integer', oneOf: [-1, 1] } });
  const queue = getQueue(serviceId);
  const from = findIndex(queue, entryId);
  const to = from + body.direction;
  if (to < 0 || to >= queue.length) throw new ApiError(400, 'That student can’t move any further.');
  [queue[from], queue[to]] = [queue[to], queue[from]];
  updatePositions(serviceId, queue);
  return queue;
});

const setPriority = transaction((serviceId, entryId, body = {}) => {
  validate(body, { priority: { label: 'Priority', required: true, type: 'string', oneOf: PRIORITIES } });
  const queue = getQueue(serviceId);
  const entry = queue[findIndex(queue, entryId)];
  entry.priority = body.priority;
  reposition(queue, entry);
  updatePositions(serviceId, queue);
  return queue;
});

// ---------- priority aging (starvation prevention, from A1) ----------

// Ages one queue. Returns how many students moved up a priority level.
const ageQueue = transaction((serviceId) => {
  const service = getService(serviceId);
  const queue = getQueue(serviceId);
  const now = Date.now();
  const aged = [];

  queue.forEach((entry) => {
    const elapsedMinutes = (now - entry.joinedAt) / MINUTE;
    if (elapsedMinutes >= service.duration * 2.5 && entry.priority !== 'high') {
      entry.priority = 'high';
      entry.aged = true;
      aged.push(entry);
      notify(entry.userId, `Your priority in ${service.name} was increased to High due to your wait time.`, 'info');
    } else if (entry.priority === 'low' && elapsedMinutes >= service.duration * 1.5) {
      entry.priority = 'medium';
      entry.aged = true;
      aged.push(entry);
      notify(entry.userId, `Your priority in ${service.name} was increased to Medium due to your wait time.`, 'info');
    }
  });

  if (aged.length > 0) {
    aged.forEach((entry) => reposition(queue, entry));
    updatePositions(serviceId, queue);
  }
  return aged.length;
});

// The advisor's manual /age-check route: ages one queue and returns it.
function applyPriorityAging(serviceId) {
  ageQueue(serviceId);
  return getQueue(serviceId);
}

// Ages every queue, including closed services (students there keep their spot).
// Bumps the data version when anything changed, so open browser tabs refresh.
function ageAllQueues() {
  const aged = listServices().reduce((sum, service) => sum + ageQueue(service.id), 0);
  if (aged > 0) data.version += 1;
  return aged;
}

// Runs ageAllQueues on a timer so aging happens without anyone clicking anything.
// unref() lets the process exit normally (e.g. in tests) even while the timer exists.
function startPriorityAging(intervalMs = AGING_INTERVAL_MS) {
  const timer = setInterval(ageAllQueues, intervalMs);
  timer.unref();
  return timer;
}

// ---------- "it's your turn" banner ----------

function getCalled(userId) {
  const row = db.prepare('SELECT * FROM called_alerts WHERE user_id = ?').get(userId);
  if (row && Date.now() - row.called_at < CALLED_FOR_MS) return { service: row.service_name, at: row.called_at };
  return null;
}

function dismissCalled(userId) {
  db.prepare('DELETE FROM called_alerts WHERE user_id = ?').run(userId);
}

module.exports = {
  sortQueue, insertPosition, reposition, viewQueue, searchQueue, previewJoin, findEntry, joinQueue, leaveQueue,
  serveNext, removeEntry, moveEntry, setPriority, applyPriorityAging, ageQueue, ageAllQueues, startPriorityAging,
  AGING_INTERVAL_MS, getCalled, dismissCalled, getQueue, saveQueue
};
