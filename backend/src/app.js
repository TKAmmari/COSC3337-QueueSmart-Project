// Sets up the Express app: JSON parsing, all the API routes, error handling,
// and serving the front end so everything runs at http://localhost:3000.
const path = require('path');
const express = require('express');
const ApiError = require('./utils/ApiError');
const { data, resetData } = require('./data/store');
const { authRouter, usersRouter } = require('./routes/auth');
const servicesRouter = require('./routes/services');
const queuesRouter = require('./routes/queues');
const { notificationsRouter, historyRouter, appointmentsRouter, statsRouter } = require('./routes/other');

const app = express();
app.use(express.json());

// Any successful change to the data bumps the version number. The front end checks
// /api/version every few seconds and refreshes when it changes. Failed requests
// (400, 401, 409, ...) don't change anything, so they don't bump it.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) data.version += 1;
    });
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/services', servicesRouter);
app.use('/api/queues', queuesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/history', historyRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/stats', statsRouter);

app.get('/api/version', (req, res) => {
  res.json({ version: data.version });
});

// "Reset demo data" button on the login page. Turned off in production
// (NODE_ENV=production) so nobody can wipe real data.
app.post('/api/demo/reset', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(403, 'Resetting demo data is turned off on this server.');
  }
  resetData();
  res.json({ reset: true });
});

// Unknown API route.
app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: `No API route for ${req.method} ${req.originalUrl}.` } });
});

// Front-end files (login.html, css/, js/, ...).
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Error handler: turns thrown errors into JSON responses.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    const body = { message: err.message };
    if (err.details.length > 0) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Request body is not valid JSON.' } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong on the server.' } });
});

module.exports = app;
