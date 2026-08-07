import { isStrongPassword } from '../password-policy.validator.ts';

describe('isStrongPassword', () => {
  it('accepts a password that meets complexity requirements', () => {
    expect(isStrongPassword('Str0ng!Pass')).toBe(true);
  });

  it('rejects a common password', () => {
    expect(isStrongPassword('password')).toBe(false);
  });

  it('rejects a password missing complexity', () => {
    expect(isStrongPassword('weakpassword')).toBe(false);
  });
});
