import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicLeagueController } from './public-league.controller.js';
import { PublicLeagueService } from './public-league.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicLeagueController],
  providers: [PublicLeagueService],
})
export class LeagueModule {}