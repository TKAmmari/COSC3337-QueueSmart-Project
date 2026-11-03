const { resetData, MINUTE } = require('../src/data/store');
const { db, latestNotification, entryResult, addWaiting } = require('./helpers');
const notifications = require('../src/modules/notifications');
const history = require('../src/modules/history');
const { getStats } = require('../src/modules/stats');

beforeEach(() => resetData());

describe('notifications', () => {
  test('notify adds an unread notification', () => {
    const n = notifications.notify('u1', 'Hello', 'info');
    expect(n.read).toBe(false);
    expect(latestNotification()).toEqual(n);
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

  test('filters history by date range and service', () => {
    const regOnly = history.getHistory('u1', { service: 'Registration Help' });
    expect(regOnly.length).toBeGreaterThan(0);
    expect(regOnly.every(h => h.service === 'Registration Help')).toBe(true);

    const empty = history.getHistory('u1', { from: '2099-01-01' });
    expect(empty).toHaveLength(0);
  });

  test('endEntry turns a waiting entry into history with the wait in minutes', () => {
    addWaiting('s3', { id: 'e_new', name: 'Jordan Reyes', priority: 'low', joinedAt: Date.now() - 10 * MINUTE, userId: 'u2' });
    history.endEntry('e_new', 'completed');
    expect(entryResult('e_new')).toEqual({ status: 'served', outcome: 'completed' });
    const [record] = history.getHistory('u2');
    expect(record).toMatchObject({ id: 'e_new', service: 'Change of Major', wait: 10, outcome: 'completed' });
    expect(() => history.endEntry('e_new', 'won')).toThrow('Outcome must be one of');
  });

  test('a finished visit keeps no position', () => {
    history.endEntry('e23', 'left queue');
    const row = db.prepare('SELECT position, ended_at FROM queue_entries WHERE entry_id = ?').get('e23');
    expect(row.position).toBeNull();
    expect(row.ended_at).toBeGreaterThan(0);
  });
});

describe('advisor stats', () => {
  test('summarizes today’s numbers', () => {
    expect(getStats()).toMatchObject({ waiting: 11, served: 11, avgWait: 13, maxWait: 25, noShowRate: 8 });
  });

  test('includes service demand breakdown and appointment stats', () => {
    const stats = getStats();
    expect(Array.isArray(stats.serviceDemand)).toBe(true);
    expect(stats.serviceDemand).toHaveLength(5);
    expect(stats.serviceDemand[0]).toHaveProperty('serviceName');
    expect(stats.appointmentStats).toBeDefined();
    expect(stats.appointmentStats).toHaveProperty('cancelRate');
  });

  test('only counts sessions from today', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const addEnded = (id, status, outcome, wait) => db.prepare(`INSERT INTO queue_entries
      (entry_id, queue_id, display_name, position, priority, join_time, status, ended_at, outcome)
      VALUES (?, 'q1', 'Old Visit', NULL, 'medium', ?, ?, ?, ?)`).run(id, yesterday - wait * MINUTE, status, yesterday, outcome);
    addEnded('y1', 'served', 'completed', 99);
    addEnded('y2', 'canceled', 'no-show', 0);
    expect(getStats()).toMatchObject({ served: 11, maxWait: 25, noShowRate: 8 });
  });

  test('handles an empty day', () => {
    db.prepare("DELETE FROM queue_entries WHERE status <> 'waiting'").run();
    expect(getStats().avgWait).toBe(0);
    expect(getStats().noShowRate).toBe(0);
  });
});