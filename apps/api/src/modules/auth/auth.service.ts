import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { MailerService } from './mailer.service.js';
import { RoleName } from '../../common/authz/authz.types.js';

interface AuthPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly mailerService: MailerService,
  ) {}

  async register(input: { email: string; username: string; password: string; gamerTag: string }) {
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
    });

    if (existingUser?.email === input.email) {
      throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'An account with that email already exists.' });
    }

    if (existingUser?.username === input.username) {
      throw new ConflictException({ code: 'USERNAME_EXISTS', message: 'That username is already taken.' });
    }

    const hashedPassword = await argon2.hash(input.password);

    return this.prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          password_hash: hashedPassword,
          account_status: 'PENDING',
        },
      });

      await tx.playerProfile.create({
        data: {
          user_id: user.id,
          gamer_tag: input.gamerTag,
        },
      });

      const playerRole = await tx.role.findUnique({ where: { name: RoleName.PLAYER } });
      if (playerRole) {
        await tx.userRole.create({ data: { user_id: user.id, role_id: playerRole.id } });
      }

      // create deterministic token with id.secret pattern
      const secret = crypto.randomBytes(24).toString('hex');
      const id = crypto.randomUUID();
      const token = `${id}.${secret}`;
      const tokenHash = await argon2.hash(secret);
      await tx.verificationToken.create({
        data: {
          id,
          user_id: user.id,
          purpose: 'EMAIL_VERIFY',
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      await this.outboxService.enqueueEvent(tx, {
        eventName: 'user.registered',
        aggregateType: 'User',
        aggregateId: user.id,
        metadata: { email: input.email, username: input.username, gamerTag: input.gamerTag },
      });

      await this.mailerService.sendVerificationEmail(input.email, token);

      return { userId: user.id, status: 'pending' };
    });
  }

  async verifyEmail(input: { token: string }) {
    const parts = input.token.split('.');
    if (parts.length !== 2) throw new BadRequestException('Verification token is invalid or expired');
    const [id, secret] = parts;

    const tokenRecord = await this.prisma.verificationToken.findUnique({ where: { id } });

    if (!tokenRecord || tokenRecord.purpose !== 'EMAIL_VERIFY' || tokenRecord.expires_at <= new Date() || tokenRecord.consumed_at) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    const matches = await argon2.verify(tokenRecord.token_hash, secret);
    if (!matches) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: tokenRecord.user_id },
        data: { account_status: 'ACTIVE', email_verified_at: new Date() },
      });
      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { consumed_at: new Date() },
      });
      await this.outboxService.enqueueEvent(tx, {
        eventName: 'user.verified',
        aggregateType: 'User',
        aggregateId: tokenRecord.user_id,
      });
    });

    return { success: true };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    const secret = crypto.randomBytes(24).toString('hex');
    const id = crypto.randomUUID();
    const token = `${id}.${secret}`;
    const tokenHash = await argon2.hash(secret);
    await this.prisma.verificationToken.create({
      data: {
        id,
        user_id: user.id,
        purpose: 'EMAIL_VERIFY',
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await this.mailerService.sendVerificationEmail(email, token);
    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { success: true };
    const secret = crypto.randomBytes(24).toString('hex');
    const id = crypto.randomUUID();
    const token = `${id}.${secret}`;
    const tokenHash = await argon2.hash(secret);
    await this.prisma.verificationToken.create({
      data: {
        id,
        user_id: user.id,
        purpose: 'PASSWORD_RESET',
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await this.mailerService.sendPasswordResetEmail(email, token);
    return { success: true };
  }

  async resetPassword(input: { token: string; password: string }) {
    const tokenRecord = await this.prisma.verificationToken.findFirst({
      where: { purpose: 'PASSWORD_RESET', expires_at: { gt: new Date() }, consumed_at: null },
    });

    if (!tokenRecord) throw new BadRequestException('Reset token is invalid or expired');

    const matches = await argon2.verify(tokenRecord.token_hash, input.token);
    if (!matches) throw new BadRequestException('Reset token is invalid or expired');

    const hashedPassword = await argon2.hash(input.password);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.user.update({ where: { id: tokenRecord.user_id }, data: { password_hash: hashedPassword } });
      await tx.session.updateMany({ where: { user_id: tokenRecord.user_id, revoked_at: null }, data: { revoked_at: new Date() } });
      await tx.verificationToken.update({ where: { id: tokenRecord.id }, data: { consumed_at: new Date() } });
    });

    // emit outbox/audit outside tx
    try {
      await this.outboxService.enqueueEventDirect?.({
        eventName: 'user.password_reset',
        aggregateType: 'User',
        aggregateId: tokenRecord.user_id,
        actorId: tokenRecord.user_id,
      } as any);
    } catch {}

    return { success: true };
  }

  async login(input: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      // emit failed login audit/outbox
      await this.outboxService.enqueueEventDirect?.({
        eventName: 'user.login_failed',
        aggregateType: 'User',
        aggregateId: input.email,
        metadata: { reason: 'user not found' },
      } as any).catch(() => null);
      throw new UnauthorizedException('Invalid email or password');
    }

    const loginAttempt = await this.prisma.loginAttempt.findFirst({ where: { user_id: user.id } });
    const now = new Date();
    if (loginAttempt?.locked_until && loginAttempt.locked_until > now) {
      throw new UnauthorizedException('Account is temporarily locked');
    }

    const passwordMatches = await argon2.verify(user.password_hash, input.password);
    if (!passwordMatches) {
      const nextAttempts = (loginAttempt?.attempts ?? 0) + 1;
      if (loginAttempt) {
        await this.prisma.loginAttempt.update({
          where: { id: loginAttempt.id },
          data: { attempts: nextAttempts, locked_until: nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null },
        });
      } else {
        await this.prisma.loginAttempt.create({ data: { user_id: user.id, attempts: 1 } });
      }
      await this.outboxService.enqueueEventDirect?.({
        eventName: 'user.login_failed',
        aggregateType: 'User',
        aggregateId: user.id,
        actorId: user.id,
        metadata: { reason: 'invalid_password' },
      } as any).catch(() => null);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (loginAttempt) {
      await this.prisma.loginAttempt.update({ where: { id: loginAttempt.id }, data: { attempts: 0, locked_until: null } });
    }

    if (user.account_status !== 'ACTIVE' || !user.email_verified_at) {
      throw new UnauthorizedException('Account is not active or verified');
    }

    const accessToken = this.createAccessToken(user.id, user.email);
    const refreshToken = this.createRefreshToken(user.id, user.email);
    const refreshHash = await argon2.hash(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_hash: refreshHash,
        expires_at: expiresAt,
      },
    });

    // successful login audit/outbox
    await this.outboxService.enqueueEventDirect?.({
      eventName: 'user.login_success',
      aggregateType: 'User',
      aggregateId: user.id,
      actorId: user.id,
      actorRole: RoleName.PLAYER,
    } as any).catch(() => null);

    const roles = await this.prisma.userRole.findMany({ where: { user_id: user.id }, include: { role: true } });
    const role = roles[0]?.role?.name ?? RoleName.PLAYER;

    return { accessToken, refreshToken, userId: user.id, role };
  }

  private verifyRefreshToken(token: string): AuthPayload {
    const secret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const decoded = jwt.verify(token, secret);

    if (typeof decoded !== 'object' || decoded === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload = decoded as AuthPayload;
    if (!payload.sub || !payload.email || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  async refresh(input: { refreshToken: string }) {
    const payload = this.verifyRefreshToken(input.refreshToken);

    const session = await this.prisma.session.findFirst({
      where: {
        user_id: payload.sub,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
    });

    if (!session || !(await argon2.verify(session.refresh_hash, input.refreshToken))) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    const accessToken = this.createAccessToken(payload.sub, payload.email);
    const refreshToken = this.createRefreshToken(payload.sub, payload.email);
    const refreshHash = await argon2.hash(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refresh_hash: refreshHash, expires_at: expiresAt },
    });

    return { accessToken, refreshToken };
  }

  async logout(input: { refreshToken: string }) {
    const payload = this.verifyRefreshToken(input.refreshToken);

    const session = await this.prisma.session.findFirst({
      where: {
        user_id: payload.sub,
        revoked_at: null,
      },
    });

    if (!session || !(await argon2.verify(session.refresh_hash, input.refreshToken))) {
      throw new UnauthorizedException('Refresh token not recognized');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revoked_at: new Date() },
    });

    return { success: true };
  }

  createAccessToken(userId: string, email: string) {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return jwt.sign({ sub: userId, email, type: 'access' }, secret, {
      expiresIn: '15m',
    });
  }

  createRefreshToken(userId: string, email: string) {
    const secret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    return jwt.sign({ sub: userId, email, type: 'refresh' }, secret, {
      expiresIn: '30d',
    });
  }
}
