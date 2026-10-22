// Notification module: stores in-app notifications (no real email or SMS).
// The front end shows them in the bell panel and as pop-up toasts.
const { data, newId } = require('../data/store');

const ALMOST_READY = 2; // positions 1 and 2 count as "almost ready" (from A1)

function notify(userId, text, type = 'queue') {
  if (!userId) return null; // walk-in students without an account can't get notifications
  const notification = { id: newId('n'), userId, type, text, time: Date.now(), read: false };
  data.notifications.unshift(notification);
  return notification;
}

function getNotifications(userId) {
  return data.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.time - a.time);
}

function countUnread(userId) {
  return getNotifications(userId).filter((n) => !n.read).length;
}

function markAllRead(userId) {
  let count = 0;
  data.notifications.forEach((n) => {
    if (n.userId === userId && !n.read) {
      n.read = true;
      count += 1;
    }
  });
  return count;
}

// Called after a queue changes. Tells each student whose position moved.
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

module.exports = { ALMOST_READY, notify, getNotifications, countUnread, markAllRead, notifyPositionChanges };
