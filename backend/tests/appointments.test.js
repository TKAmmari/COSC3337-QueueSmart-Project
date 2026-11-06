const { resetData } = require('../src/data/store');
const { latestNotification } = require('./helpers');
const auth = require('../src/modules/auth');
const appointments = require('../src/modules/appointments');
const queue = require('../src/modules/queue');
const { getStats } = require('../src/modules/stats');
const { setAdvisors } = require('../src/modules/services');
const { db, data } = require('../src/data/store');

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

// The rules depend on the day and time, so the tests always run on a Wednesday at 8:00 AM.
const WEDNESDAY_8AM = new Date(2026, 10, 4, 8, 0);
const at = (days, hour, minute = 0) => new Date(2026, 10, 4 + days, hour, minute);

beforeEach(() => {
  jest.useFakeTimers({ now: WEDNESDAY_8AM });
  resetData();
});

afterEach(() => jest.useRealTimers());

const statusOf = (id) => db.prepare('SELECT status FROM appointments WHERE appointment_id = ?').get(id).status;
const registerAna = () => auth.register({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123' });

describe('appointments', () => {
  test('a student books an appointment', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(a.status).toBe('scheduled');
    expect(latestNotification().text).toMatch('appointment has been scheduled');
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
    const ana = auth.register({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123' });
    appointments.bookAppointment(ana, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    expect(appointments.listAppointments(student)).toHaveLength(1);
    expect(appointments.listAppointments(advisor)).toHaveLength(2);
  });

  test('change the date, time, and service', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    const updated = appointments.updateAppointment(student, a.id, { serviceId: 's2', date: nextWeek(), time: '14:00' });
    expect(updated.serviceId).toBe('s2');
    expect(latestNotification().text).toMatch('was updated');
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

describe('booking rules', () => {
  test('only weekdays', () => {
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: inDays(3), time: '10:00' })).toThrow('Monday to Friday');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: inDays(4), time: '10:00' })).toThrow('Monday to Friday');
    expect(appointments.bookAppointment(student, { serviceId: 's1', date: inDays(2), time: '10:00' }).status).toBe('scheduled');
  });

  test('only the time slots the booking form offers', () => {
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '09:07' })).toThrow('Appointments start at');
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '12:00' })).toThrow('Appointments start at');
    appointments.APPOINTMENT_TIMES.forEach((time) => {
      expect(appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time }).status).toBe('scheduled');
    });
  });

  test('a time earlier today has already passed', () => {
    jest.setSystemTime(at(0, 12));
    expect(() => appointments.bookAppointment(student, { serviceId: 's1', date: today(), time: '10:00' })).toThrow('already passed');
    expect(appointments.bookAppointment(student, { serviceId: 's1', date: today(), time: '14:00' }).status).toBe('scheduled');
  });

  test('an appointment can’t be moved to a time that has passed or a weekend', () => {
    const a = appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    jest.setSystemTime(at(0, 12));
    expect(() => appointments.updateAppointment(student, a.id, { date: today(), time: '10:00' })).toThrow('already passed');
    expect(() => appointments.updateAppointment(student, a.id, { date: inDays(3), time: '10:00' })).toThrow('Monday to Friday');
  });
});

describe('time slot limits', () => {
  test('a slot takes one appointment per advisor on duty', () => {
    const ana = registerAna();
    appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' }); // s2 has 1 advisor
    expect(() => appointments.bookAppointment(ana, { serviceId: 's2', date: nextWeek(), time: '10:00' })).toThrow('That time is full');
    setAdvisors('s2', { advisors: 2 });
    expect(appointments.bookAppointment(ana, { serviceId: 's2', date: nextWeek(), time: '10:00' }).status).toBe('scheduled');
  });

  test('the limit is per service and per time', () => {
    const ana = registerAna();
    appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' });
    expect(appointments.bookAppointment(ana, { serviceId: 's3', date: nextWeek(), time: '10:00' }).status).toBe('scheduled');
    expect(appointments.bookAppointment(ana, { serviceId: 's2', date: nextWeek(), time: '11:00' }).status).toBe('scheduled');
  });

  test('canceling frees the slot', () => {
    const ana = registerAna();
    const a = appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' });
    appointments.cancelAppointment(student, a.id);
    expect(appointments.bookAppointment(ana, { serviceId: 's2', date: nextWeek(), time: '10:00' }).status).toBe('scheduled');
  });

  test('a checked-in appointment keeps its slot', () => {
    const ana = registerAna();
    const a = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    queue.leaveQueue(student.id);
    appointments.checkInAppointment(student, a.id);
    expect(() => appointments.bookAppointment(ana, { serviceId: 's3', date: today(), time: '11:00' })).toThrow('That time is full');
  });

  test('moving into a full slot is rejected, but keeping your own slot is fine', () => {
    const ana = registerAna();
    appointments.bookAppointment(student, { serviceId: 's2', date: nextWeek(), time: '10:00' });
    const b = appointments.bookAppointment(ana, { serviceId: 's2', date: nextWeek(), time: '11:00' });
    expect(() => appointments.updateAppointment(ana, b.id, { date: nextWeek(), time: '10:00' })).toThrow('That time is full');
    expect(appointments.updateAppointment(ana, b.id, { date: nextWeek(), time: '11:00' }).id).toBe(b.id);
  });
});

describe('missed appointments', () => {
  const bookToday = () => appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });

  test('a scheduled appointment is missed once its day is over', () => {
    const a = bookToday();
    const before = data.version;
    jest.setSystemTime(at(1, 0));
    expect(appointments.markMissedAppointments()).toBe(1);
    expect(statusOf(a.id)).toBe('missed');
    expect(latestNotification().text).toMatch('You missed your Change of Major appointment');
    expect(data.version).toBeGreaterThan(before);
  });

  test('it is not missed while check-in is still possible that day', () => {
    const a = bookToday();
    jest.setSystemTime(at(0, 23, 59));
    expect(appointments.markMissedAppointments()).toBe(0);
    expect(statusOf(a.id)).toBe('scheduled');
  });

  test('canceled and checked-in appointments are left alone', () => {
    const canceled = bookToday();
    appointments.cancelAppointment(student, canceled.id);
    const checkedIn = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '13:00' });
    queue.leaveQueue(student.id);
    appointments.checkInAppointment(student, checkedIn.id);
    jest.setSystemTime(at(1, 0));
    expect(appointments.markMissedAppointments()).toBe(0);
    expect(statusOf(canceled.id)).toBe('canceled');
    expect(statusOf(checkedIn.id)).toBe('checked-in');
  });

  test('running it again changes nothing and sends no second notification', () => {
    bookToday();
    jest.setSystemTime(at(1, 0));
    appointments.markMissedAppointments();
    const before = data.version;
    expect(appointments.markMissedAppointments()).toBe(0);
    expect(data.version).toBe(before);
  });

  test('a missed appointment can’t be changed, canceled, or checked in', () => {
    const a = bookToday();
    jest.setSystemTime(at(1, 0));
    appointments.markMissedAppointments();
    expect(() => appointments.updateAppointment(student, a.id, { date: nextWeek(), time: '10:00' })).toThrow('missed appointment can’t be changed');
    expect(() => appointments.cancelAppointment(student, a.id)).toThrow('missed appointment can’t be canceled');
    expect(() => appointments.checkInAppointment(student, a.id)).toThrow('Cannot check in for a missed appointment');
  });

  test('missed appointments count in the advisor stats, not as scheduled', () => {
    bookToday();
    appointments.bookAppointment(student, { serviceId: 's1', date: nextWeek(), time: '10:00' });
    jest.setSystemTime(at(1, 0));
    appointments.markMissedAppointments();
    expect(getStats().appointmentStats).toMatchObject({ total: 2, scheduled: 1, missed: 1 });
  });

  test('the server checks at startup and then on a timer', () => {
    const first = bookToday();
    jest.setSystemTime(at(1, 0));
    const timer = appointments.startMissedCheck(1000);
    expect(statusOf(first.id)).toBe('missed');

    const second = appointments.bookAppointment(student, { serviceId: 's3', date: today(), time: '11:00' });
    jest.setSystemTime(at(2, 0));
    jest.advanceTimersByTime(1000);
    expect(statusOf(second.id)).toBe('missed');
    clearInterval(timer);
  });
});