# QueueSmart back end

Express REST API for QueueSmart (COSC 4353, Assignment 3). Data lives in memory until we add a database in A4.

- **Language:** JavaScript (Node.js)
- **Framework:** Express
- **Tests:** Jest + Supertest

```bash
npm install
npm start               # http://localhost:3000
npm test                # run the tests
npm run test:coverage   # tests + coverage report (opens in coverage/lcov-report/index.html)
```

## How it's organized

```
src/
  server.js            starts the server on port 3000
  app.js               Express setup: JSON parsing, routes, error handler, serves ../frontend
  data/store.js        all the in-memory data + resetData() to restore the starting data
  middleware/auth.js   requireLogin (checks the token) and requireRole('admin' | 'student')
  utils/validation.js  validate(body, rules): required, type, length, range, allowed values
  utils/ApiError.js    an error that carries an HTTP status code
  modules/             the actual logic, one file per module
  routes/              thin Express routers that call the modules
tests/                 Jest tests, one file per module + api.test.js for the HTTP routes
```

**How a request flows** (example: a student joins a queue):

1. The front end calls `QS.store.joinQueue(...)`, which sends `POST /api/queues/s1/join` with the login token.
2. `routes/queues.js` runs `requireLogin` and `requireRole('student')` from `middleware/auth.js`.
3. The route calls `joinQueue()` in `modules/queue.js`, which validates the note, checks the service is open,
   puts the student in the right spot, and sends notifications.
4. The route sends back the result as JSON. If anything threw an `ApiError`, the error handler in `app.js`
   sends `{ error: { message, details } }` with the right status code instead.

## Modules

| File | What it does |
|---|---|
| `modules/auth.js` | Register (with validation), log in (returns a token), log out, look up users. Roles: `student`, `admin`. |
| `modules/services.js` | Create, edit, list, and open/close services (name, description, duration, priority). |
| `modules/queue.js` | Join, leave, see your position; advisors serve next, remove, move, change priority. Order is priority, then arrival time. |
| `modules/waitTime.js` | Estimated wait = people ahead × session length ÷ advisors on duty. |
| `modules/notifications.js` | Saves notifications: joined, almost ready (#1–#2), moved, served, removed. |
| `modules/history.js` | Saves each queue visit and its outcome (completed, left queue, canceled, no-show). |
| `modules/appointments.js` | Book, change, and cancel appointments (from A2). |
| `modules/stats.js` | Advisor dashboard numbers: waiting, served, average/longest wait, no-show rate. |

## API routes

All routes start with `/api`. Signed-in routes need the header `Authorization: Bearer <token>`.

| Method | Route | Who |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | anyone |
| POST | `/auth/logout` · GET `/auth/me` | signed in |
| GET | `/users/:id` | yourself, or an advisor |
| GET | `/services`, `/services/:id` | signed in |
| POST / PUT | `/services`, `/services/:id` | advisor |
| PATCH | `/services/:id/status` (`{ open: true/false }`) | advisor |
| GET | `/queues/me`, `/queues/:serviceId`, `/queues/:serviceId/projection`, `/queues/:serviceId/estimate?position=3` | signed in |
| POST | `/queues/:serviceId/join`, `/queues/leave` | student |
| GET / DELETE | `/queues/me/called` (the "it's your turn" message) | signed in |
| POST | `/queues/:serviceId/serve` | advisor |
| DELETE | `/queues/:serviceId/entries/:entryId` (`{ outcome: 'removed' or 'no-show' }`) | advisor |
| POST | `/queues/:serviceId/entries/:entryId/move` (`{ direction: -1 or 1 }`) | advisor |
| PATCH | `/queues/:serviceId/entries/:entryId/priority` (`{ priority }`) | advisor |
| GET · POST | `/notifications` · `/notifications/read-all` | signed in |
| GET | `/history?outcome=completed` | signed in |
| GET · POST | `/appointments` (book: student) | signed in |
| PUT · POST | `/appointments/:id` · `/appointments/:id/cancel` | owner or advisor |
| GET | `/stats` | advisor |
| GET · POST | `/version` · `/demo/reset` | anyone |

Errors come back as `{ "error": { "message": "...", "details": [{ "field", "message" }] } }` with status
400 (invalid input), 401 (not signed in), 403 (wrong role), 404 (not found), or 409 (conflict, like joining two queues).

## Validation rules

| Field | Rules |
|---|---|
| Full name | required, 2–60 characters |
| Email | required, max 100, must end in `@uh.edu` or `@cougarnet.uh.edu`, not already used |
| Password | required, 8–64 characters, needs uppercase, lowercase, and a number |
| Service name | required, max 100, unique |
| Description | required, max 500 |
| Expected duration | required, whole number 1–240 |
| Priority | required: `low`, `medium`, or `high` |
| Queue note | optional, max 200 |
| Appointment | service, date (`YYYY-MM-DD`, not in the past), time (`HH:MM`, 9:00–4:30) required; no double booking |
