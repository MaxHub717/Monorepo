import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SeasonController } from './season.controller.js';
import { SeasonService } from './season.service.js';
import { EventModule } from '../events/event.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { FixtureService } from '../fixture/fixture.service.js';

@Module({
  imports: [PrismaModule, EventModule, AuditModule, AuthzModule],
  controllers: [SeasonController],
  providers: [SeasonService, FixtureService],
})
export class SeasonModule {}
