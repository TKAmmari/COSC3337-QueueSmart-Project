const { data, resetData } = require('../src/data/store');
const auth = require('../src/modules/auth');

const newStudent = { name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123', role: 'student' };

beforeEach(() => resetData());

describe('register', () => {
  test('creates a student account and hides the password', () => {
    const user = auth.register(newStudent);
    expect(user.email).toBe('ana@uh.edu');
    expect(user.role).toBe('student');
    expect(user.password).toBeUndefined();
    expect(data.users).toHaveLength(3);
  });

  test('stores a hashed password, not the plain text', () => {
    const user = auth.register(newStudent);
    const stored = data.users.find((u) => u.id === user.id).password;
    expect(stored).not.toBe('Secret123');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(auth.login({ email: 'ana@uh.edu', password: 'Secret123' }).user.id).toBe(user.id);
  });

  test('an advisor account needs the advisor access code', () => {
    expect(() => auth.register({ ...newStudent, role: 'admin' })).toThrow('advisor access code');
    expect(() => auth.register({ ...newStudent, role: 'admin', advisorCode: 'guess' })).toThrow('advisor access code');
    const user = auth.register({ ...newStudent, role: 'admin', advisorCode: auth.ADVISOR_CODE });
    expect(user.role).toBe('admin');
  });

  test('saves the email in lowercase and defaults the role to student', () => {
    const user = auth.register({ ...newStudent, email: 'Ana@UH.edu', role: undefined });
    expect(user.email).toBe('ana@uh.edu');
    expect(user.role).toBe('student');
  });

  test('sends a welcome notification', () => {
    const user = auth.register(newStudent);
    expect(data.notifications[0].userId).toBe(user.id);
    expect(data.notifications[0].text).toMatch('Welcome');
  });

  test('rejects an email that is already used', () => {
    expect(() => auth.register({ ...newStudent, email: 'student@uh.edu' })).toThrow('already exists');
  });

  test('requires all fields', () => {
    expect(() => auth.register({})).toThrow('Some fields are invalid.');
  });

  test('checks the name length', () => {
    expect(() => auth.register({ ...newStudent, name: 'A' })).toThrow('at least 2 characters');
    expect(() => auth.register({ ...newStudent, name: 'A'.repeat(61) })).toThrow('60 characters or fewer');
  });

  test('only allows university emails', () => {
    expect(() => auth.register({ ...newStudent, email: 'ana@gmail.com' })).toThrow('university email');
  });

  test('checks password strength', () => {
    expect(() => auth.register({ ...newStudent, password: 'short1A' })).toThrow('at least 8 characters');
    expect(() => auth.register({ ...newStudent, password: 'alllowercase1' })).toThrow('uppercase letter');
  });

  test('only allows the student and admin roles', () => {
    expect(() => auth.register({ ...newStudent, role: 'superuser' })).toThrow('Role must be one of');
  });
});

describe('login and logout', () => {
  test('returns a token for the right password', () => {
    const result = auth.login({ email: 'student@uh.edu', password: 'Student123!' });
    expect(result.token).toBeTruthy();
    expect(result.user.name).toBe('Jordan Reyes');
    expect(auth.getUserByToken(result.token).id).toBe('u1');
  });

  test('email is not case sensitive', () => {
    expect(auth.login({ email: ' STUDENT@uh.edu ', password: 'Student123!' }).user.id).toBe('u1');
  });

  test('rejects a wrong password or unknown email with 401', () => {
    try {
      auth.login({ email: 'student@uh.edu', password: 'wrong' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(401);
    }
    expect(() => auth.login({ email: 'nobody@uh.edu', password: 'Student123!' })).toThrow('don’t match');
  });

  test('requires email and password', () => {
    expect(() => auth.login({})).toThrow('Some fields are invalid.');
  });

  test('logout ends the session', () => {
    const { token } = auth.login({ email: 'student@uh.edu', password: 'Student123!' });
    auth.logout(token);
    expect(auth.getUserByToken(token)).toBeUndefined();
  });

  test('sessions expire', () => {
    const { token } = auth.login({ email: 'student@uh.edu', password: 'Student123!' });
    expect(auth.getUserByToken(token).id).toBe('u1');
    data.sessions[token].expiresAt = Date.now() - 1;
    expect(auth.getUserByToken(token)).toBeUndefined();
    expect(data.sessions[token]).toBeUndefined();
  });
});
