import { Controller, Get, Param, Patch, Post, Query, Req, UseGuards, Body } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequireOperatorScope, RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, OperatorScopeGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { FixtureService } from './fixture.service.js';
import { FixturePageQueryDto, ScheduleFixtureDto } from './fixture.dto.js';

@Controller('fixtures')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
export class FixtureController {
  constructor(private readonly fixtureService: FixtureService) {}

  @Get('seasons/:seasonId')
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  getSeasonScheduleStatus(@Param('seasonId') seasonId: string) {
    return this.fixtureService.getSeasonScheduleStatus(seasonId);
  }

  @Get('seasons/:seasonId/divisions/:divisionId')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  getDivisionWorkspace(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Query() query: FixturePageQueryDto,
  ) {
    return this.fixtureService.getDivisionFixtures(seasonId, divisionId, query);
  }

  @Post('seasons/:seasonId/divisions/:divisionId/generate')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
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

  @Post('seasons/:seasonId/divisions/:divisionId/schedule/generate')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  generateAppointments(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Req() req: any,
  ) {
    return this.fixtureService.generateDivisionScheduleAppointments(
      seasonId,
      divisionId,
      this.actor(req),
    );
  }

  @Post('seasons/:seasonId/divisions/:divisionId/schedule/validate')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  validateSchedule(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Req() req: any,
  ) {
    return this.fixtureService.validateDivisionSchedule(seasonId, divisionId, this.actor(req));
  }

  @Patch('seasons/:seasonId/divisions/:divisionId/fixtures/:fixtureId/schedule')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  scheduleFixture(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Param('fixtureId') fixtureId: string,
    @Body() dto: ScheduleFixtureDto,
    @Req() req: any,
  ) {
    return this.fixtureService.scheduleFixture(seasonId, divisionId, fixtureId, dto, this.actor(req));
  }

  @Post('seasons/:seasonId/divisions/:divisionId/lock')
  @UseGuards(OperatorScopeGuard)
  @RequirePermission(PermissionName.MANAGE_MATCHES)
  @RequireOperatorScope('divisionId')
  lockSchedule(
    @Param('seasonId') seasonId: string,
    @Param('divisionId') divisionId: string,
    @Req() req: any,
  ) {
    return this.fixtureService.lockDivisionSchedule(seasonId, divisionId, this.actor(req));
  }

  private actor(req: any) {
    return { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
  }
}
