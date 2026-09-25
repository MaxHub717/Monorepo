import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { ParticipationController, ParticipationWithdrawalController } from './participation.controller.js';
import { ParticipationService } from './participation.service.js';
import { AdminParticipationController } from './admin-participation.controller.js';
import { AdminParticipationService } from './admin-participation.service.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule, AuditModule],
  controllers: [ParticipationController, ParticipationWithdrawalController, AdminParticipationController],
  providers: [ParticipationService, AdminParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}
