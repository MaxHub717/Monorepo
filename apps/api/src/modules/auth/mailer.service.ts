import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export type DevelopmentMailMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
  verificationUrl: string;
  createdAt: string;
};

export interface MailerAdapter {
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
  getDevelopmentMessages?(email: string): DevelopmentMailMessage[];
}

@Injectable()
export class DevMailer implements MailerAdapter {
  private readonly logger = new Logger(DevMailer.name);
  private readonly inbox = new Map<string, DevelopmentMailMessage[]>();

  constructor(private readonly config: ConfigService = new ConfigService()) {}

  async sendVerificationEmail(email: string, token: string) {
    if (this.config.get('NODE_ENV') !== 'development') {
      throw new ServiceUnavailableException('Email delivery is not configured for this environment.');
    }

    const verificationUrl = new URL('/auth/verify', this.config.get('FRONTEND_BASE_URL', 'http://localhost:3001'));
    verificationUrl.searchParams.set('token', token);
    const message: DevelopmentMailMessage = {
      id: randomUUID(),
      to: email,
      subject: 'Verify your NexGen Esport account',
      text: `Verify your email address by opening: ${verificationUrl.toString()}`,
      verificationUrl: verificationUrl.toString(),
      createdAt: new Date().toISOString(),
    };
    const mailbox = this.inbox.get(email.toLowerCase()) ?? [];
    mailbox.push(message);
    this.inbox.set(email.toLowerCase(), mailbox);
    this.logger.log(`[dev-mailer] verification email queued for ${email}`);
  }

  async sendPasswordResetEmail(email: string, token: string) {
    this.logger.log(`[dev-mailer] password reset for ${email}: ${token}`);
  }

  getDevelopmentMessages(email: string) {
    return [...(this.inbox.get(email.toLowerCase()) ?? [])];
  }
}

@Injectable()
export class MailerService implements MailerAdapter {
  constructor(private readonly adapter: MailerAdapter = new DevMailer()) {}

  sendVerificationEmail(email: string, token: string) {
    return this.adapter.sendVerificationEmail(email, token);
  }

  sendPasswordResetEmail(email: string, token: string) {
    return this.adapter.sendPasswordResetEmail(email, token);
  }

  getDevelopmentMessages(email: string) {
    return this.adapter.getDevelopmentMessages?.(email) ?? [];
  }
}
