const { resetData } = require('../src/data/store');
const { db, count, latestNotification } = require('./helpers');
const auth = require('../src/modules/auth');

const newStudent = { name: 'Ana Patel', email: 'ana@uh.edu', password: 'Secret123', role: 'student' };

beforeEach(() => resetData());

describe('register', () => {
  test('creates a student account and hides the password', () => {
    const user = auth.register(newStudent);
    expect(user.email).toBe('ana@uh.edu');
    expect(user.role).toBe('student');
    expect(user.password).toBeUndefined();
    expect(count('user_credentials')).toBe(3);
    expect(count('user_profile')).toBe(3);
  });

  test('stores a hashed password, not the plain text', () => {
    const user = auth.register(newStudent);
    const stored = db.prepare('SELECT password_hash FROM user_credentials WHERE user_id = ?').get(user.id).password_hash;
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
    expect(latestNotification().userId).toBe(user.id);
    expect(latestNotification().text).toMatch('Welcome');
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
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(Date.now() - 1, token);
    expect(auth.getUserByToken(token)).toBeUndefined();
    expect(db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)).toBeUndefined();
  });
});

describe('changePassword database operations', () => {
  test('successfully changes password in the database and allows login with new password', () => {
    const result = auth.changePassword('u1', {
      currentPassword: 'Student123!',
      newPassword: 'NewPassword99!',
      confirmPassword: 'NewPassword99!'
    });
    expect(result.success).toBe(true);

    expect(() => auth.login({ email: 'student@uh.edu', password: 'Student123!' })).toThrow('don’t match');

    const loginRes = auth.login({ email: 'student@uh.edu', password: 'NewPassword99!' });
    expect(loginRes.token).toBeDefined();
    expect(loginRes.user.id).toBe('u1');
  });

  test('rejects incorrect current password', () => {
    expect(() => auth.changePassword('u1', {
      currentPassword: 'WrongPassword1!',
      newPassword: 'NewPassword99!',
      confirmPassword: 'NewPassword99!'
    })).toThrow('Current password does not match.');
  });

  test('rejects when new password matches old password', () => {
    expect(() => auth.changePassword('u1', {
      currentPassword: 'Student123!',
      newPassword: 'Student123!',
      confirmPassword: 'Student123!'
    })).toThrow('New password must be different from current password.');
  });

  test('rejects mismatched confirm password', () => {
    expect(() => auth.changePassword('u1', {
      currentPassword: 'Student123!',
      newPassword: 'NewPassword99!',
      confirmPassword: 'DifferentPassword99!'
    })).toThrow('Confirm password must match the new password.');
  });
});