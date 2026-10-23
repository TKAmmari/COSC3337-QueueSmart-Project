const express = require('express');
const services = require('../modules/services');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/', (req, res) => {
  res.json({ services: services.listServices() });
});

router.get('/:id', (req, res) => {
  res.json({ service: services.getService(req.params.id) });
});

router.post('/', requireRole('admin'), (req, res) => {
  res.status(201).json({ service: services.createService(req.body) });
});

router.put('/:id', requireRole('admin'), (req, res) => {
  res.json({ service: services.updateService(req.params.id, req.body) });
});

router.patch('/:id/status', requireRole('admin'), (req, res) => {
  res.json({ service: services.setServiceOpen(req.params.id, req.body) });
});

router.patch('/:id/advisors', requireRole('admin'), (req, res) => {
  res.json({ service: services.setAdvisors(req.params.id, req.body) });
});

module.exports = router;
