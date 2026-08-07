import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MailerService, DevMailer } from './mailer.service.js';

@Module({
  imports: [PrismaModule, EventModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: MailerService, useClass: DevMailer }],
})
export class AuthModule {}
