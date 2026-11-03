// Appointments (added in A2): students book, change, and cancel appointments.
// Advisors can see all of them on their dashboard. Stored in the appointments table.
const { db, newId, transaction } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { getService } = require('./services');
const { notify } = require('./notifications');
const { getUser } = require('./auth');
const queue = require('./queue');

const appointmentRules = {
  date: { label: 'Appointment date', required: true, type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: 'Appointment date must look like 2026-10-23.' },
  time: { label: 'Appointment time', required: true, type: 'string', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Appointment time must look like 09:00.' }
};

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkDateAndTime(date, time) {
  // The pattern only checks the shape, so also make sure it's a real day (no 2026-13-45 or 2026-02-30).
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new ApiError(400, 'Appointment date is not a real date.', [{ field: 'date', message: 'Appointment date is not a real date.' }]);
  }
  if (date < todayString()) throw new ApiError(400, 'Appointment date can’t be in the past.');
  if (time < '09:00' || time > '16:30') throw new ApiError(400, 'Appointments are available from 9:00 AM to 4:30 PM.');
}

function toAppointment(row) {
  return { id: row.appointment_id, userId: row.user_id, serviceId: row.service_id, startAt: row.start_at, status: row.status };
}

function listAppointments(user) {
  const rows = user.role === 'admin'
    ? db.prepare('SELECT * FROM appointments ORDER BY start_at, rowid').all()
    : db.prepare('SELECT * FROM appointments WHERE user_id = ? ORDER BY start_at, rowid').all(user.id);
  return rows.map(toAppointment);
}

function findAppointment(user, id) {
  const row = db.prepare('SELECT * FROM appointments WHERE appointment_id = ?').get(id);
  if (!row) throw new ApiError(404, 'Appointment not found.');
  const appointment = toAppointment(row);
  if (user.role !== 'admin' && appointment.userId !== user.id) {
    throw new ApiError(403, 'That appointment belongs to another student.');
  }
  return appointment;
}

// A student can't have two scheduled appointments at the same time.
// (The database also enforces this with the ux_no_double_booking unique index.)
function checkNotDoubleBooked(userId, startAt, ignoreId) {
  const taken = db.prepare(`SELECT 1 FROM appointments
    WHERE user_id = ? AND start_at = ? AND status = 'scheduled' AND appointment_id IS NOT ?`).get(userId, startAt, ignoreId || null);
  if (taken) throw new ApiError(409, 'You already have an appointment at that time.');
}

function setStatus(appointment, status) {
  db.prepare('UPDATE appointments SET status = ? WHERE appointment_id = ?').run(status, appointment.id);
  appointment.status = status;
}

// Only scheduled appointments can be changed, canceled, or checked in.
function checkScheduled(appointment, action) {
  if (appointment.status === 'canceled') throw new ApiError(409, `A canceled appointment can’t be ${action}.`);
  if (appointment.status === 'checked-in') throw new ApiError(409, `A checked-in appointment can’t be ${action}.`);
}

const bookAppointment = transaction((user, body) => {
  validate(body, { serviceId: { label: 'Service', required: true, type: 'string' }, ...appointmentRules });
  const service = getService(body.serviceId);
  checkDateAndTime(body.date, body.time);
  const startAt = new Date(`${body.date}T${body.time}`).getTime();
  checkNotDoubleBooked(user.id, startAt);

  const appointment = { id: newId('a'), userId: user.id, serviceId: service.id, startAt, status: 'scheduled' };
  db.prepare(`INSERT INTO appointments (appointment_id, user_id, service_id, start_at, status, created_at)
    VALUES (?, ?, ?, ?, 'scheduled', ?)`).run(appointment.id, user.id, service.id, startAt, Date.now());
  notify(user.id, `Your ${service.name} appointment has been scheduled for ${body.date} at ${body.time}.`, 'info');
  return appointment;
});

const updateAppointment = transaction((user, id, body) => {
  const appointment = findAppointment(user, id);
  checkScheduled(appointment, 'changed');
  validate(body, { serviceId: { label: 'Service', type: 'string' }, ...appointmentRules });
  checkDateAndTime(body.date, body.time);
  const service = getService(body.serviceId || appointment.serviceId);
  const startAt = new Date(`${body.date}T${body.time}`).getTime();
  checkNotDoubleBooked(appointment.userId, startAt, appointment.id);
  db.prepare('UPDATE appointments SET service_id = ?, start_at = ? WHERE appointment_id = ?').run(service.id, startAt, appointment.id);
  appointment.serviceId = service.id;
  appointment.startAt = startAt;
  notify(appointment.userId, `Your ${service.name} appointment was updated to ${body.date} at ${body.time}.`, 'info');
  return appointment;
});

const cancelAppointment = transaction((user, id) => {
  const appointment = findAppointment(user, id);
  if (appointment.status === 'canceled') throw new ApiError(409, 'That appointment is already canceled.');
  checkScheduled(appointment, 'canceled');
  setStatus(appointment, 'canceled');
  notify(appointment.userId, `Your ${getService(appointment.serviceId).name} appointment has been canceled.`, 'status');
  return appointment;
});

const checkInAppointment = transaction((user, id) => {
  const appointment = findAppointment(user, id);
  if (appointment.status === 'canceled') throw new ApiError(409, 'Cannot check in for a canceled appointment.');
  if (appointment.status === 'checked-in') throw new ApiError(409, 'Already checked in for this appointment.');
  const d = new Date(appointment.startAt);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (day !== todayString()) throw new ApiError(409, 'You can only check in on the day of your appointment.');
  const studentUser = getUser(appointment.userId); // the student, even when an advisor checks them in
  // Join the queue first: if that fails (already in a queue, service closed), the transaction
  // rolls back and the appointment stays scheduled.
  const queueEntry = queue.joinQueue(studentUser, appointment.serviceId, { note: `Appointment Check-In (${appointment.id})` });
  setStatus(appointment, 'checked-in');
  notify(appointment.userId, `Checked in for your appointment. You have been added to the queue at position #${queueEntry.position}.`, 'status');
  return { appointment, queueEntry };
});

module.exports = { listAppointments, bookAppointment, updateAppointment, cancelAppointment, checkInAppointment };