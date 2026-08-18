import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { FixtureService } from './fixture.service.js';

@Controller('fixtures')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
export class FixtureController {
  constructor(private readonly fixtureService: FixtureService) {}

  @Post('seasons/:seasonId/divisions/:divisionId/generate')
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  generate(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Req() req: any,
  ) {
    return this.fixtureService.generateDivisionSchedule(seasonId, divisionId, {
      id: req.user?.id,
      role: req.user?.roles?.[0],
      correlationId: req.id,
    });
  }
}
