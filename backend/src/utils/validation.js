const ApiError = require('./ApiError');

// Checks one value against its rules. Returns an error message, or null if it's fine.
// Rules: label, required, type ('string' | 'integer' | 'boolean'),
//        minLength / maxLength (strings), min / max (integers), oneOf, pattern + patternMessage
function checkField(value, rules) {
  const label = rules.label;
  const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

  if (isEmpty) {
    return rules.required ? `${label} is required.` : null;
  }

  if (rules.type === 'string') {
    if (typeof value !== 'string') return `${label} must be text.`;
    const length = value.trim().length;
    if (rules.minLength && length < rules.minLength) return `${label} must be at least ${rules.minLength} characters.`;
    if (rules.maxLength && length > rules.maxLength) return `${label} must be ${rules.maxLength} characters or fewer.`;
  }

  if (rules.type === 'integer') {
    if (!Number.isInteger(value)) return `${label} must be a whole number.`;
    if (rules.min !== undefined && value < rules.min) return `${label} must be at least ${rules.min}.`;
    if (rules.max !== undefined && value > rules.max) return `${label} must be at most ${rules.max}.`;
  }

  if (rules.type === 'boolean' && typeof value !== 'boolean') {
    return `${label} must be true or false.`;
  }

  if (rules.oneOf && !rules.oneOf.includes(value)) {
    return `${label} must be one of: ${rules.oneOf.join(', ')}.`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return rules.patternMessage || `${label} is not valid.`;
  }

  return null;
}

// Checks every field in the schema. Throws a 400 error listing all the bad fields.
function validate(body, schema) {
  const input = body || {};
  const errors = [];

  for (const field of Object.keys(schema)) {
    const message = checkField(input[field], schema[field]);
    if (message) errors.push({ field, message });
  }

  if (errors.length > 0) {
    const message = errors.length === 1 ? errors[0].message : 'Some fields are invalid.';
    throw new ApiError(400, message, errors);
  }
}

module.exports = { checkField, validate };
