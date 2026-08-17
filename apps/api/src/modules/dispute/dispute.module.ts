import { Module } from '@nestjs/common';
import { DisputeController } from './dispute.controller.js';
import { DisputeService } from './dispute.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule],
  controllers: [DisputeController],
  providers: [DisputeService],
})
export class DisputeModule {}
