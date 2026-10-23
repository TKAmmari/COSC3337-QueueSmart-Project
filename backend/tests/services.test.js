const { data, resetData } = require('../src/data/store');
const services = require('../src/modules/services');
const { estimateWait } = require('../src/modules/waitTime');

const newService = { name: 'Transfer Credit Review', description: 'Check how transfer courses count.', duration: 20, priority: 'medium' };

beforeEach(() => resetData());

describe('service management', () => {
  test('lists the starting services', () => {
    expect(services.listServices()).toHaveLength(5);
  });

  test('gets one service, or 404 if it does not exist', () => {
    expect(services.getService('s3').name).toBe('Change of Major');
    expect(() => services.getService('nope')).toThrow('Service not found.');
  });

  test('creates an open service with an empty queue', () => {
    const service = services.createService(newService);
    expect(service.open).toBe(true);
    expect(service.advisors).toBe(1);
    expect(data.queues[service.id]).toEqual([]);
  });

  test('requires every field', () => {
    expect(() => services.createService({})).toThrow('Some fields are invalid.');
  });

  test('checks lengths, duration range, and priority', () => {
    expect(() => services.createService({ ...newService, name: 'x'.repeat(101) })).toThrow('100 characters or fewer');
    expect(() => services.createService({ ...newService, description: 'x'.repeat(501) })).toThrow('500 characters or fewer');
    expect(() => services.createService({ ...newService, duration: 0 })).toThrow('at least 1');
    expect(() => services.createService({ ...newService, duration: '20' })).toThrow('whole number');
    expect(() => services.createService({ ...newService, priority: 'urgent' })).toThrow('Priority level must be one of');
  });

  test('does not allow two services with the same name', () => {
    expect(() => services.createService({ ...newService, name: 'registration help' })).toThrow('already exists');
  });

  test('updates a service but keeps its id and open status', () => {
    const updated = services.updateService('s1', { ...newService, name: 'Registration Help', duration: 12 });
    expect(updated.id).toBe('s1');
    expect(updated.duration).toBe(12);
    expect(updated.open).toBe(true);
  });

  test('closing a service tells the students in line', () => {
    services.setServiceOpen('s2', { open: false });
    expect(services.getService('s2').open).toBe(false);
    expect(data.notifications[0].text).toMatch('closed to new students');
  });

  test('open must be true or false', () => {
    expect(() => services.setServiceOpen('s2', { open: 'no' })).toThrow('true or false');
  });
});

describe('advisors on duty', () => {
  const jordanMessages = () => data.notifications.filter((n) => n.userId === 'u1').map((n) => n.text);

  test('changes the advisor count and the wait estimate', () => {
    // Jordan is #3 in Degree Audit Review (15 min sessions): 2 ahead x 15 min / 1 advisor = 30 min
    const service = services.setAdvisors('s2', { advisors: 2 });
    expect(service.advisors).toBe(2);
    expect(estimateWait(service, 3)).toBe(15);
  });

  test('tells students in line their new estimated wait', () => {
    services.setAdvisors('s2', { advisors: 2 });
    expect(jordanMessages()[0]).toBe('Degree Audit Review now has 2 advisors on duty. Your estimated wait is now about 15 min.');
  });

  test('no change, no notifications', () => {
    const count = data.notifications.length;
    services.setAdvisors('s2', { advisors: 1 });
    expect(data.notifications).toHaveLength(count);
  });

  test('checks the number', () => {
    expect(() => services.setAdvisors('s2', {})).toThrow('Advisors on duty is required.');
    expect(() => services.setAdvisors('s2', { advisors: 0 })).toThrow('at least 1');
    expect(() => services.setAdvisors('s2', { advisors: 11 })).toThrow('at most 10');
    expect(() => services.setAdvisors('s2', { advisors: 1.5 })).toThrow('whole number');
    expect(() => services.setAdvisors('nope', { advisors: 2 })).toThrow('Service not found.');
  });
});
