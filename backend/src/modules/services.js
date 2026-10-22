// Service management module: the advising services students can queue for.
const { data, newId } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { notify } = require('./notifications');

const PRIORITIES = ['low', 'medium', 'high'];

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

module.exports = { PRIORITIES, listServices, getService, createService, updateService, setServiceOpen };
