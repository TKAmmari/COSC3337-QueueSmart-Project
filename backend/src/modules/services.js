// Service management module: the advising services students can queue for.
const { data, newId } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { notify } = require('./notifications');
const { estimateWait } = require('./waitTime');

const PRIORITIES = ['low', 'medium', 'high'];
const MAX_ADVISORS = 10;

const serviceRules = {
  name: { label: 'Service name', required: true, type: 'string', maxLength: 100 },
  description: { label: 'Description', required: true, type: 'string', maxLength: 500 },
  duration: { label: 'Expected duration', required: true, type: 'integer', min: 1, max: 240 },
  priority: { label: 'Priority level', required: true, type: 'string', oneOf: PRIORITIES }
};

function listServices() {
  return data.services;
}

function getService(id) {
  const service = data.services.find((s) => s.id === id);
  if (!service) throw new ApiError(404, 'Service not found.');
  return service;
}

function checkUniqueName(name, ignoreId) {
  const taken = data.services.some((s) => s.id !== ignoreId && s.name.toLowerCase() === name.trim().toLowerCase());
  if (taken) {
    throw new ApiError(400, 'A service with this name already exists.', [{ field: 'name', message: 'A service with this name already exists.' }]);
  }
}

function createService(body) {
  validate(body, serviceRules);
  checkUniqueName(body.name);
  const service = {
    id: newId('s'),
    name: body.name.trim(),
    description: body.description.trim(),
    duration: body.duration,
    priority: body.priority,
    open: true,
    advisors: 1
  };
  data.services.push(service);
  data.queues[service.id] = [];
  return service;
}

function updateService(id, body) {
  const service = getService(id);
  validate(body, serviceRules);
  checkUniqueName(body.name, id);
  service.name = body.name.trim();
  service.description = body.description.trim();
  service.duration = body.duration;
  service.priority = body.priority;
  return service;
}

function setServiceOpen(id, body) {
  const service = getService(id);
  validate(body, { open: { label: 'Open', required: true, type: 'boolean' } });
  if (service.open !== body.open) {
    service.open = body.open;
    const status = body.open ? 'open' : 'closed to new students';
    (data.queues[id] || []).forEach((entry) => notify(entry.userId, `${service.name} is now ${status}. Your spot is kept.`, 'info'));
  }
  return service;
}

// How many advisors are helping with this service right now. The wait estimate
// divides by this, so every student in line is told their new estimated wait.
function setAdvisors(id, body) {
  const service = getService(id);
  validate(body, { advisors: { label: 'Advisors on duty', required: true, type: 'integer', min: 1, max: MAX_ADVISORS } });
  if (service.advisors === body.advisors) return service;

  const queue = data.queues[id] || [];
  const oldWaits = queue.map((entry, i) => estimateWait(service, i + 1));
  service.advisors = body.advisors;
  queue.forEach((entry, i) => {
    const wait = estimateWait(service, i + 1);
    if (wait === oldWaits[i]) return; // e.g. the student at #1 waits 0 either way
    const who = `${service.advisors} advisor${service.advisors === 1 ? '' : 's'}`;
    notify(entry.userId, `${service.name} now has ${who} on duty. Your estimated wait is now about ${wait} min.`, 'info');
  });
  return service;
}

module.exports = { PRIORITIES, MAX_ADVISORS, listServices, getService, createService, updateService, setServiceOpen, setAdvisors };
