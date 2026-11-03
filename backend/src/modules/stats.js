// Numbers for the advisor dashboard (from A1): waiting now, served today,
// average and longest wait, and no-show rate. Everything is computed with SQL
// from the queue_entries and appointments tables.
const { db, MINUTE } = require('../data/store');
const { listServices } = require('./services');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStats() {
  // Only count sessions that ended today (the server can stay up for days).
  // A served visit's wait = time from joining the queue to being served.
  const today = db.prepare(`
    SELECT q.service_id, e.outcome, ROUND((e.ended_at - e.join_time) * 1.0 / ?) AS wait
    FROM queue_entries e JOIN queues q ON q.queue_id = e.queue_id
    WHERE e.ended_at >= ? AND e.outcome IN ('completed', 'no-show')`).all(MINUTE, startOfToday());
  const completed = today.filter((s) => s.outcome === 'completed');
  const noShows = today.filter((s) => s.outcome === 'no-show');
  const waits = completed.map((s) => Math.max(0, s.wait));
  const total = (list) => list.reduce((sum, n) => sum + n, 0);

  const waitingCounts = Object.fromEntries(db.prepare(`
    SELECT q.service_id, COUNT(e.entry_id) AS waiting
    FROM queues q LEFT JOIN queue_entries e ON e.queue_id = q.queue_id AND e.status = 'waiting'
    GROUP BY q.service_id`).all().map((r) => [r.service_id, r.waiting]));

  const serviceDemand = listServices().map((svc) => {
    const serviceWaits = completed.filter((s) => s.service_id === svc.id).map((s) => Math.max(0, s.wait));
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      waiting: waitingCounts[svc.id] || 0,
      servedToday: serviceWaits.length,
      avgWait: serviceWaits.length ? Math.round(total(serviceWaits) / serviceWaits.length) : 0
    };
  });

  const appts = db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(status = 'canceled'), 0) AS canceled,
      COALESCE(SUM(status = 'scheduled'), 0) AS scheduled
    FROM appointments`).get();

  return {
    waiting: total(Object.values(waitingCounts)),
    served: completed.length,
    avgWait: waits.length ? Math.round(total(waits) / waits.length) : 0,
    maxWait: waits.length ? Math.max(...waits) : 0,
    noShowRate: today.length ? Math.round((noShows.length / today.length) * 100) : 0,
    serviceDemand,
    appointmentStats: {
      total: appts.total,
      scheduled: appts.scheduled,
      canceled: appts.canceled,
      cancelRate: appts.total ? Math.round((appts.canceled / appts.total) * 100) : 0
    }
  };
}

module.exports = { getStats };
