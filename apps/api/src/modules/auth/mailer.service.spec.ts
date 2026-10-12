import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DevMailer } from './mailer.service.js';

describe('DevMailer', () => {
  it('puts the verification URL in the local inbox without logging the token', async () => {
    const config = {
      get: vi.fn((key: string) => ({
        NODE_ENV: 'development',
        FRONTEND_BASE_URL: 'http://localhost:3001',
      }[key])),
    };
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const mailer = new DevMailer(config as any);

    await mailer.sendVerificationEmail('player@example.com', 'verification-id.secret-token');

    const [message] = mailer.getDevelopmentMessages('PLAYER@example.com');
    const verificationUrl = new URL(message.verificationUrl);
    expect(verificationUrl.origin).toBe('http://localhost:3001');
    expect(verificationUrl.pathname).toBe('/auth/verify');
    expect(verificationUrl.searchParams.get('token')).toBe('verification-id.secret-token');
    expect(message.text).toContain('/auth/verify?token=');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('verification email queued'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
    log.mockRestore();
  });

  it('does not deliver development email outside development mode', async () => {
    const config = { get: vi.fn(() => 'production') };
    const mailer = new DevMailer(config as any);

    await expect(mailer.sendVerificationEmail('player@example.com', 'secret-token'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mailer.getDevelopmentMessages('player@example.com')).toEqual([]);
  });
});
