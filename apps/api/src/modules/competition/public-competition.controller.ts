import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/authz/authz.decorators.js';
import { CompetitionService } from './competition.service.js';

@Controller('competition/public')
export class PublicCompetitionController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Public()
  @Get('seasons/:seasonId/schedule')
  getPublicSeasonSchedule(@Param('seasonId') seasonId: string) {
    return this.competitionService.getPublicSeasonSchedule(seasonId);
  }

  @Public()
  @Get('series/:seriesId')
  getPublicSeriesDetail(@Param('seriesId') seriesId: string) {
    return this.competitionService.getPublicSeriesDetail(seriesId);
  }

  @Public()
  @Get('seasons/:seasonId/results')
  getPublicSeasonResults(@Param('seasonId') seasonId: string) {
    return this.competitionService.getPublicSeasonResults(seasonId);
  }
}