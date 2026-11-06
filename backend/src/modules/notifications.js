// Notification module: stores in-app notifications in the notifications table
// (no real email or SMS). The front end shows them in the bell panel and as toasts.
// In the database, status 'sent' means unread and 'viewed' means read.
const { db, newId } = require('../data/store');
const ApiError = require('../utils/ApiError');

const ALMOST_READY = 2; // positions 1 and 2 count as "almost ready" (from A1)

// Database row -> the shape the front end already uses.
function toNotification(row) {
  return { id: row.notification_id, userId: row.user_id, type: row.type, text: row.message, time: row.created_at, read: row.status === 'viewed' };
}

const insert = db.prepare(`INSERT INTO notifications (notification_id, user_id, type, message, created_at, status)
  VALUES (?, ?, ?, ?, ?, 'sent')`);

function notify(userId, text, type = 'queue') {
  if (!userId) return null; // walk-in students without an account can't get notifications
  const notification = { id: newId('n'), userId, type, text, time: Date.now(), read: false };
  insert.run(notification.id, userId, type, text, notification.time);
  return notification;
}

// Newest first. rowid breaks ties between notifications made in the same millisecond.
function getNotifications(userId) {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(userId).map(toNotification);
}

function countUnread(userId) {
  return db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND status = 'sent'").get(userId).count;
}

function markAllRead(userId) {
  return db.prepare("UPDATE notifications SET status = 'viewed' WHERE user_id = ? AND status = 'sent'").run(userId).changes;
}

function deleteNotification(userId, notificationId) {
  const info = db.prepare('DELETE FROM notifications WHERE notification_id = ? AND user_id = ?')
    .run(notificationId, userId);
  if (info.changes === 0) {
    throw new ApiError(404, 'Notification not found.');
  }
  return { deleted: true };
}

function clearNotifications(userId) {
  const info = db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  return { cleared: info.changes };
}

// Called after a queue changes. Tells each student whose position moved.
// Updates entry.lastPos; the queue module then saves it to the database.
function notifyPositionChanges(serviceName, queue) {
  queue.forEach((entry, i) => {
    const position = i + 1;
    const oldPosition = entry.lastPos;
    entry.lastPos = position;

    if (!entry.userId || oldPosition === null || oldPosition === position) return;

    if (position <= ALMOST_READY && oldPosition > ALMOST_READY) {
      notify(entry.userId, `Almost ready: you are now #${position} in ${serviceName}. Please stay close to the advising center.`, 'status');
    } else if (position < oldPosition) {
      notify(entry.userId, `You moved up to position ${position} in ${serviceName}.`);
    } else {
      notify(entry.userId, `Your position in ${serviceName} changed to ${position} because a time-sensitive case was placed ahead.`);
    }
  });
}

module.exports = {
  ALMOST_READY,
  toNotification,
  notify,
  getNotifications,
  countUnread,
  markAllRead,
  notifyPositionChanges,
  deleteNotification,
  clearNotifications
};