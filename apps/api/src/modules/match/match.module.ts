import { Module } from '@nestjs/common';
import { MatchController } from './match.controller.js';
import { MatchService } from './match.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule],
  controllers: [MatchController],
  providers: [MatchService],
})
export class MatchModule {}
