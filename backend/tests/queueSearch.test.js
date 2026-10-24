const request = require('supertest');
const app = require('../src/app');
const { data, resetData } = require('../src/data/store');
const auth = require('../src/modules/auth');
const queue = require('../src/modules/queue');

let advisorToken;
let studentToken;
beforeEach(() => {
  resetData();
  advisorToken = auth.login({ email: 'advisor@uh.edu', password: 'Advisor123!' }).token;
  studentToken = auth.login({ email: 'student@uh.edu', password: 'Student123!' }).token;
});

describe('advisor queue search - unit tests', () => {
  test('returns full queue with original positions by default', () => {
    const result = queue.searchQueue('s1');
    expect(result.total).toBe(4);
    expect(result.matchCount).toBe(4);
    expect(result.entries.map(e => [e.name, e.position])).toEqual([
      ['Kevin Tran', 1], ['Sofia Alvarez', 2],
      ['Ethan Brooks', 3], ['Grace Okafor', 4]
    ]);
  });

  test('name matching is case-insensitive and trims whitespace', () => {
    expect(queue.searchQueue('s1', { query: '  SOFIA ' }).entries.map(e => e.position)).toEqual([2]);
  });

  test('advisors can search registered student emails', () => {
    const result = queue.searchQueue('s2', { query: 'STUDENT@UH.EDU' });
    expect(result.entries.map(e => e.name)).toEqual(['Jordan Reyes']);
    expect(result.entries[0].position).toBe(3);
  });

  test('priority filtering keeps true queue positions', () => {
    const result = queue.searchQueue('s2', { priority: 'low' });
    expect(result.entries.map(e => e.position)).toEqual([2, 3, 4]);
    expect(result.total).toBe(4);
    expect(result.matchCount).toBe(3);
  });

  test('both filters combine correctly and handle no matches', () => {
    expect(queue.searchQueue('s2', { query: 'Jordan', priority: 'high' }).matchCount).toBe(0);
    expect(queue.searchQueue('s2', { query: 'Jordan', priority: 'low' }).entries[0].position).toBe(3);
    expect(queue.searchQueue('s1', { query: 'nobody' }).entries).toEqual([]);
  });

  test('searching does not change queue order or serve-next', () => {
    const before = data.queues.s2.map(e => e.id);
    queue.searchQueue('s2', { query: 'Jordan', priority: 'low' });
    expect(data.queues.s2.map(e => e.id)).toEqual(before);
    expect(queue.serveNext('s2').id).toBe(before[0]);
  });

  test('rejects invalid priority, non-string query, and excess length', () => {
    expect(() => queue.searchQueue('s1', { priority: 'urgent' })).toThrow('Priority filter');
    expect(() => queue.searchQueue('s1', { query: ['Kevin'] })).toThrow('Search query');
    expect(() => queue.searchQueue('s1', { query: 'x'.repeat(101) })).toThrow('100');
  });

  test('rejects unknown services', () => {
    expect(() => queue.searchQueue('nonexistent')).toThrow();
  });
});

describe('advisor queue search - Supertest API', () => {
  const path = '/api/queues/s2/search';
  test('advisor searches by email and priority through HTTP', async () => {
    const res = await request(app).get(path).query({ q: 'Student@UH.edu', priority: 'low' })
      .set('Authorization', `Bearer ${advisorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 4, matchCount: 1 });
    expect(res.body.entries[0]).toMatchObject({ name: 'Jordan Reyes', position: 3 });
  });

  test('student cannot access advisor search', async () => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated requests return 401', async () => {
    expect((await request(app).get(path)).status).toBe(401);
  });

  test('invalid priorities return field-specific 400 errors', async () => {
    const res = await request(app).get(path).query({ priority: 'urgent' })
      .set('Authorization', `Bearer ${advisorToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('priority');
  });

  test('long search input is rejected without changing data', async () => {
    const before = (await request(app).get('/api/version')).body.version;
    const res = await request(app).get(path).query({ q: 'x'.repeat(101) })
      .set('Authorization', `Bearer ${advisorToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('query');
    const after = (await request(app).get('/api/version')).body.version;
    expect(after).toBe(before);
  });

  test('unknown service returns 404', async () => {
    const res = await request(app).get('/api/queues/unknown/search')
      .set('Authorization', `Bearer ${advisorToken}`);
    expect(res.status).toBe(404);
  });
});
