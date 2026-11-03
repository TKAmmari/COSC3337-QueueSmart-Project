// User profile (user_profile table): module functions and the /api/users/me/profile routes.
const request = require('supertest');
const app = require('../src/app');
const { resetData } = require('../src/data/store');
const auth = require('../src/modules/auth');
const queue = require('../src/modules/queue');
const { db } = require('./helpers');

beforeEach(() => resetData());

describe('profile module', () => {
  test('a new account gets an empty profile with the default preference', () => {
    const user = auth.register({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123' });
    expect(auth.getProfile(user.id)).toMatchObject({
      name: 'Ana Patel', email: 'ana@uh.edu', role: 'student', phone: '', preferences: { contactMethod: 'in-app' }
    });
  });

  test('reads the seeded profile', () => {
    expect(auth.getProfile('u1')).toMatchObject({ name: 'Jordan Reyes', phone: '713-555-0142', preferences: { contactMethod: 'email' } });
    expect(() => auth.getProfile('nobody')).toThrow('User not found.');
  });

  test('saves name, phone, and preferences to the database', () => {
    const profile = auth.updateProfile('u1', { name: '  Jordan R. Reyes ', phone: '(713) 555-0199', preferences: { contactMethod: 'phone' } });
    expect(profile).toMatchObject({ name: 'Jordan R. Reyes', phone: '(713) 555-0199', preferences: { contactMethod: 'phone' } });
    const row = db.prepare("SELECT full_name, phone, preferences FROM user_profile WHERE user_id = 'u1'").get();
    expect(row.full_name).toBe('Jordan R. Reyes');
    expect(JSON.parse(row.preferences)).toEqual({ contactMethod: 'phone' });
    expect(auth.getUser('u1').name).toBe('Jordan R. Reyes'); // used everywhere else too
  });

  test('the new name also shows in the queue the student is waiting in', () => {
    auth.updateProfile('u1', { name: 'Jordan Reyes-Diaz' });
    expect(queue.getQueue('s2')[2].name).toBe('Jordan Reyes-Diaz');
  });

  test('phone is optional and keeps the current preference when none is sent', () => {
    const profile = auth.updateProfile('u1', { name: 'Jordan Reyes', phone: '' });
    expect(profile.phone).toBe('');
    expect(profile.preferences.contactMethod).toBe('email');
  });

  test('checks every field', () => {
    expect(() => auth.updateProfile('u1', {})).toThrow('Full name is required.');
    expect(() => auth.updateProfile('u1', { name: 'J' })).toThrow('at least 2 characters');
    expect(() => auth.updateProfile('u1', { name: 'J'.repeat(61) })).toThrow('60 characters or fewer');
    expect(() => auth.updateProfile('u1', { name: 'Jordan', phone: '123' })).toThrow('at least 7 characters');
    expect(() => auth.updateProfile('u1', { name: 'Jordan', phone: 'call me maybe' })).toThrow('Phone can only have numbers');
    expect(() => auth.updateProfile('u1', { name: 'Jordan', phone: 7135550199 })).toThrow('must be text');
    expect(() => auth.updateProfile('u1', { name: 'Jordan', preferences: { contactMethod: 'fax' } })).toThrow('must be one of');
    expect(() => auth.updateProfile('u2', { name: 'Maria', preferences: { contactMethod: 'phone' } })).toThrow('Add a phone number');
  });

  test('a stored profile with broken preferences still loads', () => {
    db.exec('PRAGMA ignore_check_constraints = ON');
    db.prepare("UPDATE user_profile SET preferences = 'oops' WHERE user_id = 'u2'").run();
    db.exec('PRAGMA ignore_check_constraints = OFF');
    expect(auth.getProfile('u2').preferences).toEqual({ contactMethod: 'in-app' });
  });
});

describe('profile routes', () => {
  let token;
  beforeEach(async () => {
    token = (await request(app).post('/api/auth/login').send({ email: 'student@uh.edu', password: 'Student123!' })).body.token;
  });

  test('GET returns the signed-in user’s profile', async () => {
    const res = await request(app).get('/api/users/me/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ id: 'u1', email: 'student@uh.edu', phone: '713-555-0142' });
  });

  test('PUT saves changes, and they are still there on the next request', async () => {
    const put = await request(app).put('/api/users/me/profile').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Reyes', phone: '832-555-0100', preferences: { contactMethod: 'in-app' } });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/users/me/profile').set('Authorization', `Bearer ${token}`);
    expect(get.body.profile).toMatchObject({ phone: '832-555-0100', preferences: { contactMethod: 'in-app' } });
  });

  test('PUT with bad fields returns 400 with field details', async () => {
    const res = await request(app).put('/api/users/me/profile').set('Authorization', `Bearer ${token}`).send({ name: '', phone: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['name', 'phone']);
  });

  test('needs a signed-in user', async () => {
    expect((await request(app).get('/api/users/me/profile')).status).toBe(401);
    expect((await request(app).put('/api/users/me/profile').send({ name: 'Hacker' })).status).toBe(401);
  });
});
