const { data, resetData } = require('../src/data/store');
const appointments = require('../src/modules/appointments');
const queue = require('../src/modules/queue');

const student = { id: 'u1', role: 'student' };
const advisor = { id: 'u2', role: 'admin' };
const otherStudent = { id: 'u9', role: 'student' };

// A date some days from today, as YYYY-MM-DD
function inDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const nextWeek = () => inDays(7);
const today = () => inDays(0);

beforeEach(() => resetData());

describe('appointments', () => {
  test('a student books an appointment', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(a.status).toBe('scheduled');
    expect(data.notifications[0].text).toMatch('appointment has been scheduled');
  });

  test('checks the fields', () => {
    expect(() => appointments.bookAppointment(student, {})).toThrow('Some fields are invalid.');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: '10/30/2026', time: '10:00' })).toThrow('must look like 2026-10-23');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '9am' })).toThrow('must look like 09:00');
  });

  test('rejects dates that don’t exist', () => {
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: '2099-13-45', time: '10:00' })).toThrow('not a real date');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: '2099-02-30', time: '10:00' })).toThrow('not a real date');
  });

  test('no past dates and only during office hours', () => {
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: '2020-01-01', time: '10:00' })).toThrow('in the past');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '18:00' })).toThrow('9:00 AM to 4:30 PM');
  });

  test('no double booking', () => {
    appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(() => appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' })).toThrow('already have an appointment');
  });

  test('no double booking when moving an appointment either', () => {
    appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    const b = appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '11:00' });
    expect(() => appointments.updateAppointment(student, b.id, { date: nextWeek(), time: '10:00' })).toThrow('already have an appointment');
    // keeping its own time slot is fine
    expect(appointments.updateAppointment(student, b.id, { date: nextWeek(), time: '11:00' }).id).toBe(b.id);
  });

  test('students see their own, advisors see all', () => {
    appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    data.appointments.push({ id: 'a9', userId: 'u9', serviceId: 's1', startAt: 0, status: 'scheduled' });
    expect(appointments.listAppointments(student)).toHaveLength(1);
    expect(appointments.listAppointments(advisor)).toHaveLength(2);
  });

  test('change the date, time, and service', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    const updated = appointments.updateAppointment(student, a.id, { serviceId: 's2', date: nextWeek(), time: '14:00' });
    expect(updated.serviceId).toBe('s2');
    expect(data.notifications[0].text).toMatch('was updated');
  });

  test('cancel an appointment, only once', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(appointments.cancelAppointment(student, a.id).status).toBe('canceled');
    expect(() => appointments.cancelAppointment(student, a.id)).toThrow('already canceled');
    expect(() => appointments.updateAppointment(student, a.id, { date: nextWeek(), time: '11:00' })).toThrow('can’t be changed');
  });

  test('other students can’t touch your appointment; unknown ids are 404', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(() => appointments.cancelAppointment(otherStudent, a.id)).toThrow('another student');
    expect(appointments.cancelAppointment(advisor, a.id).status).toBe('canceled');
    expect(() => appointments.cancelAppointment(student, 'nope')).toThrow('not found');
  });

  test('check in appointment transitions status and joins queue', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    if (queue.findEntry(student.id)) queue.leaveQueue(student.id);

    const res = appointments.checkInAppointment(student, a.id);
    expect(res.appointment.status).toBe('checked-in');
    expect(res.queueEntry.position).toBeGreaterThan(0);
    expect(() => appointments.checkInAppointment(student, a.id)).toThrow('Already checked in');
  });

  test('a checked-in appointment can’t be changed or canceled', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    queue.leaveQueue(student.id);
    appointments.checkInAppointment(student, a.id);
    expect(() => appointments.updateAppointment(student, a.id, { date: nextWeek(), time: '11:00' })).toThrow('checked-in appointment can’t be changed');
    expect(() => appointments.cancelAppointment(student, a.id)).toThrow('checked-in appointment can’t be canceled');
  });

  test('check-in only works on the day of the appointment', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: nextWeek(), time: '11:00' });
    queue.leaveQueue(student.id);
    expect(() => appointments.checkInAppointment(student, a.id)).toThrow('day of your appointment');
    expect(a.status).toBe('scheduled');
  });

  test('if joining the queue fails, the appointment stays scheduled', () => {
    // Jordan (u1) is already in the Degree Audit Review queue in the seed data.
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    expect(() => appointments.checkInAppointment(student, a.id)).toThrow('already in a queue');
    expect(a.status).toBe('scheduled');
  });

  test('an advisor can check a student in', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    queue.leaveQueue(student.id);
    const res = appointments.checkInAppointment(advisor, a.id);
    expect(res.appointment.status).toBe('checked-in');
    expect(queue.findEntry(student.id).serviceId).toBe('s3');
  });
});