import { Body, Controller, Get, Post, UseGuards, Req, Param, Patch, Delete } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { SeasonService } from './season.service.js';
import { CreateDivisionDto, CreateSeasonDto, UpdateDivisionDto } from './dto/season.dto.js';

@Controller('seasons')
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  @Get()
  listSeasons() {
    return this.seasonService.listSeasons();
  }

  @Post()
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  createSeason(@Body() dto: CreateSeasonDto, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], requestId: req.id };
    return this.seasonService.createSeason(dto, actor);
  }

  @Post(':id/publish')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  publishSeason(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.publishSeason(id, actor);
  }

  @Post(':id/close-registration')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  closeRegistration(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.closeRegistration(id, actor);
  }

  @Post(':id/lock-roster')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  lockRoster(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.lockRoster(id, actor);
  }

  @Post(':id/activate')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  activateSeason(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.activateSeason(id, actor);
  }

  @Post(':id/start-playoffs')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  startPlayoffs(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.startPlayoffs(id, actor);
  }

  @Post(':id/complete')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  completeSeason(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.completeSeason(id, actor);
  }

  @Post(':id/archive')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  archiveSeason(@Param('id') id: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.archiveSeason(id, actor);
  }

  // Division endpoints
  @Post(':id/divisions')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  createDivision(@Param('id') id: string, @Body() body: CreateDivisionDto, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.createDivision(id, body, actor);
  }

  @Patch('divisions/:divisionId')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  updateDivision(@Param('divisionId') divisionId: string, @Body() body: UpdateDivisionDto, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.updateDivision(divisionId, body, actor);
  }

  @Delete('divisions/:divisionId')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  deactivateDivision(@Param('divisionId') divisionId: string, @Req() req: any) {
    const actor = { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
    return this.seasonService.deactivateDivision(divisionId, actor);
  }
}
