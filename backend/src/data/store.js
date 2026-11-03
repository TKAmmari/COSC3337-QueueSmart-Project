// Shared data helpers (A4: the data now lives in the SQLite database, see src/db/).
//
// - db           the open database connection (from src/db/index.js)
// - newId()      makes a new random id like "u3f9a1c2b"
// - resetData()  wipes every table and loads the starting demo data
//                (the same demo data our A2 front end and A3 back end used)
// - data.version goes up every time something changes, so open browser tabs know to
//                refresh. It's only a signal for the front end, so it stays in memory.

const crypto = require('crypto');
const { db, transaction } = require('../db');
const { hashPassword } = require('../utils/password');

const MINUTE = 60 * 1000;

// Hashed once at startup so resetData() stays fast.
const SEED_PASSWORDS = { student: hashPassword('Student123!'), advisor: hashPassword('Advisor123!') };

const data = {
  version: 0
};

function newId(prefix) {
  return prefix + crypto.randomBytes(4).toString('hex');
}

// Child tables first, so foreign keys never point at a row that's already gone.
const TABLES = ['called_alerts', 'sessions', 'appointments', 'notifications', 'queue_entries', 'queues', 'services', 'user_profile', 'user_credentials'];

const insertUser = db.prepare(`INSERT INTO user_credentials (user_id, email, password_hash, role, created_at)
  VALUES (@id, @email, @password, @role, @now)`);
const insertProfile = db.prepare(`INSERT INTO user_profile (user_id, email, full_name, phone, preferences, updated_at)
  VALUES (@id, @email, @name, @phone, @preferences, @now)`);
const insertService = db.prepare(`INSERT INTO services (service_id, name, description, expected_duration, priority_level, advisors_on_duty, created_at)
  VALUES (@id, @name, @description, @duration, @priority, @advisors, @now)`);
const insertQueue = db.prepare(`INSERT INTO queues (queue_id, service_id, status, created_at)
  VALUES (@queueId, @id, @status, @now)`);
const insertEntry = db.prepare(`INSERT INTO queue_entries
  (entry_id, queue_id, user_id, display_name, position, priority, join_time, status, note, last_position, ended_at, outcome)
  VALUES (@id, @queueId, @userId, @name, @position, @priority, @joinedAt, @status, '', @position, @endedAt, @outcome)`);
const insertNotification = db.prepare(`INSERT INTO notifications (notification_id, user_id, type, message, created_at, status)
  VALUES (@id, @userId, @type, @text, @time, @status)`);

const resetData = transaction(() => {
  TABLES.forEach((table) => db.prepare(`DELETE FROM ${table}`).run());

  const now = Date.now();
  const minutesAgo = (m) => now - m * MINUTE;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  // Like minutesAgo, but never before midnight, so the seed always counts as "today".
  const earlierToday = (m) => Math.max(startOfToday, minutesAgo(m));
  const daysAgo = (days, hour, minute) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  // Passwords are stored hashed (see utils/password.js). Demo logins: Student123! and Advisor123!
  [
    { id: 'u1', name: 'Jordan Reyes', email: 'student@uh.edu', password: SEED_PASSWORDS.student, role: 'student', phone: '713-555-0142', preferences: { contactMethod: 'email' } },
    { id: 'u2', name: 'Maria Lopez', email: 'advisor@uh.edu', password: SEED_PASSWORDS.advisor, role: 'admin', phone: null, preferences: { contactMethod: 'in-app' } }
  ].forEach((u) => {
    insertUser.run({ id: u.id, email: u.email, password: u.password, role: u.role, now });
    insertProfile.run({ id: u.id, email: u.email, name: u.name, phone: u.phone, preferences: JSON.stringify(u.preferences), now });
  });

  const services = [
    { id: 's1', name: 'Registration Help', description: 'Adding, dropping, or swapping classes and fixing registration errors.', duration: 10, priority: 'medium', open: true, advisors: 2 },
    { id: 's2', name: 'Degree Audit Review', description: 'Walk through your degree audit and confirm the requirements you still need.', duration: 15, priority: 'low', open: true, advisors: 1 },
    { id: 's3', name: 'Change of Major', description: 'Talk through switching majors, new requirements, and the petition form.', duration: 25, priority: 'low', open: true, advisors: 1 },
    { id: 's4', name: 'Registration Hold Resolution', description: 'Clear advising or graduation holds that are blocking registration.', duration: 15, priority: 'high', open: true, advisors: 1 },
    { id: 's5', name: 'Graduation Check', description: 'Final review of graduation eligibility before you apply to graduate.', duration: 30, priority: 'medium', open: false, advisors: 1 }
  ];
  const queueOf = {};
  services.forEach((s, i) => {
    queueOf[s.id] = `q${i + 1}`;
    insertService.run({ id: s.id, name: s.name, description: s.description, duration: s.duration, priority: s.priority, advisors: s.advisors, now });
    insertQueue.run({ queueId: queueOf[s.id], id: s.id, status: s.open ? 'open' : 'closed', now });
  });

  // Students waiting right now. Most are walk-ins without an account (userId null).
  const waiting = {
    s1: [['e11', 'Kevin Tran', 'medium', 18], ['e12', 'Sofia Alvarez', 'medium', 11], ['e13', 'Ethan Brooks', 'medium', 7], ['e14', 'Grace Okafor', 'medium', 2]],
    s2: [['e21', 'Marcus Lee', 'high', 31], ['e22', 'Aisha Khan', 'low', 24], ['e23', 'Jordan Reyes', 'low', 12, 'u1'], ['e24', 'Daniel Kim', 'low', 4]],
    s3: [['e31', 'Hannah Nguyen', 'low', 9]],
    s4: [['e41', 'Luis Romero', 'high', 14], ['e42', 'Chloe Martin', 'high', 6]]
  };
  Object.entries(waiting).forEach(([serviceId, rows]) => rows.forEach(([id, name, priority, minutes, userId = null], i) => {
    insertEntry.run({ id, queueId: queueOf[serviceId], userId, name, position: i + 1, priority, joinedAt: minutesAgo(minutes), status: 'waiting', endedAt: null, outcome: null });
  }));

  // Visits that already ended: Jordan's past visits (their history) ...
  const ended = [
    ['h1', 's1', 'u1', 'Jordan Reyes', daysAgo(3, 10, 5), 12, 'completed'],
    ['h2', 's4', 'u1', 'Jordan Reyes', daysAgo(9, 13, 40), 21, 'completed'],
    ['h3', 's2', 'u1', 'Jordan Reyes', daysAgo(15, 9, 20), 34, 'left queue'],
    ['h4', 's3', 'u1', 'Jordan Reyes', daysAgo(22, 15, 10), 0, 'canceled'],
    ['h5', 's1', 'u1', 'Jordan Reyes', daysAgo(30, 11, 45), 8, 'no-show'],
    ['h6', 's1', 'u1', 'Jordan Reyes', daysAgo(41, 14, 0), 16, 'completed']
  ];
  // ... and today's finished walk-in sessions, used for the advisor statistics.
  const walkIns = ['Noah Patel', 'Emma Wilson', 'Liam Garcia', 'Olivia Chen', 'Mason Davis', 'Ava Johnson', 'Lucas Martinez', 'Mia Thompson', 'Elijah White', 'Isabella Harris', 'James Clark'];
  [9, 14, 6, 22, 11, 17, 4, 25, 13, 8, 19].forEach((wait, i) => {
    ended.push([`t${i + 1}`, ['s1', 's2', 's4', 's3'][i % 4], null, walkIns[i], earlierToday((i + 1) * 20), wait, 'completed']);
  });
  ended.push(['t12', 's1', null, 'Zoe Robinson', earlierToday(250), 0, 'no-show']);

  ended.forEach(([id, serviceId, userId, name, endedAt, wait, outcome]) => {
    const service = services.find((s) => s.id === serviceId);
    insertEntry.run({
      id, queueId: queueOf[serviceId], userId, name, position: null, priority: service.priority,
      joinedAt: endedAt - wait * MINUTE, status: outcome === 'completed' ? 'served' : 'canceled', endedAt, outcome
    });
  });

  [
    { id: 'n1', userId: 'u1', type: 'queue', text: 'You joined the Degree Audit Review queue at position 4.', time: minutesAgo(12), status: 'viewed' },
    { id: 'n2', userId: 'u1', type: 'queue', text: 'You moved up to position 3 in Degree Audit Review.', time: minutesAgo(6), status: 'sent' },
    { id: 'n3', userId: 'u1', type: 'info', text: 'Graduation Check is closed today. Walk-ins reopen tomorrow at 9:00 AM.', time: minutesAgo(90), status: 'sent' },
    { id: 'n4', userId: 'u2', type: 'queue', text: 'Registration Help now has 4 students waiting.', time: minutesAgo(2), status: 'sent' }
  ].forEach((n) => insertNotification.run(n));

  data.version += 1;
});

// First start with an empty database file: load the demo data.
function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM services').get();
  if (count === 0) resetData();
}

seedIfEmpty();

module.exports = { db, transaction, data, newId, resetData, seedIfEmpty, MINUTE };
