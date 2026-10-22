const { data, resetData } = require('../src/data/store');
const notifications = require('../src/modules/notifications');
const history = require('../src/modules/history');
const { getStats } = require('../src/modules/stats');

beforeEach(() => resetData());

describe('notifications', () => {
  test('notify adds an unread notification', () => {
    const n = notifications.notify('u1', 'Hello', 'info');
    expect(n.read).toBe(false);
    expect(data.notifications[0]).toBe(n);
  });

  test('walk-in students without an account get nothing', () => {
    expect(notifications.notify(null, 'Hello')).toBeNull();
  });

  test('lists a user’s notifications, newest first', () => {
    const list = notifications.getNotifications('u1');
    expect(list).toHaveLength(3);
    expect(list[0].time).toBeGreaterThanOrEqual(list[1].time);
  });

  test('counts unread and marks all as read', () => {
    expect(notifications.countUnread('u1')).toBe(2);
    expect(notifications.markAllRead('u1')).toBe(2);
    expect(notifications.countUnread('u1')).toBe(0);
    expect(notifications.countUnread('u2')).toBe(1); // other users are not touched
  });
});

describe('history', () => {
  test('lists only that user’s visits', () => {
    expect(history.getHistory('u1')).toHaveLength(6);
    expect(history.getHistory('u2')).toHaveLength(0);
  });

  test('can filter by outcome', () => {
    expect(history.getHistory('u1', 'completed')).toHaveLength(3);
    expect(() => history.getHistory('u1', 'won')).toThrow('Outcome must be one of');
  });

  test('addHistory saves the wait time in minutes', () => {
    const record = history.addHistory('u1', 'Change of Major', Date.now() - 10 * 60 * 1000, 'completed');
    expect(record.wait).toBe(10);
    expect(history.addHistory(null, 'x', Date.now(), 'completed')).toBeNull();
  });
});

describe('advisor stats', () => {
  test('summarizes today’s numbers', () => {
    expect(getStats()).toEqual({ waiting: 11, served: 11, avgWait: 13, maxWait: 25, noShowRate: 8 });
  });

  test('handles an empty day', () => {
    data.servedLog = [];
    expect(getStats().avgWait).toBe(0);
    expect(getStats().noShowRate).toBe(0);
  });
});
