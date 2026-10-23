// These tests send real HTTP requests to the Express app with supertest.
const request = require('supertest');
const app = require('../src/app');
const { resetData } = require('../src/data/store');

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

let studentToken;
let advisorToken;

beforeEach(async () => {
  resetData();
  studentToken = await loginAs('student@uh.edu', 'Student123!');
  advisorToken = await loginAs('advisor@uh.edu', 'Advisor123!');
});

describe('auth routes', () => {
  test('register, then log in and get /me', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123', role: 'student' });
    expect(reg.status).toBe(201);

    const token = await loginAs('ana@uh.edu', 'Secret123');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.name).toBe('Ana Patel');
  });

  test('bad registration returns 400 with a message per field', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@gmail.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['name', 'email', 'password']);
  });

  test('wrong password returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'student@uh.edu', password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('logout makes the token stop working', async () => {
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${studentToken}`);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${studentToken}`);
    expect(me.status).toBe(401);
  });

  test('users can look up themselves; advisors can look up anyone', async () => {
    const own = await request(app).get('/api/users/u1').set('Authorization', `Bearer ${studentToken}`);
    expect(own.status).toBe(200);
    const other = await request(app).get('/api/users/u2').set('Authorization', `Bearer ${studentToken}`);
    expect(other.status).toBe(403);
    const missing = await request(app).get('/api/users/zzz').set('Authorization', `Bearer ${advisorToken}`);
    expect(missing.status).toBe(404);
  });
});

describe('permissions', () => {
  test('you have to be signed in', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(401);
  });

  test('students cannot use advisor routes', async () => {
    const res = await request(app).post('/api/queues/s1/serve').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    const stats = await request(app).get('/api/stats').set('Authorization', `Bearer ${studentToken}`);
    expect(stats.status).toBe(403);
  });

  test('advisors cannot join a queue', async () => {
    const res = await request(app).post('/api/queues/s1/join').set('Authorization', `Bearer ${advisorToken}`).send({});
    expect(res.status).toBe(403);
  });
});

describe('services routes', () => {
  test('advisor creates, edits, and closes a service', async () => {
    const auth = { Authorization: `Bearer ${advisorToken}` };
    const created = await request(app).post('/api/services').set('Authorization', auth.Authorization)
      .send({ name: 'Study Abroad', description: 'Credit for courses abroad.', duration: 20, priority: 'low' });
    expect(created.status).toBe(201);
    const id = created.body.service.id;

    const one = await request(app).get(`/api/services/${id}`).set('Authorization', auth.Authorization);
    expect(one.body.service.name).toBe('Study Abroad');

    const edited = await request(app).put(`/api/services/${id}`).set('Authorization', auth.Authorization)
      .send({ name: 'Study Abroad', description: 'Updated.', duration: 30, priority: 'low' });
    expect(edited.body.service.duration).toBe(30);

    const closed = await request(app).patch(`/api/services/${id}/status`).set('Authorization', auth.Authorization).send({ open: false });
    expect(closed.body.service.open).toBe(false);
  });

  test('bad service data returns 400', async () => {
    const res = await request(app).post('/api/services').set('Authorization', `Bearer ${advisorToken}`)
      .send({ name: 'X', description: 'Y', duration: 'ten', priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('duration');
  });

  test('an advisor changes advisors on duty and the estimate follows', async () => {
    const res = await request(app).patch('/api/services/s2/advisors').set('Authorization', `Bearer ${advisorToken}`).send({ advisors: 3 });
    expect(res.status).toBe(200);
    expect(res.body.service.advisors).toBe(3);
    const est = await request(app).get('/api/queues/s2/estimate?position=4').set('Authorization', `Bearer ${studentToken}`);
    expect(est.body.estimatedWait).toBe(15); // 3 ahead x 15 min / 3 advisors
  });

  test('students can’t change advisors on duty; bad numbers return 400', async () => {
    const asStudent = await request(app).patch('/api/services/s2/advisors').set('Authorization', `Bearer ${studentToken}`).send({ advisors: 3 });
    expect(asStudent.status).toBe(403);
    const bad = await request(app).patch('/api/services/s2/advisors').set('Authorization', `Bearer ${advisorToken}`).send({ advisors: '3' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].field).toBe('advisors');
  });
});

describe('queue routes', () => {
  test('student joins, advisor serves, student gets notified', async () => {
    const student = { Authorization: `Bearer ${studentToken}` };
    const advisor = { Authorization: `Bearer ${advisorToken}` };

    await request(app).post('/api/queues/leave').set(student);
    const preview = await request(app).get('/api/queues/s3/projection').set(student);
    expect(preview.body.position).toBe(2);

    const joined = await request(app).post('/api/queues/s3/join').set(student).send({ note: 'Switching to CS' });
    expect(joined.status).toBe(201);
    expect(joined.body.position).toBe(2);

    const me = await request(app).get('/api/queues/me').set(student);
    expect(me.body.current.serviceId).toBe('s3');

    const estimate = await request(app).get('/api/queues/s3/estimate?position=2').set(student);
    expect(estimate.body.estimatedWait).toBe(25);

    const view = await request(app).get('/api/queues/s3').set(student);
    expect(view.body.entries[0].name).toBeNull(); // other students' names are hidden

    await request(app).post('/api/queues/s3/serve').set(advisor);
    const served = await request(app).post('/api/queues/s3/serve').set(advisor);
    expect(served.body.served.name).toBe('Jordan Reyes');

    const called = await request(app).get('/api/queues/me/called').set(student);
    expect(called.body.called.service).toBe('Change of Major');
    await request(app).delete('/api/queues/me/called').set(student);

    const notes = await request(app).get('/api/notifications').set(student);
    expect(notes.body.notifications[0].text).toMatch("It's your turn");
    const read = await request(app).post('/api/notifications/read-all').set(student);
    expect(read.body.updated).toBeGreaterThan(0);

    const hist = await request(app).get('/api/history?outcome=completed').set(student);
    expect(hist.body.history[0].service).toBe('Change of Major');
  });

  test('advisor moves, re-prioritizes, and removes students', async () => {
    const advisor = { Authorization: `Bearer ${advisorToken}` };
    const moved = await request(app).post('/api/queues/s1/entries/e12/move').set(advisor).send({ direction: -1 });
    expect(moved.body.entries[0].id).toBe('e12');

    const prio = await request(app).patch('/api/queues/s1/entries/e14/priority').set(advisor).send({ priority: 'high' });
    expect(prio.body.entries[0].id).toBe('e14');

    const removed = await request(app).delete('/api/queues/s1/entries/e13').set(advisor).send({ outcome: 'no-show' });
    expect(removed.body.removed.outcome).toBe('no-show');
  });

  test('unknown service returns 404', async () => {
    const res = await request(app).get('/api/queues/zzz').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });
});

describe('appointment and stats routes', () => {
  test('book, change, and cancel', async () => {
    const student = { Authorization: `Bearer ${studentToken}` };
    const booked = await request(app).post('/api/appointments').set(student).send({ serviceId: 's2', date: '2099-01-05', time: '13:00' });
    expect(booked.status).toBe(201);
    const id = booked.body.appointment.id;

    const list = await request(app).get('/api/appointments').set(student);
    expect(list.body.appointments).toHaveLength(1);

    const changed = await request(app).put(`/api/appointments/${id}`).set(student).send({ date: '2099-01-06', time: '09:00' });
    expect(changed.status).toBe(200);

    const canceled = await request(app).post(`/api/appointments/${id}/cancel`).set(student);
    expect(canceled.body.appointment.status).toBe('canceled');
  });

  test('advisor stats', async () => {
    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${advisorToken}`);
    expect(res.body.stats.waiting).toBe(11);
  });
});

describe('other app behavior', () => {
  test('version goes up after a change', async () => {
    const before = (await request(app).get('/api/version')).body.version;
    await request(app).post('/api/notifications/read-all').set('Authorization', `Bearer ${studentToken}`);
    const after = (await request(app).get('/api/version')).body.version;
    expect(after).toBeGreaterThan(before);
  });

  test('a failed change doesn’t bump the version', async () => {
    const before = (await request(app).get('/api/version')).body.version;
    const res = await request(app).post('/api/auth/login').send({ email: 'student@uh.edu', password: 'nope' });
    expect(res.status).toBe(401);
    const after = (await request(app).get('/api/version')).body.version;
    expect(after).toBe(before);
  });

  test('registering as an advisor without the code returns 403', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123', role: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.error.details[0].field).toBe('advisorCode');
  });

  test('demo reset works', async () => {
    const res = await request(app).post('/api/demo/reset');
    expect(res.body.reset).toBe(true);
  });

  test('demo reset is turned off in production', async () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/api/demo/reset');
    process.env.NODE_ENV = env;
    expect(res.status).toBe(403);
  });

  test('unknown API route returns 404', async () => {
    const res = await request(app).get('/api/nothing-here');
    expect(res.status).toBe(404);
  });

  test('invalid JSON returns 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });

  test('serves the front end', async () => {
    const res = await request(app).get('/login.html');
    expect(res.status).toBe(200);
    expect(res.text).toMatch('Sign in');
  });

  test('unexpected errors return 500', async () => {
    const { data } = require('../src/data/store');
    const realError = console.error;
    console.error = () => {}; // keep the test output clean
    data.services = null;
    const res = await request(app).get('/api/services/s1').set('Authorization', `Bearer ${advisorToken}`);
    console.error = realError;
    expect(res.status).toBe(500);
  });
});
