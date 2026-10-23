const express = require('express');
const queue = require('../modules/queue');
const { getService } = require('../modules/services');
const { estimateWait } = require('../modules/waitTime');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// ----- the signed-in student's own queue -----
// (these come before '/:serviceId' so Express doesn't read "me" as a service id)
router.get('/me', (req, res) => {
  res.json({ current: queue.findEntry(req.user.id) });
});

router.get('/me/called', (req, res) => {
  res.json({ called: queue.getCalled(req.user.id) });
});

router.delete('/me/called', (req, res) => {
  queue.dismissCalled(req.user.id);
  res.json({ dismissed: true });
});

router.post('/leave', requireRole('student'), (req, res) => {
  res.json(queue.leaveQueue(req.user.id));
});

// ----- looking at a queue -----
router.get('/:serviceId', (req, res) => {
  res.json({ entries: queue.viewQueue(req.params.serviceId, req.user) });
});

router.get('/:serviceId/projection', (req, res) => {
  res.json(queue.previewJoin(req.params.serviceId));
});

router.get('/:serviceId/estimate', (req, res) => {
  const service = getService(req.params.serviceId);
  res.json({ estimatedWait: estimateWait(service, req.query.position) });
});

// ----- students -----
router.post('/:serviceId/join', requireRole('student'), (req, res) => {
  res.status(201).json(queue.joinQueue(req.user, req.params.serviceId, req.body));
});

// ----- advisors -----
router.post('/:serviceId/serve', requireRole('admin'), (req, res) => {
  res.json({ served: queue.serveNext(req.params.serviceId) });
});

router.delete('/:serviceId/entries/:entryId', requireRole('admin'), (req, res) => {
  res.json({ removed: queue.removeEntry(req.params.serviceId, req.params.entryId, req.body) });
});

router.post('/:serviceId/entries/:entryId/move', requireRole('admin'), (req, res) => {
  res.json({ entries: queue.moveEntry(req.params.serviceId, req.params.entryId, req.body) });
});

router.patch('/:serviceId/entries/:entryId/priority', requireRole('admin'), (req, res) => {
  res.json({ entries: queue.setPriority(req.params.serviceId, req.params.entryId, req.body) });
});

router.post('/:serviceId/age-check', requireRole('admin'), (req, res) => {
  res.json({ entries: queue.applyPriorityAging(req.params.serviceId) });
});

module.exports = router;