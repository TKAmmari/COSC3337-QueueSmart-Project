-- QueueSmart database schema (COSC 4353, Assignment 4)
-- Database: SQLite (file: backend/data/queuesmart.db, created automatically on first start)
--
-- Required tables from the assignment:
--   1. user_credentials   2. user_profile   3. services   4. queues
--   5. queue_entries      6. notifications
-- Supporting tables the A3 features need:
--   appointments (A2/A3 appointment booking), sessions (login tokens),
--   called_alerts (the "it's your turn" banner)
--
-- A student's queue HISTORY is not a separate table: it is every queue_entries row
-- for that student whose status is no longer 'waiting' (served or canceled), with
-- the outcome column saying how it ended.
--
-- Times are stored as INTEGER milliseconds since 1970 (JavaScript Date.now()).

PRAGMA foreign_keys = ON;

-- 1. UserCredentials: everything needed to sign in.
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id       TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE
                        CHECK (length(email) BETWEEN 3 AND 100 AND email LIKE '%_@_%'),
  password_hash TEXT    NOT NULL CHECK (length(password_hash) >= 64),  -- scrypt "salt:hash", never plain text
  role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at    INTEGER NOT NULL
);

-- 2. UserProfile: one row per user, linked by user_id and by email.
CREATE TABLE IF NOT EXISTS user_profile (
  user_id     TEXT    PRIMARY KEY
                      REFERENCES user_credentials(user_id) ON DELETE CASCADE,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE
                      REFERENCES user_credentials(email) ON UPDATE CASCADE ON DELETE CASCADE,
  full_name   TEXT    NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 60),
  phone       TEXT    CHECK (phone IS NULL OR length(phone) BETWEEN 7 AND 20),
  preferences TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(preferences)),  -- JSON, e.g. {"contactMethod":"email"}
  updated_at  INTEGER NOT NULL
);

-- 3. Service: what students can line up for.
CREATE TABLE IF NOT EXISTS services (
  service_id        TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description       TEXT    NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  expected_duration INTEGER NOT NULL CHECK (typeof(expected_duration) = 'integer' AND expected_duration BETWEEN 1 AND 240),
  priority_level    TEXT    NOT NULL CHECK (priority_level IN ('low', 'medium', 'high')),
  advisors_on_duty  INTEGER NOT NULL DEFAULT 1 CHECK (typeof(advisors_on_duty) = 'integer' AND advisors_on_duty BETWEEN 1 AND 10),
  created_at        INTEGER NOT NULL
);

-- 4. Queue: the line for one service. Opening/closing a service changes this status.
CREATE TABLE IF NOT EXISTS queues (
  queue_id   TEXT    PRIMARY KEY,
  service_id TEXT    NOT NULL UNIQUE
                     REFERENCES services(service_id) ON DELETE CASCADE,
  status     TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at INTEGER NOT NULL
);

-- 5. QueueEntry: one student's place in a queue. While waiting, position is 1, 2, 3...
--    When the visit ends, status becomes 'served' or 'canceled', position becomes NULL,
--    and ended_at / outcome are filled in (this is the student's history).
CREATE TABLE IF NOT EXISTS queue_entries (
  entry_id      TEXT    PRIMARY KEY,
  queue_id      TEXT    NOT NULL REFERENCES queues(queue_id) ON DELETE CASCADE,
  user_id       TEXT    REFERENCES user_credentials(user_id) ON DELETE SET NULL,  -- NULL = walk-in without an account
  display_name  TEXT    NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 60),
  position      INTEGER CHECK (position IS NULL OR (typeof(position) = 'integer' AND position >= 1)),
  priority      TEXT    NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  join_time     INTEGER NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'served', 'canceled')),
  note          TEXT    NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  last_position INTEGER,                                   -- last position we told the student about
  aged          INTEGER NOT NULL DEFAULT 0 CHECK (aged IN (0, 1)),  -- priority raised by priority aging
  ended_at      INTEGER,
  outcome       TEXT    CHECK (outcome IS NULL OR outcome IN ('completed', 'left queue', 'canceled', 'no-show')),
  CHECK ((status = 'waiting' AND position IS NOT NULL AND ended_at IS NULL AND outcome IS NULL)
      OR (status <> 'waiting' AND position IS NULL AND ended_at IS NOT NULL AND outcome IS NOT NULL))
);
-- A student can only be waiting in one queue at a time.
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_waiting_entry_per_user
  ON queue_entries(user_id) WHERE status = 'waiting' AND user_id IS NOT NULL;
-- Two people can't hold the same position in the same queue.
CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_position
  ON queue_entries(queue_id, position) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS ix_entries_user_history ON queue_entries(user_id, ended_at);

-- 6. Notification: in-app messages. status 'sent' = unread, 'viewed' = read.
CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL REFERENCES user_credentials(user_id) ON DELETE CASCADE,
  type            TEXT    NOT NULL DEFAULT 'queue' CHECK (type IN ('queue', 'status', 'info')),
  message         TEXT    NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  created_at      INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed'))
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id, created_at);

-- Appointments (feature from A2/A3).
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id TEXT    PRIMARY KEY,
  user_id        TEXT    NOT NULL REFERENCES user_credentials(user_id) ON DELETE CASCADE,
  service_id     TEXT    NOT NULL REFERENCES services(service_id),
  start_at       INTEGER NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled', 'checked-in', 'missed')),
  created_at     INTEGER NOT NULL
);
-- No double booking: one scheduled appointment per student per time slot.
CREATE UNIQUE INDEX IF NOT EXISTS ux_no_double_booking
  ON appointments(user_id, start_at) WHERE status = 'scheduled';
-- Used to count how many students already hold a time slot.
CREATE INDEX IF NOT EXISTS ix_appointments_slot ON appointments(service_id, start_at);

-- Login sessions (token from POST /api/auth/login, valid for 8 hours).
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES user_credentials(user_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- "It's your turn" banner shown to a student right after an advisor serves them.
CREATE TABLE IF NOT EXISTS called_alerts (
  user_id      TEXT    PRIMARY KEY REFERENCES user_credentials(user_id) ON DELETE CASCADE,
  service_name TEXT    NOT NULL,
  called_at    INTEGER NOT NULL
);
