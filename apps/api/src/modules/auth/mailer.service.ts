import { Injectable, Logger } from '@nestjs/common';

export interface MailerAdapter {
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}

@Injectable()
export class DevMailer implements MailerAdapter {
  private readonly logger = new Logger(DevMailer.name);

  async sendVerificationEmail(email: string, token: string) {
    this.logger.log(`[dev-mailer] verification email for ${email}: ${token}`);
  }

  async sendPasswordResetEmail(email: string, token: string) {
    this.logger.log(`[dev-mailer] password reset for ${email}: ${token}`);
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
}
