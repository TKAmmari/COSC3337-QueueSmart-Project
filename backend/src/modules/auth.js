// Authentication module: register, log in, log out, and look up users.
// Roles: 'student' (User) and 'admin' (Advisor / Administrator).
// Tables: user_credentials (email, password hash, role), user_profile (name, contact info,
// preferences), and sessions (login tokens).
const crypto = require('crypto');
const { db, newId, transaction } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { notify } = require('./notifications');
const { hashPassword, verifyPassword } = require('../utils/password');

// Creating an advisor account needs this code, so students can't make themselves advisors.
// Set ADVISOR_CODE on the server; the fallback is only for the class demo.
const ADVISOR_CODE = process.env.ADVISOR_CODE || 'ADVISE-UH';
const SESSION_HOURS = 8;
const CONTACT_METHODS = ['in-app', 'email', 'phone'];

const nameRule = { label: 'Full name', required: true, type: 'string', minLength: 2, maxLength: 60 };

const registerRules = {
  name: nameRule,
  email: {
    label: 'Email', required: true, type: 'string', maxLength: 100,
    pattern: /^[^\s@]+@(uh\.edu|cougarnet\.uh\.edu)$/i,
    patternMessage: 'Use your university email ending in @uh.edu or @cougarnet.uh.edu.'
  },
  password: {
    label: 'Password', required: true, type: 'string', minLength: 8, maxLength: 64,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    patternMessage: 'Password needs an uppercase letter, a lowercase letter, and a number.'
  },
  role: { label: 'Role', type: 'string', oneOf: ['student', 'admin'] }
};

const loginRules = {
  email: { label: 'Email', required: true, type: 'string', maxLength: 100 },
  password: { label: 'Password', required: true, type: 'string', maxLength: 64 }
};

const profileRules = {
  name: nameRule,
  phone: {
    label: 'Phone', type: 'string', minLength: 7, maxLength: 20,
    pattern: /^[0-9+()\-.\s]+$/, patternMessage: 'Phone can only have numbers, spaces, and + ( ) - .'
  },
  contactMethod: { label: 'Preferred contact method', type: 'string', oneOf: CONTACT_METHODS }
};

// One query that joins the login row with the profile row.
const USER_SELECT = `
  SELECT c.user_id AS id, p.full_name AS name, c.email, c.role, c.password_hash AS password,
         p.phone, p.preferences, p.updated_at
  FROM user_credentials c JOIN user_profile p ON p.user_id = c.user_id`;

// The user info we send to the front end (never the password).
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function findUserByEmail(email) {
  return db.prepare(`${USER_SELECT} WHERE c.email = ?`).get(String(email).trim().toLowerCase());
}

function getUser(id) {
  return db.prepare(`${USER_SELECT} WHERE c.user_id = ?`).get(id);
}

const createUser = transaction((user) => {
  const now = Date.now();
  db.prepare('INSERT INTO user_credentials (user_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.email, user.password, user.role, now);
  db.prepare("INSERT INTO user_profile (user_id, email, full_name, phone, preferences, updated_at) VALUES (?, ?, ?, NULL, '{}', ?)")
    .run(user.id, user.email, user.name, now);
  notify(user.id, 'Welcome to QueueSmart. Your university email has been verified.', 'info');
});

function register(body) {
  validate(body, registerRules);
  if (body.role === 'admin' && body.advisorCode !== ADVISOR_CODE) {
    const message = 'Enter a valid advisor access code to create an advisor account.';
    throw new ApiError(403, message, [{ field: 'advisorCode', message }]);
  }
  if (findUserByEmail(body.email)) {
    throw new ApiError(409, 'An account with this email already exists. Sign in instead.');
  }
  const user = {
    id: newId('u'),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    password: hashPassword(body.password),
    role: body.role || 'student'
  };
  createUser(user);
  return publicUser(user);
}

function login(body) {
  validate(body, loginRules);
  const user = findUserByEmail(body.email);
  // Same message either way, so nobody can tell which emails have accounts.
  if (!user || !verifyPassword(body.password, user.password)) {
    throw new ApiError(401, 'That email and password don’t match an account. Check both and try again.');
  }
  const token = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  return { token, user: publicUser(user) };
}

function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Expired sessions are removed the next time someone uses them.
function getUserByToken(token) {
  if (!token) return undefined;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return undefined;
  if (Date.now() >= session.expires_at) {
    logout(token);
    return undefined;
  }
  return getUser(session.user_id);
}

// ----- user profile (GET / PUT /api/users/me/profile) -----

function toProfile(user) {
  let preferences = {};
  try { preferences = JSON.parse(user.preferences || '{}'); } catch (err) { preferences = {}; }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    preferences: { contactMethod: preferences.contactMethod || 'in-app' },
    updatedAt: user.updated_at
  };
}

function getProfile(userId) {
  const user = getUser(userId);
  if (!user) throw new ApiError(404, 'User not found.');
  return toProfile(user);
}

const saveProfile = transaction((userId, name, phone, preferences) => {
  db.prepare('UPDATE user_profile SET full_name = ?, phone = ?, preferences = ?, updated_at = ? WHERE user_id = ?')
    .run(name, phone, JSON.stringify(preferences), Date.now(), userId);
  // Keep the name advisors see in the queue in sync.
  db.prepare("UPDATE queue_entries SET display_name = ? WHERE user_id = ? AND status = 'waiting'").run(name, userId);
});

function updateProfile(userId, body = {}) {
  const current = getProfile(userId); // 404 if the user doesn't exist
  const input = { name: body.name, phone: body.phone, contactMethod: body.preferences && body.preferences.contactMethod };
  validate(input, profileRules);
  const phone = input.phone ? input.phone.trim() : null;
  const contactMethod = input.contactMethod || current.preferences.contactMethod;
  if (contactMethod === 'phone' && !phone) {
    const message = 'Add a phone number to be contacted by phone.';
    throw new ApiError(400, message, [{ field: 'phone', message }]);
  }
  saveProfile(userId, input.name.trim(), phone, { contactMethod });
  return getProfile(userId);
}

// Change password (A4: updates user_credentials table with a new scrypt hash)
const changePassword = transaction((userId, body = {}) => {
  validate(body, {
    currentPassword: { label: 'Current password', required: true, type: 'string' },
    newPassword: {
      label: 'New password', required: true, type: 'string', minLength: 8, maxLength: 64,
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      patternMessage: 'New password needs an uppercase letter, a lowercase letter, and a number.'
    },
    confirmPassword: { label: 'Confirm password', required: true, type: 'string' }
  });

  if (body.newPassword !== body.confirmPassword) {
    throw new ApiError(400, 'Confirm password must match the new password.', [
      { field: 'confirmPassword', message: 'Confirm password must match the new password.' }
    ]);
  }

  const user = db.prepare('SELECT password_hash FROM user_credentials WHERE user_id = ?').get(userId);
  if (!user || !verifyPassword(body.currentPassword, user.password_hash)) {
    throw new ApiError(401, 'Current password does not match.', [
      { field: 'currentPassword', message: 'Current password does not match.' }
    ]);
  }

  if (body.currentPassword === body.newPassword) {
    throw new ApiError(400, 'New password must be different from current password.', [
      { field: 'newPassword', message: 'New password must be different from current password.' }
    ]);
  }

  const newHash = hashPassword(body.newPassword);
  db.prepare('UPDATE user_credentials SET password_hash = ? WHERE user_id = ?').run(newHash, userId);
  notify(userId, 'Your account password was successfully updated.', 'info');

  return { success: true, message: 'Password updated successfully.' };
});

module.exports = {
  ADVISOR_CODE, SESSION_HOURS, CONTACT_METHODS, publicUser, findUserByEmail, getUser,
  register, login, logout, getUserByToken, getProfile, updateProfile, changePassword
};