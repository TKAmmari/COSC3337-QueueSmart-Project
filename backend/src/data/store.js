// In-memory data for Assignment 3. There is no database yet (that's Assignment 4),
// so everything lives in this object and resets when the server restarts.
// The starting data matches the mock data from our Assignment 2 front end.

const MINUTE = 60 * 1000;

const data = {
  version: 0 // goes up every time data changes, so open browser tabs know to refresh
};

let counter = 100;
function newId(prefix) {
  counter += 1;
  return prefix + counter;
}

function resetData() {
  const now = Date.now();
  const minutesAgo = (m) => now - m * MINUTE;
  const daysAgo = (days, hour, minute) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };
  // A queue entry. Most students in the seed are walk-ins without an account (userId null).
  const entry = (id, name, priority, minutes, userId = null) =>
    ({ id, name, priority, joinedAt: minutesAgo(minutes), userId, note: '', lastPos: null });

  // NOTE: passwords are plain text for the in-memory demo. We will hash them in A4.
  data.users = [
    { id: 'u1', name: 'Jordan Reyes', email: 'student@uh.edu', password: 'Student123!', role: 'student' },
    { id: 'u2', name: 'Maria Lopez', email: 'advisor@uh.edu', password: 'Advisor123!', role: 'admin' }
  ];

  data.sessions = {}; // token -> userId

  data.services = [
    { id: 's1', name: 'Registration Help', description: 'Adding, dropping, or swapping classes and fixing registration errors.', duration: 10, priority: 'medium', open: true, advisors: 2 },
    { id: 's2', name: 'Degree Audit Review', description: 'Walk through your degree audit and confirm the requirements you still need.', duration: 15, priority: 'low', open: true, advisors: 1 },
    { id: 's3', name: 'Change of Major', description: 'Talk through switching majors, new requirements, and the petition form.', duration: 25, priority: 'low', open: true, advisors: 1 },
    { id: 's4', name: 'Registration Hold Resolution', description: 'Clear advising or graduation holds that are blocking registration.', duration: 15, priority: 'high', open: true, advisors: 1 },
    { id: 's5', name: 'Graduation Check', description: 'Final review of graduation eligibility before you apply to graduate.', duration: 30, priority: 'medium', open: false, advisors: 1 }
  ];

  data.queues = {
    s1: [entry('e11', 'Kevin Tran', 'medium', 18), entry('e12', 'Sofia Alvarez', 'medium', 11), entry('e13', 'Ethan Brooks', 'medium', 7), entry('e14', 'Grace Okafor', 'medium', 2)],
    s2: [entry('e21', 'Marcus Lee', 'high', 31), entry('e22', 'Aisha Khan', 'low', 24), entry('e23', 'Jordan Reyes', 'low', 12, 'u1'), entry('e24', 'Daniel Kim', 'low', 4)],
    s3: [entry('e31', 'Hannah Nguyen', 'low', 9)],
    s4: [entry('e41', 'Luis Romero', 'high', 14), entry('e42', 'Chloe Martin', 'high', 6)],
    s5: []
  };
  // Remember everyone's current place so we can tell them when it changes.
  Object.values(data.queues).forEach((queue) => queue.forEach((e, i) => { e.lastPos = i + 1; }));

  data.appointments = [];

  data.history = [
    { id: 'h1', userId: 'u1', service: 'Registration Help', date: daysAgo(3, 10, 5), wait: 12, outcome: 'completed' },
    { id: 'h2', userId: 'u1', service: 'Registration Hold Resolution', date: daysAgo(9, 13, 40), wait: 21, outcome: 'completed' },
    { id: 'h3', userId: 'u1', service: 'Degree Audit Review', date: daysAgo(15, 9, 20), wait: 34, outcome: 'left queue' },
    { id: 'h4', userId: 'u1', service: 'Change of Major', date: daysAgo(22, 15, 10), wait: 0, outcome: 'canceled' },
    { id: 'h5', userId: 'u1', service: 'Registration Help', date: daysAgo(30, 11, 45), wait: 8, outcome: 'no-show' },
    { id: 'h6', userId: 'u1', service: 'Registration Help', date: daysAgo(41, 14, 0), wait: 16, outcome: 'completed' }
  ];

  // Today's finished sessions, used for the advisor statistics.
  data.servedLog = [9, 14, 6, 22, 11, 17, 4, 25, 13, 8, 19].map((wait, i) => ({
    serviceId: ['s1', 's2', 's4', 's3'][i % 4], wait, at: minutesAgo((i + 1) * 20), outcome: 'completed'
  }));
  data.servedLog.push({ serviceId: 's1', wait: 0, at: minutesAgo(250), outcome: 'no-show' });

  data.notifications = [
    { id: 'n1', userId: 'u1', type: 'queue', text: 'You joined the Degree Audit Review queue at position 4.', time: minutesAgo(12), read: true },
    { id: 'n2', userId: 'u1', type: 'queue', text: 'You moved up to position 3 in Degree Audit Review.', time: minutesAgo(6), read: false },
    { id: 'n3', userId: 'u1', type: 'info', text: 'Graduation Check is closed today. Walk-ins reopen tomorrow at 9:00 AM.', time: minutesAgo(90), read: false },
    { id: 'n4', userId: 'u2', type: 'queue', text: 'Registration Help now has 4 students waiting.', time: minutesAgo(2), read: false }
  ];

  data.called = {}; // userId -> { service, at }, set when an advisor serves that student

  data.version += 1;
}

resetData();

module.exports = { data, newId, resetData, MINUTE };
