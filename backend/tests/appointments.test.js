const { data, resetData } = require('../src/data/store');
const appointments = require('../src/modules/appointments');

const student = { id: 'u1', role: 'student' };
const advisor = { id: 'u2', role: 'admin' };
const otherStudent = { id: 'u9', role: 'student' };

// A date a week from today, as YYYY-MM-DD
function nextWeek() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  test('no past dates and only during office hours', () => {
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: '2020-01-01', time: '10:00' })).toThrow('in the past');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '18:00' })).toThrow('9:00 AM to 4:30 PM');
  });

  test('no double booking', () => {
    appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(() => appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' })).toThrow('already have an appointment');
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
});
