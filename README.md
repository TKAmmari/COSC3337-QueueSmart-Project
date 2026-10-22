# QueueSmart (Assignments 2 and 3)

Smart queue management for University Academic Advising. 

- **Students** join a walk-in queue, track their position and estimated wait, get
  notifications, and view their advising history.
- **Advisors / administrators** manage services, open or close queues, reorder or
  remove students, change priorities, and serve the next student.

As of Assignment 3 the front end (`frontend/`) gets all of its data from the
back-end REST API (`backend/`). The back end keeps data in memory; since there is no
database yet.

## Running it

You need **Node.js 18 or newer** (check with `node -v`).

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3000**. The server runs the API and the front end together.
Data is kept in memory, so restarting the server resets it.

Run the tests from the `backend` folder:

```bash
npm test                # all Jest tests
npm run test:coverage   # tests + coverage report
```

On Windows PowerShell, if `npm` is blocked by "running scripts is disabled", use `npm.cmd`
instead (e.g. `npm.cmd test`) or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

See [`backend/README.md`](backend/README.md) for how the back end is organized and the list of API routes.

Demo accounts (mock data):

| Role | Email | Password |
|---|---|---|
| Student | student@uh.edu | Student123! |
| Advisor (admin) | advisor@uh.edu | Advisor123! |

You can also register a new account (email must end in `@uh.edu` or `@cougarnet.uh.edu`).
"Reset demo data" on the sign-in page restores the original mock data.

**Tip for demos:** sign in as the student in one tab and as the advisor in a second tab.
When the advisor clicks *Serve next student*, the student's tab updates within about two
seconds and shows notifications. (Sessions are per tab; data lives on the server.)

## Screens

| Screen | File | Script |
|---|---|---|
| Login | `login.html` | `js/pages/login.js` |
| Registration | `register.html` | `js/pages/register.js` |
| User dashboard | `dashboard.html` | `js/pages/dashboard.js` |
| Join queue | `join.html` | `js/pages/join.js` |
| Queue status | `status.html` | `js/pages/status.js` |
| History | `history.html` | `js/pages/history.js` |
| Admin dashboard | `admin-dashboard.html` | `js/pages/admin-dashboard.js` |
| Service management | `services.html` | `js/pages/services.js` |
| Queue management | `admin-queue.html` | `js/pages/admin-queue.js` |
| Notifications (bell, panel, toasts) | every signed-in page | `js/app.js` |

## Project structure

```
backend/                  Express REST API, in-memory data, Jest tests (see backend/README.md)
frontend/css/styles.css   Shared design system (colors, type, components, responsive rules)
frontend/js/store.js      API client: every screen gets its data through QS.store -> /api/*
frontend/js/validate.js   Reusable client-side validation (required, length, email, number, date)
frontend/js/app.js        Session + role guard, navigation shell, notifications, toasts, dialogs
frontend/js/pages/*.js    One script per screen
frontend/*.html           One page per screen
```

## Rules carried over from Assignment 1

- Queue order is **priority first (high > medium > low), then arrival time**.
  Advisors can change an individual student's priority or reorder by hand.
- **Estimated wait** = expected duration of the sessions ahead ÷ advisors on duty,
  always labeled as an estimate.
- Status moves **Waiting → Almost ready (position 1–2) → Served**.
- **Privacy:** students never see other students' names or reasons for visiting;
  the line ahead is shown as anonymous places.
- History outcomes: completed, left queue, canceled, no-show.
- Advisor dashboard shows basic statistics: waiting now, served today, average and
  longest wait, no-show rate.

## Validation

Front end: `frontend/js/validate.js`. Back end: `backend/src/utils/validation.js`, which
returns `400` with one message per invalid field. Front-end rules: required fields, length limits with live character counters
(service name max 100), email format and university domain, password strength and
confirmation, whole-number range for expected duration (1–240 minutes), and date inputs
on History (no future dates, end date not before start date).

## Assignment 3: how the front end talks to the back end

Screens never touched data directly; they call `QS.store.*`. In A3 each of those
functions became a call to the REST API, so the screens stayed almost the same. The
client caches GET results until something changes, and checks `/api/version` every
three seconds so other tabs stay in sync.
The back end validates everything again (required fields, types, length limits), so
the front-end checks are for convenience only.

## Git workflow

- `main` is always runnable.
- Each person works on a feature branch (e.g. `feature/queue-status`) and opens a pull
  request; one teammate reviews before merging.
- Link commits and PRs to GitHub Issues on the project board.
