import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventModule } from '../events/event.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { FixtureController } from './fixture.controller.js';
import { FixtureService } from './fixture.service.js';

@Module({
  imports: [PrismaModule, EventModule, AuthzModule],
  controllers: [FixtureController],
  providers: [FixtureService],
  exports: [FixtureService],
})
export class FixtureModule {}
