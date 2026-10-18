import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/authz/authz.decorators.js';
import { PublicLeagueService } from './public-league.service.js';

@Controller('leagues/public')
export class PublicLeagueController {
  constructor(private readonly leagueService: PublicLeagueService) {}

  @Public()
  @Get()
  listPublicLeagues() {
    return this.leagueService.listPublicLeagues();
  }

  @Public()
  @Get(':id')
  getPublicLeague(@Param('id') id: string) {
    return this.leagueService.getPublicLeague(id);
  }
}