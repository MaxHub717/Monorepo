import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditSubscriber } from './audit.subscriber.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditSubscriber],
  exports: [AuditService],
})
export class AuditModule {}
