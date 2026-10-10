import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AccountStatusGuard, AuthGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PermissionName } from '../../common/authz/authz.types.js';
import { CompetitionService } from './competition.service.js';

export class CreateCompetitionRulesetDto {
  @IsString()
  name!: string;

  @IsString()
  version!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  rules!: Record<string, unknown>;

  @IsOptional()
  @IsUUID('4')
  supersedesRulesetId?: string;
}

export class UpdateCompetitionRulesetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
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

  @Get()
  listRulesets(@Query('publishedOnly') publishedOnly?: string) {
    return this.competitionService.listRulesets(publishedOnly === 'true');
  }

  @Post()
  createRuleset(@Body() dto: CreateCompetitionRulesetDto, @Req() request: any) {
    return this.competitionService.createRuleset(dto, this.actor(request));
  }

  @Get(':rulesetId/preview')
  previewRuleset(@Param('rulesetId') rulesetId: string) {
    return this.competitionService.previewRuleset(rulesetId);
  }

  @Put(':rulesetId')
  updateDraft(
    @Param('rulesetId') rulesetId: string,
    @Body() dto: UpdateCompetitionRulesetDto,
    @Req() request: any,
  ) {
    return this.competitionService.updateDraftRuleset(rulesetId, dto, this.actor(request));
  }

  @Post(':rulesetId/publish')
  publishRuleset(@Param('rulesetId') rulesetId: string, @Req() request: any) {
    return this.competitionService.publishRuleset(rulesetId, this.actor(request));
  }

  private actor(request: any) {
    return { id: request.user?.id, role: request.user?.roles?.[0], requestId: request.id };
  }
}