const express = require('express');
const auth = require('../modules/auth');
const ApiError = require('../utils/ApiError');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  res.status(201).json({ user: auth.register(req.body) });
});

router.post('/login', (req, res) => {
  res.json(auth.login(req.body));
});

router.post('/logout', requireLogin, (req, res) => {
  auth.logout(req.token);
  res.json({ loggedOut: true });
});

router.get('/me', requireLogin, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

// Mounted at /api/users: a student can look up themselves, an advisor anyone.
const usersRouter = express.Router();
usersRouter.get('/:id', requireLogin, (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    throw new ApiError(403, 'You can only view your own account.');
  }
  const user = auth.getUser(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  res.json({ user: auth.publicUser(user) });
});

module.exports = { authRouter: router, usersRouter };
