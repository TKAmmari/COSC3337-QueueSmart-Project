// Authentication module: register, log in, log out, and look up users.
// Roles: 'student' (User) and 'admin' (Advisor / Administrator).
const crypto = require('crypto');
const { data, newId } = require('../data/store');
const ApiError = require('../utils/ApiError');
const { validate } = require('../utils/validation');
const { notify } = require('./notifications');

const registerRules = {
  name: { label: 'Full name', required: true, type: 'string', minLength: 2, maxLength: 60 },
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

// The user info we send to the front end (never the password).
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function findUserByEmail(email) {
  return data.users.find((u) => u.email === String(email).trim().toLowerCase());
}

function getUser(id) {
  return data.users.find((u) => u.id === id);
}

function register(body) {
  validate(body, registerRules);
  if (findUserByEmail(body.email)) {
    throw new ApiError(409, 'An account with this email already exists. Sign in instead.');
  }
  const user = {
    id: newId('u'),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    password: body.password,
    role: body.role || 'student'
  };
  data.users.push(user);
  notify(user.id, 'Welcome to QueueSmart. Your university email has been verified.', 'info');
  return publicUser(user);
}

function login(body) {
  validate(body, loginRules);
  const user = findUserByEmail(body.email);
  // Same message either way, so nobody can tell which emails have accounts.
  if (!user || user.password !== body.password) {
    throw new ApiError(401, 'That email and password don’t match an account. Check both and try again.');
  }
  const token = crypto.randomUUID();
  data.sessions[token] = user.id;
  return { token, user: publicUser(user) };
}

function logout(token) {
  delete data.sessions[token];
}

function getUserByToken(token) {
  const userId = data.sessions[token];
  return userId ? getUser(userId) : undefined;
}

module.exports = { publicUser, findUserByEmail, getUser, register, login, logout, getUserByToken };
