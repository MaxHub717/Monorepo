import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ResendVerificationDto } from './dto/auth.dto.js';
import { AuthController } from './auth.controller.js';

describe('AuthController verification routes', () => {
  it('validates resend requests as email addresses', async () => {
    const dto = Object.assign(new ResendVerificationDto(), { email: 'not-an-email' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it('rate limits the public resend-verification route', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.resendVerification);

    expect(guards).toContain(ThrottlerGuard);
  });
});
