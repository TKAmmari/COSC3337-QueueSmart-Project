// Smaller routers: notifications, history, appointments, and advisor stats.
const express = require('express');
const notifications = require('../modules/notifications');
const { getHistory } = require('../modules/history');
const appointments = require('../modules/appointments');
const { getStats } = require('../modules/stats');
const { requireLogin, requireRole } = require('../middleware/auth');

const notificationsRouter = express.Router();
notificationsRouter.use(requireLogin);
notificationsRouter.get('/', (req, res) => {
  res.json({
    notifications: notifications.getNotifications(req.user.id),
    unread: notifications.countUnread(req.user.id)
  });
});
notificationsRouter.post('/read-all', (req, res) => {
  res.json({ updated: notifications.markAllRead(req.user.id) });
});

const historyRouter = express.Router();
historyRouter.get('/', requireLogin, (req, res) => {
  const { outcome, from, to, service } = req.query;
  res.json({ history: getHistory(req.user.id, { outcome, from, to, service }) });
});

const appointmentsRouter = express.Router();
appointmentsRouter.use(requireLogin);
appointmentsRouter.get('/', (req, res) => {
  res.json({ appointments: appointments.listAppointments(req.user) });
});
appointmentsRouter.post('/', requireRole('student'), (req, res) => {
  res.status(201).json({ appointment: appointments.bookAppointment(req.user, req.body) });
});
appointmentsRouter.put('/:id', (req, res) => {
  res.json({ appointment: appointments.updateAppointment(req.user, req.params.id, req.body) });
});
appointmentsRouter.post('/:id/cancel', (req, res) => {
  res.json({ appointment: appointments.cancelAppointment(req.user, req.params.id) });
});
appointmentsRouter.post('/:id/check-in', (req, res) => {
  res.json(appointments.checkInAppointment(req.user, req.params.id));
});

const statsRouter = express.Router();
statsRouter.get('/', requireLogin, requireRole('admin'), (req, res) => {
  res.json({ stats: getStats() });
});

module.exports = { notificationsRouter, historyRouter, appointmentsRouter, statsRouter };