import { Module } from '@nestjs/common';
import { StandingsController } from './standings.controller.js';
import { StandingsService } from './standings.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [StandingsController],
  providers: [StandingsService],
})
export class StandingsModule {}
