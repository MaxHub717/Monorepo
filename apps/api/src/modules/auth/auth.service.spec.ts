import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';

const createPrismaMock = () => ({
  $transaction: vi.fn((callback: any) => callback({
    user: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    playerProfile: { create: vi.fn() },
    userRole: { create: vi.fn() },
    verificationToken: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    outboxEvent: { create: vi.fn() },
    session: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    loginAttempt: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    role: { findUnique: vi.fn() },
  })),
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  playerProfile: {
    create: vi.fn(),
  },
  userRole: {
    create: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  outboxEvent: {
    create: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  loginAttempt: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
});

const createConfigMock = () => ({
  get: vi.fn((key: string) => key === 'NODE_ENV' ? 'development' : undefined),
  getOrThrow: vi.fn((key: string) => {
    if (key.includes('ACCESS')) return 'access-secret';
    if (key.includes('REFRESH')) return 'refresh-secret';
    return 'secret';
  }),
});

describe('AuthService', () => {
  let authService: AuthService;
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let configMock: ReturnType<typeof createConfigMock>;
  let mailerMock: { sendVerificationEmail: ReturnType<typeof vi.fn>; sendPasswordResetEmail: ReturnType<typeof vi.fn>; getDevelopmentMessages: ReturnType<typeof vi.fn> };
  let outboxMock: { enqueueEvent: ReturnType<typeof vi.fn>; enqueueEventDirect: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prismaMock = createPrismaMock();
    configMock = createConfigMock();
    mailerMock = { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), getDevelopmentMessages: vi.fn().mockReturnValue([]) };
    outboxMock = { enqueueEvent: vi.fn(), enqueueEventDirect: vi.fn().mockResolvedValue(undefined) };
    authService = new AuthService(
      prismaMock as any,
      configMock as any,
      outboxMock as any,
      mailerMock as any,
      { writeLog: vi.fn() } as any,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates a user record during registration', async () => {
    const input = { email: 'test@example.com', username: 'test', password: 'password', gamerTag: 'test' };
    const userCreate = vi.fn().mockResolvedValue({ id: 'user-id' });
    const verificationCreate = vi.fn();
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      user: { create: userCreate, findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      playerProfile: { create: vi.fn() },
      userRole: { create: vi.fn() },
      verificationToken: { create: verificationCreate, update: vi.fn(), updateMany: vi.fn() },
      outboxEvent: { create: vi.fn() },
      session: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      loginAttempt: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      role: { findUnique: vi.fn().mockResolvedValue(null) },
    }));
    vi.spyOn(argon2, 'hash').mockResolvedValue('hashed');

    const result = await authService.register(input);
    expect(result).toEqual({ userId: 'user-id', status: 'pending' });
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ account_status: 'PENDING' }) }));
    expect(verificationCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purpose: 'EMAIL_VERIFY' }) }));
    expect(mailerMock.sendVerificationEmail).toHaveBeenCalledWith('test@example.com', expect.stringMatching(/^[0-9a-f-]+\.[0-9a-f]+$/));
    expect(result).not.toHaveProperty('token');
  });

  it('verifies an email using a valid token and activates the account', async () => {
    prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue({
      id: 'verification-id',
      user_id: 'user-id',
      purpose: 'EMAIL_VERIFY',
      token_hash: 'hashed-secret',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
    });
    vi.spyOn(argon2, 'verify').mockResolvedValue(true);
    const userUpdate = vi.fn().mockResolvedValue({});
    const tokenUpdate = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      user: { update: userUpdate },
      verificationToken: { update: tokenUpdate },
    }));

    await expect(authService.verifyEmail({ token: 'verification-id.secret' })).resolves.toEqual({ success: true });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-id' },
      data: expect.objectContaining({ account_status: 'ACTIVE', email_verified_at: expect.any(Date) }),
    }));
    expect(tokenUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'verification-id' } }));
  });

  it('rejects invalid or expired email-verification tokens', async () => {
    prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(null);
    await expect(authService.verifyEmail({ token: 'missing.secret' })).rejects.toThrow('Verification token is invalid or expired');
  });

  it('resends only for pending unverified accounts and returns a non-enumerating response', async () => {
    const findUser = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'pending-user', email: 'pending@example.com', account_status: 'PENDING', email_verified_at: null,
    }).mockResolvedValueOnce({
      id: 'verified-user', email: 'verified@example.com', account_status: 'ACTIVE', email_verified_at: new Date(),
    });
    const invalidatePriorTokens = vi.fn();
    const createToken = vi.fn();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      user: { findUnique: findUser },
      verificationToken: { updateMany: invalidatePriorTokens, create: createToken },
    }));
    vi.spyOn(argon2, 'hash').mockResolvedValue('hashed-token');

    await expect(authService.resendVerification('unknown@example.com')).resolves.toEqual({ success: true });
    expect(mailerMock.sendVerificationEmail).not.toHaveBeenCalled();

    await expect(authService.resendVerification('pending@example.com')).resolves.toEqual({ success: true });
    expect(invalidatePriorTokens).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 'pending-user', purpose: 'EMAIL_VERIFY', consumed_at: null },
    }));
    expect(createToken).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ user_id: 'pending-user', purpose: 'EMAIL_VERIFY' }),
    }));
    expect(mailerMock.sendVerificationEmail).toHaveBeenCalledWith('pending@example.com', expect.stringMatching(/^[0-9a-f-]+\.[0-9a-f]+$/));

    await expect(authService.resendVerification('verified@example.com')).resolves.toEqual({ success: true });
    expect(mailerMock.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects login before email verification even with the correct password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'pending-user',
      email: 'pending@example.com',
      password_hash: 'password-hash',
      account_status: 'PENDING',
      email_verified_at: null,
    });
    prismaMock.loginAttempt.findFirst.mockResolvedValue(null);
    vi.spyOn(argon2, 'verify').mockResolvedValue(true);

    await expect(authService.login({ email: 'pending@example.com', password: 'CorrectPassword1!' }))
      .rejects.toThrow('Account is not active or verified');
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('serves development verification email only from the development mailbox', () => {
    mailerMock.getDevelopmentMessages.mockReturnValue([{ id: 'message-id', verificationUrl: 'http://localhost:3001/auth/verify?token=secret' }]);

    expect(authService.getDevelopmentMailbox('test@example.com')).toEqual({
      messages: [{ id: 'message-id', verificationUrl: 'http://localhost:3001/auth/verify?token=secret' }],
    });
    configMock.get.mockReturnValue('production');
    expect(() => authService.getDevelopmentMailbox('test@example.com')).toThrow();
  });

  it('rejects duplicate registration emails', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'existing-user', email: 'test@example.com', username: 'test' });

    await expect(authService.register({ email: 'test@example.com', username: 'test', password: 'password', gamerTag: 'test' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_EXISTS' }),
    });
  });

  describe('resetPassword', () => {
    it('rejects when id is invalid', async () => {
      prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(null);
      await expect(authService.resetPassword({ token: 'nope.secret', password: 'new' })).rejects.toThrow();
    });

    it('rejects when secret is invalid', async () => {
      const tokenRecord = { id: 't1', token_hash: 'hash', purpose: 'PASSWORD_RESET', consumed_at: null, expires_at: new Date(Date.now() + 10000), user_id: 'u1' };
      prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(tokenRecord);
      vi.spyOn(argon2, 'verify').mockResolvedValue(false);
      await expect(authService.resetPassword({ token: 't1.wrongsecret', password: 'new' })).rejects.toThrow();
    });

    it('rejects expired token', async () => {
      const tokenRecord = { id: 't2', token_hash: 'hash', purpose: 'PASSWORD_RESET', consumed_at: null, expires_at: new Date(Date.now() - 1000), user_id: 'u2' };
      prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(tokenRecord);
      await expect(authService.resetPassword({ token: 't2.secret', password: 'new' })).rejects.toThrow();
    });

    it('rejects consumed token', async () => {
      const tokenRecord = { id: 't3', token_hash: 'hash', purpose: 'PASSWORD_RESET', consumed_at: new Date(), expires_at: new Date(Date.now() + 10000), user_id: 'u3' };
      prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(tokenRecord);
      await expect(authService.resetPassword({ token: 't3.secret', password: 'new' })).rejects.toThrow();
    });

    it('successfully resets when token is valid', async () => {
      const tokenRecord = { id: 't4', token_hash: 'hash', purpose: 'PASSWORD_RESET', consumed_at: null, expires_at: new Date(Date.now() + 10000), user_id: 'u4' };
      prismaMock.verificationToken.findUnique = vi.fn().mockResolvedValue(tokenRecord);
      vi.spyOn(argon2, 'verify').mockResolvedValue(true);
      vi.spyOn(argon2, 'hash').mockResolvedValue('newHash');
      prismaMock.$transaction = vi.fn(async (cb: any) => cb({ user: { update: vi.fn().mockResolvedValue({}) }, session: { updateMany: vi.fn().mockResolvedValue({}) }, verificationToken: { update: vi.fn().mockResolvedValue({}) } }));

      const result = await authService.resetPassword({ token: 't4.secret', password: 'new' });
      expect(result).toEqual({ success: true });
    });
  });
});
