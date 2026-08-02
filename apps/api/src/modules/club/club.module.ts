import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ClubController } from './club.controller.js';
import { ClubService } from './club.service.js';

@Module({
  imports: [PrismaModule, EventModule, AuditModule],
  controllers: [ClubController],
  providers: [ClubService],
})
export class ClubModule {}
