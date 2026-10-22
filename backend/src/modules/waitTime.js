// Wait-time estimation (rule from A1):
// estimated wait = people ahead of you x session length / advisors on duty
const ApiError = require('../utils/ApiError');

function estimateWait(service, position) {
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 1) {
    throw new ApiError(400, 'Position must be a whole number of 1 or more.');
  }
  const peopleAhead = pos - 1;
  const advisors = service.advisors || 1;
  return Math.round((peopleAhead * service.duration) / advisors);
}

module.exports = { estimateWait };
