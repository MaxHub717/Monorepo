import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AccountStatusGuard } from '../../common/authz/authz.guards.js';
import { StandingsService } from './standings.service.js';

@Controller('standings')
@UseGuards(AuthGuard, AccountStatusGuard)
export class StandingsController {
  constructor(private readonly standingsService: StandingsService) {}

  @Get('seasons/:id')
  getSeasonStandings(@Param('id') id: string, @Query('divisionId') divisionId?: string) {
    return this.standingsService.getSeasonStandings(id, divisionId);
  }

  @Get('leaderboards')
  getLeaderboards() {
    return this.standingsService.getLeaderboards();
  }
}
