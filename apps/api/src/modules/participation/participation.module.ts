import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { ParticipationController, ParticipationWithdrawalController } from './participation.controller.js';
import { ParticipationService } from './participation.service.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule],
  controllers: [ParticipationController, ParticipationWithdrawalController],
  providers: [ParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}
