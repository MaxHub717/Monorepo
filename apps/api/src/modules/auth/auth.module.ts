import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../events/outbox.service.js';
import { MailerService, DevMailer } from './mailer.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, OutboxService, { provide: MailerService, useClass: DevMailer }],
})
export class AuthModule {}
