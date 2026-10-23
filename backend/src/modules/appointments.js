// Appointments (added in A2): students book, change, and cancel appointments.
// Advisors can see all of them on their dashboard.
const { data, newId } = require('../data/store');
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
  if (date < todayString()) throw new ApiError(400, 'Appointment date can’t be in the past.');
  if (time < '09:00' || time > '16:30') throw new ApiError(400, 'Appointments are available from 9:00 AM to 4:30 PM.');
}

function listAppointments(user) {
  const list = user.role === 'admin' ? data.appointments : data.appointments.filter((a) => a.userId === user.id);
  return [...list].sort((a, b) => a.startAt - b.startAt);
}

function findAppointment(user, id) {
  const appointment = data.appointments.find((a) => a.id === id);
  if (!appointment) throw new ApiError(404, 'Appointment not found.');
  if (user.role !== 'admin' && appointment.userId !== user.id) {
    throw new ApiError(403, 'That appointment belongs to another student.');
  }
  return appointment;
}

function bookAppointment(user, body) {
  validate(body, { serviceId: { label: 'Service', required: true, type: 'string' }, ...appointmentRules });
  const service = getService(body.serviceId);
  checkDateAndTime(body.date, body.time);
  const startAt = new Date(`${body.date}T${body.time}`).getTime();
  const taken = data.appointments.some((a) => a.userId === user.id && a.status === 'scheduled' && a.startAt === startAt);
  if (taken) throw new ApiError(409, 'You already have an appointment at that time.');

  const appointment = { id: newId('a'), userId: user.id, serviceId: service.id, startAt, status: 'scheduled' };
  data.appointments.push(appointment);
  notify(user.id, `Your ${service.name} appointment has been scheduled for ${body.date} at ${body.time}.`, 'info');
  return appointment;
}

function updateAppointment(user, id, body) {
  const appointment = findAppointment(user, id);
  if (appointment.status === 'canceled') throw new ApiError(409, 'A canceled appointment can’t be changed.');
  validate(body, appointmentRules);
  checkDateAndTime(body.date, body.time);
  const service = getService(body.serviceId || appointment.serviceId);
  appointment.serviceId = service.id;
  appointment.startAt = new Date(`${body.date}T${body.time}`).getTime();
  notify(appointment.userId, `Your ${service.name} appointment was updated to ${body.date} at ${body.time}.`, 'info');
  return appointment;
}

function cancelAppointment(user, id) {
  const appointment = findAppointment(user, id);
  if (appointment.status === 'canceled') throw new ApiError(409, 'That appointment is already canceled.');
  appointment.status = 'canceled';
  notify(appointment.userId, `Your ${getService(appointment.serviceId).name} appointment has been canceled.`, 'status');
  return appointment;
}

function checkInAppointment(user, id) {
  const appointment = findAppointment(user, id);
  if (appointment.status === 'canceled') throw new ApiError(409, 'Cannot check in for a canceled appointment.');
  if (appointment.status === 'checked-in') throw new ApiError(409, 'Already checked in for this appointment.');
  const studentUser = user.role === 'admin' ? getUser(appointment.userId) : user;
  appointment.status = 'checked-in';
  const queueEntry = queue.joinQueue(studentUser, appointment.serviceId, { note: `Appointment Check-In (${appointment.id})` });
  notify(appointment.userId, `Checked in for your appointment. You have been added to the queue at position #${queueEntry.position}.`, 'status');
  return { appointment, queueEntry };
}

module.exports = { listAppointments, bookAppointment, updateAppointment, cancelAppointment, checkInAppointment };