import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';

const createPrismaMock = () => ({
  $transaction: vi.fn((callback: any) => callback({
    user: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    playerProfile: { create: vi.fn() },
    userRole: { create: vi.fn() },
    verificationToken: { create: vi.fn(), update: vi.fn() },
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

  beforeEach(() => {
    prismaMock = createPrismaMock();
    configMock = createConfigMock();
    authService = new AuthService(
      prismaMock as any,
      configMock as any,
      { enqueueEvent: vi.fn() } as any,
      { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() } as any,
    );
  });

  it('creates a user record during registration', async () => {
    const input = { email: 'test@example.com', username: 'test', password: 'password', gamerTag: 'test' };
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      user: { create: vi.fn().mockResolvedValue({ id: 'user-id' }), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      playerProfile: { create: vi.fn() },
      userRole: { create: vi.fn() },
      verificationToken: { create: vi.fn(), update: vi.fn() },
      outboxEvent: { create: vi.fn() },
      session: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      loginAttempt: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      role: { findUnique: vi.fn().mockResolvedValue(null) },
    }));
    vi.spyOn(argon2, 'hash').mockResolvedValue('hashed');

    const result = await authService.register(input);
    expect(result).toEqual({ userId: 'user-id', status: 'pending' });
  });

  it('rejects duplicate registration emails', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'existing-user', email: 'test@example.com', username: 'test' });

    await expect(authService.register({ email: 'test@example.com', username: 'test', password: 'password', gamerTag: 'test' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_EXISTS' }),
    });
  });
});
