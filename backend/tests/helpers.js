// Small helpers the tests use to look inside the database.
const { db } = require('../src/data/store');
const queue = require('../src/modules/queue');
const { toNotification } = require('../src/modules/notifications');

// Names of the students waiting for a service, in line order.
const names = (serviceId) => queue.getQueue(serviceId).map((e) => e.name);

// Notification texts for one user, newest first.
const messagesFor = (userId) => db.prepare('SELECT message FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
  .all(userId).map((r) => r.message);

// The newest notification for anyone.
const latestNotification = () => toNotification(db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, rowid DESC LIMIT 1').get());

// How many rows a table has.
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

// status + outcome of one queue entry, e.g. { status: 'canceled', outcome: 'no-show' }.
const entryResult = (entryId) => ({ ...db.prepare('SELECT status, outcome FROM queue_entries WHERE entry_id = ?').get(entryId) });

// Puts a made-up student at the end of a service's queue (saved to the database).
function addWaiting(serviceId, entry) {
  const q = queue.getQueue(serviceId);
  q.push({ note: '', lastPos: null, aged: false, userId: null, ...entry });
  queue.saveQueue(serviceId, q);
}

module.exports = { db, names, messagesFor, latestNotification, count, entryResult, addWaiting };
