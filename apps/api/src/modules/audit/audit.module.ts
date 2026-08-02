import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditSubscriber } from './audit.subscriber.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  providers: [AuditService, AuditSubscriber, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
