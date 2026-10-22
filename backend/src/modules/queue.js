// Queue management module.
// Students join, leave, and check their position.
// Advisors serve the next student, remove students, reorder, and change priority.
//
// Queue order (A1 rule): high priority first, then medium, then low.
// Inside the same priority, whoever joined first goes first.
const { data, newId, MINUTE } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { getService, PRIORITIES } = require('./services');
const { estimateWait } = require('./waitTime');
const { notify, notifyPositionChanges, ALMOST_READY } = require('./notifications');
const { addHistory } = require('./history');

const RANK = { high: 0, medium: 1, low: 2 };

function getQueue(serviceId) {
  getService(serviceId); // throws 404 if the service doesn't exist
  if (!data.queues[serviceId]) data.queues[serviceId] = [];
  return data.queues[serviceId];
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

function updatePositions(serviceId) {
  notifyPositionChanges(getService(serviceId).name, getQueue(serviceId));
}

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

// The queue this user is in right now, or null.
function findEntry(userId) {
  for (const serviceId of Object.keys(data.queues)) {
    const queue = data.queues[serviceId];
    const index = queue.findIndex((e) => e.userId === userId);
    if (index !== -1) {
      const position = index + 1;
      return {
        serviceId,
        entry: queue[index],
        position,
        total: queue.length,
        estimatedWait: estimateWait(getService(serviceId), position)
      };
    }
  }
  return null;
}

function joinQueue(user, serviceId, body = {}) {
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
    lastPos: null
  };
  queue.splice(insertPosition(queue, entry.priority), 0, entry);
  updatePositions(serviceId); // tells anyone who got pushed back
  delete data.called[user.id];

  const position = queue.indexOf(entry) + 1;
  notify(user.id, `You joined the ${service.name} queue at position ${position}.`);
  if (position <= ALMOST_READY) {
    notify(user.id, `Almost ready: you are now #${position} in ${service.name}. Please stay close to the advising center.`, 'status');
  }
  return { serviceId, position, total: queue.length, estimatedWait: estimateWait(service, position) };
}

function leaveQueue(userId) {
  const found = findEntry(userId);
  if (!found) throw new ApiError(404, 'You are not in a queue.');
  const service = getService(found.serviceId);
  const queue = getQueue(found.serviceId);
  queue.splice(found.position - 1, 1);
  addHistory(userId, service.name, found.entry.joinedAt, 'left queue');
  notify(userId, `You left the ${service.name} queue.`);
  updatePositions(found.serviceId);
  return { left: true };
}

// Advisor calls the first student in line. Returns null if nobody is waiting.
function serveNext(serviceId) {
  const queue = getQueue(serviceId);
  if (queue.length === 0) return null;
  const service = getService(serviceId);
  const entry = queue.shift();
  const wait = Math.round((Date.now() - entry.joinedAt) / MINUTE);
  data.servedLog.unshift({ serviceId, wait, at: Date.now(), outcome: 'completed' });

  if (entry.userId) {
    data.called[entry.userId] = { service: service.name, at: Date.now() };
    addHistory(entry.userId, service.name, entry.joinedAt, 'completed');
    notify(entry.userId, `It's your turn. Please go to the ${service.name} advisor now.`, 'status');
  }
  updatePositions(serviceId);
  return entry;
}

function findIndex(queue, entryId) {
  const index = queue.findIndex((e) => e.id === entryId);
  if (index === -1) throw new ApiError(404, 'That student is not in this queue.');
  return index;
}

// outcome: 'removed' (saved in history as canceled) or 'no-show'
function removeEntry(serviceId, entryId, body = {}) {
  const outcome = body.outcome || 'removed';
  validate({ outcome }, { outcome: { label: 'Outcome', type: 'string', oneOf: ['removed', 'no-show'] } });
  const service = getService(serviceId);
  const queue = getQueue(serviceId);
  const [entry] = queue.splice(findIndex(queue, entryId), 1);

  if (outcome === 'no-show') {
    data.servedLog.unshift({ serviceId, wait: 0, at: Date.now(), outcome: 'no-show' });
    addHistory(entry.userId, service.name, entry.joinedAt, 'no-show');
    notify(entry.userId, `You were marked as a no-show for ${service.name}. You can join again from Join a queue.`, 'status');
  } else {
    addHistory(entry.userId, service.name, entry.joinedAt, 'canceled');
    notify(entry.userId, `An advisor removed you from the ${service.name} queue.`, 'status');
  }
  updatePositions(serviceId);
  return { ...entry, outcome };
}

// direction: -1 moves up one place, 1 moves down one place
function moveEntry(serviceId, entryId, body = {}) {
  validate(body, { direction: { label: 'Direction', required: true, type: 'integer', oneOf: [-1, 1] } });
  const queue = getQueue(serviceId);
  const from = findIndex(queue, entryId);
  const to = from + body.direction;
  if (to < 0 || to >= queue.length) throw new ApiError(400, 'That student can’t move any further.');
  [queue[from], queue[to]] = [queue[to], queue[from]];
  updatePositions(serviceId);
  return queue;
}

function setPriority(serviceId, entryId, body = {}) {
  validate(body, { priority: { label: 'Priority', required: true, type: 'string', oneOf: PRIORITIES } });
  const queue = getQueue(serviceId);
  queue[findIndex(queue, entryId)].priority = body.priority;
  sortQueue(queue);
  updatePositions(serviceId);
  return queue;
}

// "It's your turn" message for a student who was just served (shown for 30 minutes).
function getCalled(userId) {
  const called = data.called[userId];
  if (called && Date.now() - called.at < 30 * MINUTE) return called;
  return null;
}

function dismissCalled(userId) {
  delete data.called[userId];
}

module.exports = {
  sortQueue, insertPosition, viewQueue, previewJoin, findEntry, joinQueue, leaveQueue,
  serveNext, removeEntry, moveEntry, setPriority, getCalled, dismissCalled
};
