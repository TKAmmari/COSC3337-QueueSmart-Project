// An error we throw on purpose, with the HTTP status code to send back.
// details is a list of { field, message } for validation errors.
class ApiError extends Error {
  constructor(status, message, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = ApiError;
