import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SeasonController } from './season.controller.js';
import { SeasonService } from './season.service.js';
import { EventModule } from '../events/event.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuditModule],
  controllers: [SeasonController],
  providers: [SeasonService],
})
export class SeasonModule {}
