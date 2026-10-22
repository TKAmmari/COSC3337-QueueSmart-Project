// Numbers for the advisor dashboard (from A1): waiting now, served today,
// average and longest wait, and no-show rate.
const { data } = require('../data/store');

function getStats() {
  const completed = data.servedLog.filter((s) => s.outcome === 'completed');
  const noShows = data.servedLog.filter((s) => s.outcome === 'no-show');
  const waits = completed.map((s) => s.wait);
  const total = (list) => list.reduce((sum, n) => sum + n, 0);

  return {
    waiting: total(Object.values(data.queues).map((q) => q.length)),
    served: completed.length,
    avgWait: waits.length ? Math.round(total(waits) / waits.length) : 0,
    maxWait: waits.length ? Math.max(...waits) : 0,
    noShowRate: data.servedLog.length ? Math.round((noShows.length / data.servedLog.length) * 100) : 0
  };
}

module.exports = { getStats };
