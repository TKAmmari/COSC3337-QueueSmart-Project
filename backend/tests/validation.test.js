const { checkField, validate } = require('../src/utils/validation');

describe('checkField', () => {
  test('required field that is missing or blank', () => {
    const rules = { label: 'Name', required: true, type: 'string' };
    expect(checkField(undefined, rules)).toBe('Name is required.');
    expect(checkField('   ', rules)).toBe('Name is required.');
    expect(checkField(null, rules)).toBe('Name is required.');
  });

  test('optional field can be left out', () => {
    expect(checkField(undefined, { label: 'Note', type: 'string' })).toBeNull();
  });

  test('string type and length limits', () => {
    const rules = { label: 'Name', type: 'string', minLength: 2, maxLength: 5 };
    expect(checkField(42, rules)).toBe('Name must be text.');
    expect(checkField('a', rules)).toBe('Name must be at least 2 characters.');
    expect(checkField('abcdef', rules)).toBe('Name must be 5 characters or fewer.');
    expect(checkField('abc', rules)).toBeNull();
  });

  test('integer type and range', () => {
    const rules = { label: 'Duration', type: 'integer', min: 1, max: 240 };
    expect(checkField('10', rules)).toBe('Duration must be a whole number.');
    expect(checkField(2.5, rules)).toBe('Duration must be a whole number.');
    expect(checkField(0, rules)).toBe('Duration must be at least 1.');
    expect(checkField(241, rules)).toBe('Duration must be at most 240.');
    expect(checkField(30, rules)).toBeNull();
  });

  test('boolean type', () => {
    expect(checkField('yes', { label: 'Open', type: 'boolean' })).toBe('Open must be true or false.');
    expect(checkField(false, { label: 'Open', type: 'boolean' })).toBeNull();
  });

  test('allowed values and patterns', () => {
    expect(checkField('urgent', { label: 'Priority', type: 'string', oneOf: ['low', 'high'] })).toBe('Priority must be one of: low, high.');
    expect(checkField('abc', { label: 'Code', type: 'string', pattern: /^\d+$/ })).toBe('Code is not valid.');
    expect(checkField('abc', { label: 'Code', type: 'string', pattern: /^\d+$/, patternMessage: 'Numbers only.' })).toBe('Numbers only.');
  });
});

describe('validate', () => {
  const schema = {
    name: { label: 'Name', required: true, type: 'string' },
    age: { label: 'Age', required: true, type: 'integer' }
  };

  test('passes when everything is valid', () => {
    expect(() => validate({ name: 'Ana', age: 20 }, schema)).not.toThrow();
  });

  test('lists every invalid field with a 400 status', () => {
    try {
      validate({}, schema);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBe('Some fields are invalid.');
      expect(err.details).toEqual([
        { field: 'name', message: 'Name is required.' },
        { field: 'age', message: 'Age is required.' }
      ]);
    }
  });

  test('uses the field message when only one field is wrong', () => {
    expect(() => validate({ name: 'Ana' }, schema)).toThrow('Age is required.');
  });

  test('treats a missing body as empty', () => {
    expect(() => validate(undefined, schema)).toThrow('Some fields are invalid.');
  });
});
