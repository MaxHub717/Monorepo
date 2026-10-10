import { Module } from '@nestjs/common';
import { PenaltyController } from './penalty.controller.js';
import { PenaltyEffectsService, PenaltyService } from './penalty.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule],
  controllers: [PenaltyController],
  providers: [PenaltyService, PenaltyEffectsService],
})
export class PenaltyModule {}
