// History module: a student's past queue visits and how each one ended.
// There is no separate history table: a visit is a queue_entries row that is no
// longer 'waiting'. The queue module ends a visit with endEntry() below.
const { db, MINUTE } = require('../data/store');
const ApiError = require('../utils/ApiError');

const OUTCOMES = ['completed', 'left queue', 'canceled', 'no-show'];

function waitMinutes(joinedAt, endedAt) {
  return Math.max(0, Math.round((endedAt - joinedAt) / MINUTE));
}

// Marks a waiting entry as finished. 'completed' -> status served, everything else -> canceled.
function endEntry(entryId, outcome, endedAt = Date.now()) {
  if (!OUTCOMES.includes(outcome)) throw new ApiError(400, `Outcome must be one of: ${OUTCOMES.join(', ')}.`);
  const status = outcome === 'completed' ? 'served' : 'canceled';
  db.prepare(`UPDATE queue_entries SET status = ?, outcome = ?, ended_at = ?, position = NULL
    WHERE entry_id = ? AND status = 'waiting'`).run(status, outcome, endedAt, entryId);
}

function localDay(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// outcome is optional: 'all' or one of OUTCOMES (or an options object with outcome, from, to, service)
function getHistory(userId, optionsOrOutcome = 'all') {
  const options = typeof optionsOrOutcome === 'object' && optionsOrOutcome !== null
    ? optionsOrOutcome
    : { outcome: optionsOrOutcome };
  const outcome = options.outcome || 'all';
  const { from, to, service } = options;

  if (outcome !== 'all' && !OUTCOMES.includes(outcome)) {
    throw new ApiError(400, `Outcome must be one of: all, ${OUTCOMES.join(', ')}.`);
  }

  const rows = db.prepare(`
    SELECT e.entry_id, e.user_id, e.join_time, e.ended_at, e.outcome, s.name AS service
    FROM queue_entries e
    JOIN queues q ON q.queue_id = e.queue_id
    JOIN services s ON s.service_id = q.service_id
    WHERE e.user_id = ? AND e.status <> 'waiting'
    ORDER BY e.ended_at DESC`).all(userId);

  return rows
    .map((r) => ({ id: r.entry_id, userId: r.user_id, service: r.service, date: r.ended_at, wait: waitMinutes(r.join_time, r.ended_at), outcome: r.outcome }))
    .filter((h) => outcome === 'all' || h.outcome === outcome)
    .filter((h) => !service || h.service.toLowerCase() === service.trim().toLowerCase())
    .filter((h) => (!from || localDay(h.date) >= from) && (!to || localDay(h.date) <= to));
}

module.exports = { OUTCOMES, endEntry, getHistory, waitMinutes };
