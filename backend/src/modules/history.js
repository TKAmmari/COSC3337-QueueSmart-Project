// History module: records each queue a student was in and how it ended.
const { data, newId, MINUTE } = require('../data/store');
const ApiError = require('../utils/ApiError');

const OUTCOMES = ['completed', 'left queue', 'canceled', 'no-show'];

function addHistory(userId, serviceName, joinedAt, outcome) {
  if (!userId) return null; // walk-ins have no account, so no history
  const record = {
    id: newId('h'),
    userId,
    service: serviceName,
    date: Date.now(),
    wait: Math.max(0, Math.round((Date.now() - joinedAt) / MINUTE)),
    outcome
  };
  data.history.unshift(record);
  return record;
}

// outcome is optional: 'all' or one of OUTCOMES
function getHistory(userId, outcome = 'all') {
  if (outcome !== 'all' && !OUTCOMES.includes(outcome)) {
    throw new ApiError(400, `Outcome must be one of: all, ${OUTCOMES.join(', ')}.`);
  }
  return data.history
    .filter((h) => h.userId === userId)
    .filter((h) => outcome === 'all' || h.outcome === outcome)
    .sort((a, b) => b.date - a.date);
}

module.exports = { OUTCOMES, addHistory, getHistory };
