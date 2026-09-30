# QueueSmart – Front End (Assignment 2)

Smart queue management for University Academic Advising. 

- **Students** join a walk-in queue, track their position and estimated wait, get
  notifications, and view their advising history.
- **Advisors / administrators** manage services, open or close queues, reorder or
  remove students, change priorities, and serve the next student.

There is no backend yet. All data is mocked and kept in the browser's `localStorage`.

## Running it

No install or build step is needed.

1. Clone the repo.
2. Open `login.html` in a browser (double-click it), **or** serve the folder:
   `python3 -m http.server 8000` and visit http://localhost:8000.

Demo accounts (mock data):

| Role | Email | Password |
|---|---|---|
| Student | student@uh.edu | Student123! |
| Advisor (admin) | advisor@uh.edu | Advisor123! |

You can also register a new account (email must end in `@uh.edu` or `@cougarnet.uh.edu`).
"Reset demo data" on the sign-in page restores the original mock data.

**Tip for demos:** sign in as the student in one tab and as the advisor in a second tab.
When the advisor clicks *Serve next student*, the student's tab updates live and shows
notifications. (Sessions are per tab; data is shared.)

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
css/styles.css      Shared design system (colors, type, components, responsive rules)
js/store.js         Mock data + all queue rules (the only file that touches data)
js/validate.js      Reusable client-side validation (required, length, email, number, date)
js/app.js           Session + role guard, navigation shell, notifications, toasts, dialogs
js/pages/*.js       One script per screen
*.html              One page per screen
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

Handled by `js/validate.js`: required fields, length limits with live character counters
(service name max 100), email format and university domain, password strength and
confirmation, whole-number range for expected duration (1–240 minutes), and date inputs
on History (no future dates, end date not before start date).

## Moving to Assignment 3

Screens never touch `localStorage` directly; they call `QS.store.*`. In A3 each of those
functions becomes a `fetch()` call to the API, and the screens stay the same.

## Git workflow

- `main` is always runnable.
- Each person works on a feature branch (e.g. `feature/queue-status`) and opens a pull
  request; one teammate reviews before merging.
- Link commits and PRs to GitHub Issues on the project board.
