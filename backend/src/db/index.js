// Opens the SQLite database and creates the tables from schema.sql.
//
// We use node:sqlite, the SQLite driver built into Node.js (22.13 or newer), so there
// is nothing extra to install and no database server to run.
//
// - npm start: the data lives in backend/data/queuesmart.db, so it survives restarts.
// - npm test:  Jest sets NODE_ENV=test, so each test file gets its own empty in-memory
//              database and never touches the real file.
// - DB_FILE=... overrides the location (for example DB_FILE=:memory:).
//
// node:sqlite is synchronous, so the modules keep the same shape they had in A3:
// a function runs a query and gets the rows back right away (no async/await).
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'queuesmart.db');

// Node prints "SQLite is an experimental feature" the first time it's loaded.
// It works fine; we just hide that one line so the server and test output stay clean.
function loadSqlite() {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    if (String(warning).includes('SQLite is an experimental feature')) return;
    originalEmitWarning.call(process, warning, ...rest);
  };
  try {
    return require('node:sqlite');
  } catch (err) {
    throw new Error(`QueueSmart needs Node.js 22.13 or newer for its built-in SQLite database (you have ${process.version}). Install the current LTS from https://nodejs.org.`);
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

const { DatabaseSync } = loadSqlite();

function databaseFile() {
  if (process.env.DB_FILE) return process.env.DB_FILE;
  return process.env.NODE_ENV === 'test' ? ':memory:' : DEFAULT_FILE;
}

// Database files made before the 'missed' status keep the old CHECK rule, because
// CREATE TABLE IF NOT EXISTS skips a table that's already there. SQLite can't change a
// CHECK in place, so the old table is set aside here and its rows are copied back below.
function setAsideOldAppointments(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appointments'").get();
  if (!table || table.sql.includes("'missed'")) return false;
  database.exec(`
    DROP INDEX IF EXISTS ux_no_double_booking;
    ALTER TABLE appointments RENAME TO appointments_old;
  `);
  return true;
}

function createTables(database) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  database.exec('BEGIN');
  try {
    const upgrading = setAsideOldAppointments(database);
    database.exec(schema);
    if (upgrading) {
      database.exec(`
        INSERT INTO appointments SELECT * FROM appointments_old;
        DROP TABLE appointments_old;
      `);
    }
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function openDatabase(file = databaseFile()) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec('PRAGMA foreign_keys = ON'); // SQLite only enforces foreign keys when this is on
  if (file !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
  createTables(database);
  return database;
}

const db = openDatabase();

// Wraps a function so everything it does is one all-or-nothing database transaction:
// if it throws (a validation error, a constraint), every change it made is undone.
// Calls can be nested (check-in -> join queue); each level uses its own SAVEPOINT.
let depth = 0;
function transaction(fn) {
  return (...args) => {
    const savepoint = `sp_${depth}`;
    db.exec(`SAVEPOINT ${savepoint}`);
    depth += 1;
    try {
      const result = fn(...args);
      depth -= 1;
      db.exec(`RELEASE ${savepoint}`);
      return result;
    } catch (err) {
      depth -= 1;
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
      throw err;
    }
  };
}

module.exports = { db, transaction, openDatabase, databaseFile, DEFAULT_FILE };
