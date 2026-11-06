// Appointments (added in A2): students book, change, and cancel appointments.
// Advisors can see all of them on their dashboard. Stored in the appointments table.
// Each service takes one appointment per advisor on duty in a time slot, and an
// appointment nobody checked in for becomes 'missed' once its day is over.
const { db, data, newId, MINUTE, transaction } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { getService } = require('./services');
const { notify } = require('./notifications');
const { getUser } = require('./auth');
const queue = require('./queue');

const APPOINTMENT_TIMES = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'];
const MISSED_CHECK_INTERVAL_MS = MINUTE; // how often the server looks for missed appointments

const appointmentRules = {
  date: { label: 'Appointment date', required: true, type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: 'Appointment date must look like 2026-10-23.' },
  time: { label: 'Appointment time', required: true, type: 'string', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Appointment time must look like 09:00.' }
};

function dayString(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkDateAndTime(date, time) {
  // The pattern only checks the shape, so also make sure it's a real day (no 2026-13-45 or 2026-02-30).
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new ApiError(400, 'Appointment date is not a real date.', [{ field: 'date', message: 'Appointment date is not a real date.' }]);
  }
  if (date < dayString()) throw new ApiError(400, 'Appointment date can’t be in the past.');
  if (d.getDay() === 0 || d.getDay() === 6) throw new ApiError(400, 'Appointments are available Monday to Friday.');
  if (time < '09:00' || time > '16:30') throw new ApiError(400, 'Appointments are available from 9:00 AM to 4:30 PM.');
  if (!APPOINTMENT_TIMES.includes(time)) throw new ApiError(400, 'Appointments start at 9, 10, or 11 AM, or at 1, 2, or 3 PM.');
  if (toStartAt(date, time) <= Date.now()) throw new ApiError(400, 'That appointment time has already passed.');
}

function toStartAt(date, time) {
  return new Date(`${date}T${time}`).getTime();
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

// Checked-in appointments still hold their slot; canceled and missed ones don't.
function checkSlotOpen(service, startAt, ignoreId) {
  const { taken } = db.prepare(`SELECT COUNT(*) AS taken FROM appointments
    WHERE service_id = ? AND start_at = ? AND status IN ('scheduled', 'checked-in') AND appointment_id IS NOT ?`)
    .get(service.id, startAt, ignoreId || null);
  if (taken >= service.advisors) throw new ApiError(409, `That time is full for ${service.name}. Please pick another time.`);
}

function setStatus(appointment, status) {
  db.prepare('UPDATE appointments SET status = ? WHERE appointment_id = ?').run(status, appointment.id);
  appointment.status = status;
}

// Only scheduled appointments can be changed, canceled, or checked in.
function checkScheduled(appointment, action) {
  if (appointment.status === 'canceled') throw new ApiError(409, `A canceled appointment can’t be ${action}.`);
  if (appointment.status === 'checked-in') throw new ApiError(409, `A checked-in appointment can’t be ${action}.`);
  if (appointment.status === 'missed') throw new ApiError(409, `A missed appointment can’t be ${action}.`);
}

const bookAppointment = transaction((user, body) => {
  validate(body, { serviceId: { label: 'Service', required: true, type: 'string' }, ...appointmentRules });
  const service = getService(body.serviceId);
  checkDateAndTime(body.date, body.time);
  const startAt = toStartAt(body.date, body.time);
  checkNotDoubleBooked(user.id, startAt);
  checkSlotOpen(service, startAt);

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
  const startAt = toStartAt(body.date, body.time);
  checkNotDoubleBooked(appointment.userId, startAt, appointment.id);
  checkSlotOpen(service, startAt, appointment.id);
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
  if (appointment.status === 'missed') throw new ApiError(409, 'Cannot check in for a missed appointment.');
  if (dayString(appointment.startAt) !== dayString()) throw new ApiError(409, 'You can only check in on the day of your appointment.');
  const studentUser = getUser(appointment.userId); // the student, even when an advisor checks them in
  // Join the queue first: if that fails (already in a queue, service closed), the transaction
  // rolls back and the appointment stays scheduled.
  const queueEntry = queue.joinQueue(studentUser, appointment.serviceId, { note: `Appointment Check-In (${appointment.id})` });
  setStatus(appointment, 'checked-in');
  notify(appointment.userId, `Checked in for your appointment. You have been added to the queue at position #${queueEntry.position}.`, 'status');
  return { appointment, queueEntry };
});

// Students can check in any time on the appointment day, so an appointment only
// counts as missed once that day has ended. Returns how many were marked.
const markMissedAppointments = transaction(() => {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const rows = db.prepare("SELECT * FROM appointments WHERE status = 'scheduled' AND start_at < ?").all(startOfToday);
  rows.map(toAppointment).forEach((appointment) => {
    setStatus(appointment, 'missed');
    notify(appointment.userId, `You missed your ${getService(appointment.serviceId).name} appointment on ${dayString(appointment.startAt)}.`, 'status');
  });
  if (rows.length > 0) data.version += 1; // open browser tabs refresh
  return rows.length;
});

// Runs at startup and then on a timer, so appointments that ended while the server
// was off are caught too. unref() lets the process exit normally (e.g. in tests).
function startMissedCheck(intervalMs = MISSED_CHECK_INTERVAL_MS) {
  markMissedAppointments();
  const timer = setInterval(markMissedAppointments, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  APPOINTMENT_TIMES, listAppointments, bookAppointment, updateAppointment, cancelAppointment,
  checkInAppointment, markMissedAppointments, startMissedCheck
};