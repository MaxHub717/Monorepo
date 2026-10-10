import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { CompetitionService } from './competition.service.js';

export class RecordSeriesCheckInDto {
  @IsOptional()
  @IsBoolean()
  isException?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  evidenceUrl?: string;
}

export class AdjustSeriesScheduleDto {
  @IsDateString()
  matchWindowStartAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordGameResultDto {
  @IsIn(['HOME_WIN', 'AWAY_WIN', 'DRAW', 'UNRESOLVED'])
  result!: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';

  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateGameScoreDto {
  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;
}

export class VerifyGameResultDto {
  @IsIn(['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'])
  status!: 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OverrideGameResultDto {
  @IsIn(['HOME_WIN', 'AWAY_WIN', 'DRAW', 'UNRESOLVED'])
  result!: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'UNRESOLVED';

  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;
}

@Controller('competition')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
@RequirePermission(PermissionName.MANAGE_MATCHES)
export class CompetitionController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Get('seasons/:seasonId/workspace')
  getWorkspace(@Param('seasonId') seasonId: string, @Req() request: any) {
    return this.competitionService.getWorkspace(
      seasonId,
      request.user?.permissions?.includes(PermissionName.MANAGE_COMPETITION_EXCEPTIONS) ?? false,
    );
  }

  @Post('seasons/:seasonId/schedule/generate')
  generateSchedule(@Param('seasonId') seasonId: string, @Req() request: any) {
    return this.competitionService.generateSchedule(seasonId, this.actor(request));
  }

  @Post('seasons/:seasonId/schedule/validate')
  validateSchedule(@Param('seasonId') seasonId: string) {
    return this.competitionService.validateSchedule(seasonId);
  }

  @Post('seasons/:seasonId/schedule/lock')
  lockSchedule(@Param('seasonId') seasonId: string, @Req() request: any) {
    return this.competitionService.lockSchedule(seasonId, this.actor(request));
  }

  @Post('phases/:phaseId/next-phase')
  @Post('phases/:phaseId/generate-next-phase')
  generateNextPhase(@Param('phaseId', new ParseUUIDPipe()) phaseId: string, @Req() request: any) {
    return this.competitionService.generateNextPhase(phaseId, this.actor(request));
  }

  @Post('phases/:phaseId/transition')
  generatePhaseTransition(@Param('phaseId', new ParseUUIDPipe()) phaseId: string, @Req() request: any) {
    return this.competitionService.generatePhaseTransition(phaseId, this.actor(request));
  }

  @Post('phases/:phaseId/complete')
  completePhase(@Param('phaseId', new ParseUUIDPipe()) phaseId: string, @Req() request: any) {
    return this.competitionService.completePhase(phaseId, this.actor(request));
  }

  @Patch('series/:seriesId/schedule')
  adjustSchedule(
    @Param('seriesId') seriesId: string,
    @Body() dto: AdjustSeriesScheduleDto,
    @Req() request: any,
  ) {
    return this.competitionService.adjustSchedule(seriesId, dto, this.actor(request));
  }

  @Post('series/:seriesId/check-ins/:playerId')
  recordSeriesCheckIn(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Body() dto: RecordSeriesCheckInDto,
    @Req() request: any,
  ) {
    return this.competitionService.recordSeriesCheckIn(seriesId, playerId, dto, this.actor(request));
  }

  @Post('series/:seriesId/start')
  startSeries(@Param('seriesId', new ParseUUIDPipe()) seriesId: string, @Req() request: any) {
    return this.competitionService.startSeries(seriesId, this.actor(request));
  }

  @Get('series/:seriesId/execution')
  getSeriesExecutionWorkspace(@Param('seriesId', new ParseUUIDPipe()) seriesId: string, @Req() request: any) {
    return this.competitionService.getSeriesExecutionWorkspace(
      seriesId,
      request.user?.permissions?.includes(PermissionName.OVERRIDE_COMPETITION_RESULTS) ?? false,
    );
  }

  @Post('series/:seriesId/games/:gameId/start')
  startGame(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('gameId', new ParseUUIDPipe()) gameId: string,
    @Req() request: any,
  ) {
    return this.competitionService.startGame(seriesId, gameId, this.actor(request));
  }

  @Patch('series/:seriesId/games/:gameId/score')
  updateGameScore(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('gameId', new ParseUUIDPipe()) gameId: string,
    @Body() dto: UpdateGameScoreDto,
    @Req() request: any,
  ) {
    return this.competitionService.updateGameScore(seriesId, gameId, dto, this.actor(request));
  }

  @Post('series/:seriesId/games/:gameId/complete')
  completeGame(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('gameId', new ParseUUIDPipe()) gameId: string,
    @Body() dto: RecordGameResultDto,
    @Req() request: any,
  ) {
    return this.competitionService.completeGame(seriesId, gameId, dto, this.actor(request));
  }

  @Post('series/:seriesId/games/:gameId/verification')
  @RequirePermission(PermissionName.MANAGE_RESULTS)
  verifyGameResult(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('gameId', new ParseUUIDPipe()) gameId: string,
    @Body() dto: VerifyGameResultDto,
    @Req() request: any,
  ) {
    return this.competitionService.verifyGameResult(seriesId, gameId, dto, this.actor(request));
  }

  @Post('series/:seriesId/games/:gameId/override')
  @RequirePermission(PermissionName.OVERRIDE_COMPETITION_RESULTS)
  overrideGameResult(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('gameId', new ParseUUIDPipe()) gameId: string,
    @Body() dto: OverrideGameResultDto,
    @Req() request: any,
  ) {
    return this.competitionService.overrideGameResult(seriesId, gameId, dto, this.actor(request));
  }

  @Post('series/:seriesId/complete')
  completeSeries(@Param('seriesId', new ParseUUIDPipe()) seriesId: string, @Req() request: any) {
    return this.competitionService.completeSeries(seriesId, this.actor(request));
  }

  private actor(request: any) {
    return {
      id: request.user?.id,
      role: request.user?.roles?.[0],
      requestId: request.id,
      permissions: request.user?.permissions ?? [],
    };
  }
}