import { Module } from '@nestjs/common';
import { StandingsController } from './standings.controller.js';
import { StandingsService } from './standings.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthzModule,
  ],
  controllers: [StandingsController],
  providers: [StandingsService],
})
export class StandingsModule {}