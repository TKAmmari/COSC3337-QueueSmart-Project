# QueueSmart back end

Express REST API for QueueSmart (COSC 4353, Assignments 3 and 4), with a SQLite database.

- **Language:** JavaScript (Node.js 22.13 or newer)
- **Framework:** Express
- **Database:** SQLite through `node:sqlite` (built into Node, nothing to install)
- **Tests:** Jest + Supertest

```bash
npm install
npm start               # http://localhost:3000
npm test                # run the tests
npm run test:coverage   # tests + coverage report (opens in coverage/lcov-report/index.html)
npm run db:reset        # wipe the database and load the demo data again
```

The first `npm start` creates `data/queuesmart.db` and loads the demo data. After that, every
change is saved there and is still there after a restart. Tests (`NODE_ENV=test`, set by Jest)
use a fresh in-memory database instead, so they never touch your file.

## How it's organized

```
src/
  server.js            starts the server on port 3000
  app.js               Express setup: JSON parsing, routes, error handler, serves ../frontend
  db/schema.sql        CREATE TABLE statements: keys, foreign keys, and validation rules
  db/index.js          opens the database, runs schema.sql, transaction() helper
  db/errors.js         turns a database rule error (UNIQUE, CHECK, ...) into a 409/400
  data/store.js        newId(), resetData() (loads the demo data), data.version
  middleware/auth.js   requireLogin (checks the token) and requireRole('admin' | 'student')
  utils/validation.js  validate(body, rules): required, type, length, range, allowed values
  utils/ApiError.js    an error that carries an HTTP status code
  utils/password.js    hashPassword / verifyPassword (Node's built-in scrypt)
  modules/             the actual logic, one file per module
  routes/              thin Express routers that call the modules
tests/                 Jest tests, one file per module + api.test.js for the HTTP routes
```

**How a request flows** (example: a student joins a queue):

1. The front end calls `QS.store.joinQueue(...)`, which sends `POST /api/queues/s1/join` with the login token.
2. `routes/queues.js` runs `requireLogin` and `requireRole('student')` from `middleware/auth.js`.
3. The route calls `joinQueue()` in `modules/queue.js`, which validates the note, checks the service is open,
   puts the student in the right spot, saves the new positions to `queue_entries`, and adds rows to
   `notifications`. All of that runs in one transaction: if any step fails, nothing is saved.
4. The route sends back the result as JSON. If anything threw an `ApiError`, the error handler in `app.js`
   sends `{ error: { message, details } }` with the right status code instead.

## Modules

| File | What it does |
|---|---|
| `modules/auth.js` | Register (with validation), log in (returns a token that expires after 8 hours), log out, look up users, read and update the user's profile. Roles: `student`, `admin`. Passwords are stored hashed. |
| `modules/services.js` | Create, edit, list, and open/close services (name, description, duration, priority). Set how many advisors are on duty (1–10); students in line are told their new estimated wait. |
| `modules/queue.js` | Join, leave, see your position; advisors serve next, remove, move, change priority. Order is priority, then arrival time. **Priority aging** runs automatically every minute: low → medium after 1.5× the session length, anything → high after 2.5×. |
| `modules/waitTime.js` | Estimated wait = people ahead × session length ÷ advisors on duty. |
| `modules/notifications.js` | Saves notifications: joined, almost ready (#1–#2), moved, served, removed. |
| `modules/history.js` | Ends a queue visit with its outcome (completed, left queue, canceled, no-show) and lists a student's past visits. |
| `modules/appointments.js` | Book, change, cancel, and check in for appointments. Check-in puts the student in that service's queue. Appointments nobody checked in for are marked missed once their day is over. |
| `modules/stats.js` | Advisor dashboard numbers for today: waiting, served, average/longest wait, no-show rate, per-service demand, appointment stats. |

## API routes

All routes start with `/api`. Signed-in routes need the header `Authorization: Bearer <token>`.

| Method | Route | Who |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | anyone |
| POST | `/auth/logout` · GET `/auth/me` | signed in |
| GET · PUT | `/users/me/profile` (`{ name, phone, preferences: { contactMethod } }`) | signed in |
| GET | `/users/:id` | yourself, or an advisor |
| GET | `/services`, `/services/:id` | signed in |
| POST / PUT | `/services`, `/services/:id` | advisor |
| PATCH | `/services/:id/status` (`{ open: true/false }`) | advisor |
| PATCH | `/services/:id/advisors` (`{ advisors: 1–10 }`) | advisor |
| GET | `/queues/me`, `/queues/:serviceId`, `/queues/:serviceId/projection`, `/queues/:serviceId/estimate?position=3` | signed in |
| GET | `/queues/:serviceId/search?q=student&priority=high` | advisor |
| POST | `/queues/:serviceId/join`, `/queues/leave` | student |
| GET / DELETE | `/queues/me/called` (the "it's your turn" message) | signed in |
| POST | `/queues/:serviceId/serve` | advisor |
| DELETE | `/queues/:serviceId/entries/:entryId` (`{ outcome: 'removed' or 'no-show' }`) | advisor |
| POST | `/queues/:serviceId/entries/:entryId/move` (`{ direction: -1 or 1 }`) | advisor |
| PATCH | `/queues/:serviceId/entries/:entryId/priority` (`{ priority }`) | advisor |
| GET · POST | `/notifications` · `/notifications/read-all` | signed in |
| GET | `/history?outcome=completed` | signed in |
| GET · POST | `/appointments` (book: student) | signed in |
| PUT · POST | `/appointments/:id` · `/appointments/:id/cancel` · `/appointments/:id/check-in` | owner or advisor |
| POST | `/queues/:serviceId/age-check` (raise priority for long waits) | advisor |
| GET | `/stats` | advisor |
| GET · POST | `/version` · `/demo/reset` (turned off when `NODE_ENV=production`) | anyone |

Errors come back as `{ "error": { "message": "...", "details": [{ "field", "message" }] } }` with status
400 (invalid input), 401 (not signed in), 403 (wrong role), 404 (not found), or 409 (conflict, like joining two queues).

## Server-side advisor queue search

The advisor Queue Management screen calls `GET /api/queues/:serviceId/search`.
Optional parameters are `q` (case-insensitive name/email search, max 100 characters)
and `priority` (`all`, `high`, `medium`, or `low`). The endpoint requires
an advisor token. Its response includes `entries`, `total`, and `matchCount`.
Each matching entry retains its original 1-based `position`, and searching does
not reorder the queue or change the student who is served next. Jest and Supertest
tests cover matches, validation, authorization, and queue-order preservation.

## Database

SQLite, one file at `data/queuesmart.db`. The tables are in `src/db/schema.sql`:

| Table | Key columns | Notes |
|---|---|---|
| `user_credentials` | `user_id` PK, `email` UNIQUE | `password_hash` (scrypt, never plain text), `role` student/admin |
| `user_profile` | `user_id` PK → `user_credentials`, `email` → `user_credentials.email` | `full_name` 2–60, `phone` optional, `preferences` JSON |
| `services` | `service_id` PK, `name` UNIQUE | duration 1–240 (whole number), priority low/medium/high, advisors 1–10 |
| `queues` | `queue_id` PK, `service_id` UNIQUE → `services` | `status` open/closed, `created_at` |
| `queue_entries` | `entry_id` PK, `queue_id` → `queues`, `user_id` → `user_credentials` (NULL = walk-in) | `position`, `join_time`, `status` waiting/served/canceled, `outcome` |
| `notifications` | `notification_id` PK, `user_id` → `user_credentials` | `message`, `created_at`, `status` sent (unread) / viewed (read) |
| `appointments` | `appointment_id` PK, `user_id`, `service_id` | no double booking (unique index on scheduled ones) |
| `sessions` | `token` PK, `user_id` | login tokens with `expires_at` |
| `called_alerts` | `user_id` PK | the "it's your turn" banner |

- **History** is not its own table: a student's past visits are their `queue_entries` rows whose
  status is no longer `waiting`.
- Every module validates input first (`utils/validation.js`) and returns clear 400/409 errors. The
  schema enforces the same rules again (NOT NULL, CHECK, UNIQUE, FOREIGN KEY) as a safety net; if
  one of those ever trips, `db/errors.js` turns it into a 400/409 instead of a 500.
- Changes that touch several rows (joining a queue, serving, checking in) run inside
  `transaction()` from `db/index.js`, so they're all-or-nothing.
- Times are stored as milliseconds since 1970 (`Date.now()`).

To look inside the file, open it with [DB Browser for SQLite](https://sqlitebrowser.org) or the
"SQLite Viewer" VS Code extension.

## Settings

| Environment variable | What it does |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DB_FILE` | Where the database file goes (default `data/queuesmart.db`; `:memory:` for a throwaway one) |
| `ADVISOR_CODE` | Code needed to register an advisor account. Defaults to `ADVISE-UH` for the class demo; set your own on a real server. |
| `NODE_ENV=production` | Turns off `/api/demo/reset` |

## Validation rules

| Field | Rules |
|---|---|
| Full name | required, 2–60 characters |
| Phone (profile) | optional, 7–20 characters, digits, spaces, and `+ ( ) - .` only |
| Preferred contact method | `in-app`, `email`, or `phone` (phone needs a phone number) |
| Email | required, max 100, must end in `@uh.edu` or `@cougarnet.uh.edu`, not already used |
| Password | required, 8–64 characters, needs uppercase, lowercase, and a number |
| Role | `student` (default) or `admin`; `admin` also needs the advisor access code |
| Service name | required, max 100, unique |
| Description | required, max 500 |
| Expected duration | required, whole number 1–240 |
| Advisors on duty | required, whole number 1–10 |
| Priority | required: `low`, `medium`, or `high` |
| Queue note | optional, max 200 |
| Appointment | service, date (`YYYY-MM-DD`, a real date, a weekday, not in the past), time (`HH:MM`, one of 9:00, 10:00, 11:00, 13:00, 14:00, 15:00, not already passed) required; no double booking (also when changing one); each service takes one appointment per advisor on duty in a time slot; only scheduled appointments can be changed, canceled, or checked in; check-in only on the appointment day |
