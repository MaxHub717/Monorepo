import { Module } from '@nestjs/common';
import { PenaltyController } from './penalty.controller.js';
import { PenaltyService } from './penalty.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';

@Module({
  imports: [PrismaModule, EventModule],
  controllers: [PenaltyController],
  providers: [PenaltyService],
})
export class PenaltyModule {}
