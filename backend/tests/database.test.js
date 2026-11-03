// Tests for the database layer (A4): the schema's validation rules, persistence
// across restarts, transactions, and how database errors reach the API.
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { db, transaction, openDatabase, databaseFile, DEFAULT_FILE } = require('../src/db');
const { constraintError } = require('../src/db/errors');
const { resetData, seedIfEmpty } = require('../src/data/store');
const { count } = require('./helpers');

beforeEach(() => resetData());

const now = Date.now();
const insertUser = (id, email, hash = 'a'.repeat(64), role = 'student') =>
  db.prepare('INSERT INTO user_credentials (user_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, hash, role, now);
const insertService = (id, name, duration = 10, priority = 'low') =>
  db.prepare('INSERT INTO services (service_id, name, description, expected_duration, priority_level, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, 'A description', duration, priority, now);
const insertEntry = (fields) => {
  const row = { entry_id: 'ex', queue_id: 'q1', user_id: null, display_name: 'Test Student', position: 9, priority: 'low', join_time: now, status: 'waiting', ended_at: null, outcome: null, note: '', ...fields };
  db.prepare(`INSERT INTO queue_entries (entry_id, queue_id, user_id, display_name, position, priority, join_time, status, ended_at, outcome, note)
    VALUES (@entry_id, @queue_id, @user_id, @display_name, @position, @priority, @join_time, @status, @ended_at, @outcome, @note)`).run(row);
};

describe('database setup', () => {
  test('creates all the tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    ['user_credentials', 'user_profile', 'services', 'queues', 'queue_entries', 'notifications', 'appointments', 'sessions', 'called_alerts']
      .forEach((table) => expect(tables).toContain(table));
  });

  test('foreign keys are turned on', () => {
    expect(db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
  });

  test('loads the demo data', () => {
    expect(count('user_credentials')).toBe(2);
    expect(count('services')).toBe(5);
    expect(count('queues')).toBe(5);
    expect(db.prepare("SELECT COUNT(*) AS n FROM queue_entries WHERE status = 'waiting'").get().n).toBe(11);
  });

  test('seedIfEmpty does not wipe existing data', () => {
    db.prepare("UPDATE services SET name = 'Renamed' WHERE service_id = 's1'").run();
    seedIfEmpty();
    expect(db.prepare("SELECT name FROM services WHERE service_id = 's1'").get().name).toBe('Renamed');
  });

  test('uses an in-memory database for tests and a file otherwise', () => {
    const saved = { env: process.env.NODE_ENV, file: process.env.DB_FILE };
    delete process.env.DB_FILE;
    expect(databaseFile()).toBe(':memory:');
    process.env.NODE_ENV = 'development';
    expect(databaseFile()).toBe(DEFAULT_FILE);
    process.env.DB_FILE = '/tmp/custom.db';
    expect(databaseFile()).toBe('/tmp/custom.db');
    process.env.NODE_ENV = saved.env;
    if (saved.file === undefined) delete process.env.DB_FILE; else process.env.DB_FILE = saved.file;
  });
});

describe('data persists in the database file', () => {
  test('rows written before a restart are still there after it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queuesmart-'));
    const file = path.join(dir, 'nested', 'test.db');

    const first = openDatabase(file); // also creates the missing folder
    first.prepare("INSERT INTO user_credentials VALUES ('u9', 'kept@uh.edu', ?, 'student', 1)").run('b'.repeat(64));
    first.close(); // "server stops"

    const second = openDatabase(file); // "server starts again"
    expect(second.prepare("SELECT email FROM user_credentials WHERE user_id = 'u9'").get().email).toBe('kept@uh.edu');
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('validation rules in the schema', () => {
  test('email must be unique (ignoring upper/lower case)', () => {
    expect(() => insertUser('u9', 'STUDENT@uh.edu')).toThrow('UNIQUE constraint failed');
  });

  test('email length and shape are checked', () => {
    expect(() => insertUser('u9', `${'a'.repeat(95)}@uh.edu`)).toThrow('CHECK constraint failed');
    expect(() => insertUser('u9', 'not-an-email')).toThrow('CHECK constraint failed');
  });

  test('passwords must be stored as a hash, never a short plain-text password', () => {
    expect(() => insertUser('u9', 'plain@uh.edu', 'Secret123')).toThrow('CHECK constraint failed');
  });

  test('role must be student or admin', () => {
    expect(() => insertUser('u9', 'x@uh.edu', 'a'.repeat(64), 'superuser')).toThrow('CHECK constraint failed');
  });

  test('required fields cannot be missing', () => {
    expect(() => db.prepare("INSERT INTO services (service_id, description, expected_duration, priority_level, created_at) VALUES ('s9', 'd', 10, 'low', 1)").run())
      .toThrow('NOT NULL constraint failed');
  });

  test('profile name length and preferences JSON are checked', () => {
    insertUser('u9', 'new@uh.edu');
    const addProfile = (name, prefs) => db.prepare('INSERT INTO user_profile (user_id, email, full_name, preferences, updated_at) VALUES (?, ?, ?, ?, 1)')
      .run('u9', 'new@uh.edu', name, prefs);
    expect(() => addProfile('A', '{}')).toThrow('CHECK constraint failed');
    expect(() => addProfile('A'.repeat(61), '{}')).toThrow('CHECK constraint failed');
    expect(() => addProfile('Ana Patel', 'not json')).toThrow('CHECK constraint failed');
    addProfile('Ana Patel', '{"contactMethod":"email"}');
    expect(count('user_profile')).toBe(3);
  });

  test('a profile needs an existing user and matching email', () => {
    expect(() => db.prepare("INSERT INTO user_profile VALUES ('ghost', 'ghost@uh.edu', 'Ghost User', NULL, '{}', 1)").run())
      .toThrow('FOREIGN KEY constraint failed');
  });

  test('service name is unique, duration is a whole number from 1 to 240, priority is low/medium/high', () => {
    expect(() => insertService('s9', 'registration help')).toThrow('UNIQUE constraint failed');
    expect(() => insertService('s9', 'New', 0)).toThrow('CHECK constraint failed');
    expect(() => insertService('s9', 'New', 241)).toThrow('CHECK constraint failed');
    expect(() => insertService('s9', 'New', 12.5)).toThrow('CHECK constraint failed');
    expect(() => insertService('s9', 'New', 10, 'urgent')).toThrow('CHECK constraint failed');
    insertService('s9', 'New', 240, 'high');
  });

  test('queue status must be open or closed and each service has only one queue', () => {
    expect(() => db.prepare("UPDATE queues SET status = 'paused' WHERE queue_id = 'q1'").run()).toThrow('CHECK constraint failed');
    expect(() => db.prepare("INSERT INTO queues VALUES ('q9', 's1', 'open', 1)").run()).toThrow('UNIQUE constraint failed');
  });

  test('queue entries: valid status, unique positions, one waiting queue per student', () => {
    expect(() => insertEntry({ status: 'lost' })).toThrow('CHECK constraint failed');
    expect(() => insertEntry({ position: 1 })).toThrow('UNIQUE constraint failed'); // Kevin is #1 in q1
    expect(() => insertEntry({ user_id: 'u1' })).toThrow('UNIQUE constraint failed'); // Jordan is already waiting in q2
    expect(() => insertEntry({ note: 'x'.repeat(201) })).toThrow('CHECK constraint failed');
    expect(() => insertEntry({ queue_id: 'nope' })).toThrow('FOREIGN KEY constraint failed');
  });

  test('a finished entry must have no position and must have an outcome', () => {
    expect(() => insertEntry({ status: 'served' })).toThrow('CHECK constraint failed');
    expect(() => insertEntry({ status: 'served', position: null, ended_at: now })).toThrow('CHECK constraint failed');
    insertEntry({ status: 'served', position: null, ended_at: now, outcome: 'completed' });
  });

  test('notification status must be sent or viewed', () => {
    expect(() => db.prepare("UPDATE notifications SET status = 'deleted' WHERE notification_id = 'n1'").run()).toThrow('CHECK constraint failed');
  });

  test('a student cannot double-book a scheduled appointment', () => {
    const add = (id, status = 'scheduled') => db.prepare("INSERT INTO appointments VALUES (?, 'u1', 's1', 5000, ?, 1)").run(id, status);
    add('a1');
    expect(() => add('a2')).toThrow('UNIQUE constraint failed');
    add('a3', 'canceled'); // a canceled one at the same time is fine
  });

  test('deleting a user also deletes their profile, sessions, and notifications', () => {
    db.prepare("INSERT INTO sessions VALUES ('t1', 'u2', 1)").run();
    db.prepare("DELETE FROM user_credentials WHERE user_id = 'u2'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM user_profile WHERE user_id = 'u2'").get().n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'u2'").get().n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 'u2'").get().n).toBe(0);
  });
});

describe('transactions', () => {
  test('all changes are undone when something fails', () => {
    const addTwo = transaction(() => {
      insertService('s8', 'First');
      insertService('s9', 'registration help'); // duplicate name: fails
    });
    expect(() => addTwo()).toThrow('UNIQUE constraint failed');
    expect(db.prepare("SELECT COUNT(*) AS n FROM services WHERE service_id = 's8'").get().n).toBe(0);
  });

  test('an inner failure can be caught without losing the outer changes', () => {
    const inner = transaction(() => {
      insertService('s8', 'Inner');
      throw new Error('inner failed');
    });
    const outer = transaction(() => {
      insertService('s7', 'Outer');
      expect(() => inner()).toThrow('inner failed');
      return 'done';
    });
    expect(outer()).toBe('done');
    expect(db.prepare("SELECT service_id FROM services WHERE service_id IN ('s7', 's8')").all().map((r) => r.service_id)).toEqual(['s7']);
  });
});

describe('database errors in the API', () => {
  test('constraintError maps SQLite codes to HTTP statuses', () => {
    expect(constraintError({ errcode: 2067 }).status).toBe(409); // UNIQUE
    expect(constraintError({ errcode: 1555 }).status).toBe(409); // PRIMARY KEY
    expect(constraintError({ errcode: 787 }).status).toBe(400); // FOREIGN KEY
    expect(constraintError({ errcode: 275 }).status).toBe(400); // CHECK
    expect(constraintError({ errcode: 1299 }).status).toBe(400); // NOT NULL
    expect(constraintError({ errcode: 19 }).status).toBe(400); // other constraint
    expect(constraintError({ errcode: 1 })).toBeNull(); // not a constraint error
    expect(constraintError(new Error('plain'))).toBeNull();
    expect(constraintError(null)).toBeNull();
  });

  test('a database rule that stops a request becomes a 409, not a 500', async () => {
    const app = require('../src/app');
    const services = require('../src/modules/services');
    const login = await request(app).post('/api/auth/login').send({ email: 'advisor@uh.edu', password: 'Advisor123!' });
    const spy = jest.spyOn(services, 'getService').mockImplementation(() => insertService('s9', 'Registration Help'));
    const res = await request(app).get('/api/services/s1').set('Authorization', `Bearer ${login.body.token}`);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('That would create a duplicate record.');
  });
});
