// Turns a SQLite constraint error into an HTTP status and a readable message.
// Returns null for anything that isn't a constraint error.
// node:sqlite puts SQLite's extended error code in err.errcode.
const SQLITE_CONSTRAINT = 19;
const CODES = {
  275: { status: 400, message: 'Some fields are invalid.' }, // CHECK
  787: { status: 400, message: 'That refers to a record that does not exist.' }, // FOREIGN KEY
  1299: { status: 400, message: 'A required field is missing.' }, // NOT NULL
  1555: { status: 409, message: 'That would create a duplicate record.' }, // PRIMARY KEY
  2067: { status: 409, message: 'That would create a duplicate record.' } // UNIQUE
};

function constraintError(err) {
  if (!err || typeof err.errcode !== 'number' || (err.errcode & 0xff) !== SQLITE_CONSTRAINT) return null;
  return CODES[err.errcode] || { status: 400, message: 'That change breaks a database rule.' };
}

module.exports = { constraintError };
