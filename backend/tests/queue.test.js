const { data, resetData } = require('../src/data/store');
const queue = require('../src/modules/queue');
const auth = require('../src/modules/auth');
const { estimateWait } = require('../src/modules/waitTime');

let student; // a new student who is not in any queue yet
const jordan = () => auth.getUser('u1'); // seeded student, #3 in Degree Audit Review
const names = (serviceId) => data.queues[serviceId].map((e) => e.name);
const messagesFor = (userId) => data.notifications.filter((n) => n.userId === userId).map((n) => n.text);

beforeEach(() => {
  resetData();
  student = auth.getUser(auth.register({ name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123' }).id);
});

describe('wait time', () => {
  test('is people ahead x session length / advisors', () => {
    expect(estimateWait({ duration: 15, advisors: 1 }, 1)).toBe(0);
    expect(estimateWait({ duration: 15, advisors: 1 }, 4)).toBe(45);
    expect(estimateWait({ duration: 10, advisors: 2 }, 5)).toBe(20);
  });

  test('rejects a bad position', () => {
    expect(() => estimateWait({ duration: 10, advisors: 1 }, 0)).toThrow('Position must be');
    expect(() => estimateWait({ duration: 10, advisors: 1 }, 'abc')).toThrow('Position must be');
  });
});

describe('queue order', () => {
  test('sorts by priority, then by who joined first', () => {
    const q = [
      { name: 'C', priority: 'low', joinedAt: 1 },
      { name: 'B', priority: 'high', joinedAt: 5 },
      { name: 'A', priority: 'high', joinedAt: 2 }
    ];
    queue.sortQueue(q);
    expect(q.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  test('a new entry goes after everyone with the same or higher priority', () => {
    const q = [{ priority: 'high' }, { priority: 'medium' }, { priority: 'low' }];
    expect(queue.insertPosition(q, 'medium')).toBe(2);
    expect(queue.insertPosition(q, 'high')).toBe(1);
  });
});

describe('students', () => {
  test('join puts the student in line and returns position and wait', () => {
    const result = queue.joinQueue(student, 's1', { note: 'Need to add a class' });
    expect(result.position).toBe(5);
    expect(result.estimatedWait).toBe(20); // 4 ahead x 10 min / 2 advisors
    expect(names('s1')).toContain('Ana Patel');
    expect(messagesFor(student.id)).toContain('You joined the Registration Help queue at position 5.');
  });

  test('joining at #1 or #2 also sends "Almost ready"', () => {
    queue.joinQueue(student, 's3');
    expect(messagesFor(student.id)[0]).toMatch('Almost ready: you are now #2');
  });

  test('cannot join a closed service', () => {
    expect(() => queue.joinQueue(student, 's5')).toThrow('closed');
  });

  test('cannot be in two queues at once', () => {
    queue.joinQueue(student, 's1');
    expect(() => queue.joinQueue(student, 's3')).toThrow('already in a queue');
  });

  test('note can be at most 200 characters', () => {
    expect(() => queue.joinQueue(student, 's1', { note: 'x'.repeat(201) })).toThrow('200 characters or fewer');
  });

  test('findEntry shows position, total, and wait', () => {
    const found = queue.findEntry('u1');
    expect(found.serviceId).toBe('s2');
    expect(found.position).toBe(3);
    expect(found.total).toBe(4);
    expect(found.estimatedWait).toBe(30);
    expect(queue.findEntry(student.id)).toBeNull();
  });

  test('previewJoin shows where a new student would land', () => {
    expect(queue.previewJoin('s4')).toEqual({ serviceId: 's4', position: 3, estimatedWait: 30 });
  });

  test('leaving removes the student and saves it in history', () => {
    queue.leaveQueue('u1');
    expect(queue.findEntry('u1')).toBeNull();
    expect(data.history[0].outcome).toBe('left queue');
    expect(names('s2')).toEqual(['Marcus Lee', 'Aisha Khan', 'Daniel Kim']);
  });

  test('cannot leave if not in a queue', () => {
    expect(() => queue.leaveQueue(student.id)).toThrow('not in a queue');
  });

  test('students only see their own name in a queue', () => {
    const seen = queue.viewQueue('s2', jordan());
    expect(seen.map((e) => e.name)).toEqual([null, null, 'Jordan Reyes', null]);
    const advisorView = queue.viewQueue('s2', { role: 'admin' });
    expect(advisorView[0].name).toBe('Marcus Lee');
  });
});

describe('advisors', () => {
  test('serve next takes the first student in line', () => {
    const served = queue.serveNext('s1');
    expect(served.name).toBe('Kevin Tran');
    expect(names('s1')).toHaveLength(3);
    expect(data.servedLog[0].outcome).toBe('completed');
  });

  test('serve next on an empty queue returns null', () => {
    expect(queue.serveNext('s5')).toBeNull();
  });

  test('students are notified as they move up and when served', () => {
    queue.serveNext('s2'); // Jordan goes from #3 to #2
    expect(messagesFor('u1')[0]).toMatch('Almost ready: you are now #2');
    queue.serveNext('s2'); // #2 to #1
    expect(messagesFor('u1')[0]).toBe('You moved up to position 1 in Degree Audit Review.');
    queue.serveNext('s2'); // Jordan is served
    expect(messagesFor('u1')[0]).toMatch("It's your turn");
    expect(queue.getCalled('u1').service).toBe('Degree Audit Review');
    expect(data.history[0].outcome).toBe('completed');
  });

  test('the "your turn" message can be dismissed', () => {
    data.called.u1 = { service: 'Degree Audit Review', at: Date.now() };
    queue.dismissCalled('u1');
    expect(queue.getCalled('u1')).toBeNull();
  });

  test('remove a student as a no-show', () => {
    const removed = queue.removeEntry('s2', 'e23', { outcome: 'no-show' });
    expect(removed.outcome).toBe('no-show');
    expect(data.history[0].outcome).toBe('no-show');
    expect(messagesFor('u1')[0]).toMatch('no-show');
  });

  test('remove a student (saved as canceled)', () => {
    queue.removeEntry('s2', 'e23');
    expect(data.history[0].outcome).toBe('canceled');
    expect(() => queue.removeEntry('s2', 'e23')).toThrow('not in this queue');
    expect(() => queue.removeEntry('s2', 'e24', { outcome: 'banned' })).toThrow('Outcome must be one of');
  });

  test('move a student up or down one place', () => {
    queue.moveEntry('s1', 'e12', { direction: -1 });
    expect(names('s1').slice(0, 2)).toEqual(['Sofia Alvarez', 'Kevin Tran']);
    expect(() => queue.moveEntry('s1', 'e12', { direction: -1 })).toThrow('can’t move');
    expect(() => queue.moveEntry('s1', 'e12', { direction: 5 })).toThrow('Direction must be one of');
  });

  test('changing priority re-sorts the queue and tells a student who moved back', () => {
    queue.setPriority('s2', 'e24', { priority: 'high' });
    expect(names('s2')).toEqual(['Marcus Lee', 'Daniel Kim', 'Aisha Khan', 'Jordan Reyes']);
    expect(messagesFor('u1')[0]).toMatch('time-sensitive case');
    expect(() => queue.setPriority('s2', 'e24', { priority: 'urgent' })).toThrow('Priority must be one of');
  });
});
