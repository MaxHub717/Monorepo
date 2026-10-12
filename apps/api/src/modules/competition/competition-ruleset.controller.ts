import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Public, RequirePermission } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PermissionName } from '../../common/authz/authz.types.js';
import { CompetitionService } from './competition.service.js';

export class SaveSeasonRulesDto {
  @IsObject()
  rules!: Record<string, unknown>;
}

@Controller('competition/rulesets')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
@RequirePermission(PermissionName.MANAGE_SEASONS)
export class CompetitionRulesetController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Get('defaults')
  getDefaults() {
    return this.competitionService.getDefaultRulesetTemplate();
  }

}

@Controller('seasons/:seasonId/rules')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
@RequirePermission(PermissionName.MANAGE_SEASONS)
export class SeasonRulesController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Get()
  getSeasonRules(@Param('seasonId') seasonId: string) {
    return this.competitionService.getSeasonRules(seasonId);
  }

  @Public()
  @Get('player-facing')
  getPlayerFacingRules(@Param('seasonId') seasonId: string) {
    return this.competitionService.getPlayerFacingSeasonRules(seasonId);
  }

  @Put()
  saveSeasonRules(@Param('seasonId') seasonId: string, @Body() dto: SaveSeasonRulesDto, @Req() request: any) {
    return this.competitionService.saveSeasonRules(seasonId, dto.rules, this.actor(request));
  }

  @Get('preview')
  previewSeasonRules(@Param('seasonId') seasonId: string) {
    return this.competitionService.previewSeasonRules(seasonId);
  }

  @Post('publish')
  publishSeasonRules(@Param('seasonId') seasonId: string, @Req() request: any) {
    return this.competitionService.publishSeasonRules(seasonId, this.actor(request));
  }

  private actor(request: any) {
    return { id: request.user?.id, role: request.user?.roles?.[0], requestId: request.id };
  }
}