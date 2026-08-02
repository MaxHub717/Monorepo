import { validate } from 'class-validator';
import { IsStrongPassword } from '../password-policy.validator.js';

class TestDto {
  @IsStrongPassword()
  password!: string;
}

describe('IsStrongPassword', () => {
  it('accepts a password that meets complexity requirements', async () => {
    const dto = new TestDto();
    dto.password = 'Str0ng!Pass';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a common password', async () => {
    const dto = new TestDto();
    dto.password = 'password';

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints).toMatchObject({
      isStrongPassword: 'Password is too common. Choose a less predictable password.',
    });
  });

  it('rejects a password missing complexity', async () => {
    const dto = new TestDto();
    dto.password = 'weakpassword';

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints).toMatchObject({
      isStrongPassword:
        'Password must be at least 10 characters long and include uppercase, lowercase, number, and symbol.',
    });
  });
});
