import { Module } from '@nestjs/common';
import { PlayerController } from './player.controller.js';
import { PlayerService } from './player.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { EventModule } from '../events/event.module.js';

@Module({
  imports: [PrismaModule, AuditModule, EventModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
