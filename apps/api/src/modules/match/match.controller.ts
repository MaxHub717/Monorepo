import { Body, Controller, Get, Post, UseGuards, Param, Req } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission, RequireOperatorScope } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard, OperatorScopeGuard } from '../../common/authz/authz.guards.js';
import { MatchService, CreateMatchDto, SubmitMatchResultDto } from './match.service.js';

interface AuthRequest {
  user?: { id?: string };
}

@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get()
  listMatches() {
    return this.matchService.listMatches();
  }

  @Post()
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard, OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  createMatch(@Body() dto: CreateMatchDto) {
    return this.matchService.createMatch(dto);
  }

  @Post('submit-result')
  @UseGuards(AuthGuard, AccountStatusGuard)
  async submitResult(@Body() dto: SubmitMatchResultDto, @Req() req: AuthRequest) {
    // allow submitters to attribute themselves
    if (!dto.submittedById && req.user?.id) dto.submittedById = req.user.id;
    return this.matchService.submitMatchResult(dto);
  }

  @Post(':id/confirm')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_RESULTS)
  async confirmResult(@Param('id') id: string) {
    return this.matchService.confirmMatchResult(id);
  }
}
