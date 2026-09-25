import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PermissionName } from '../../common/authz/authz.types.js';
import { AdminBulkRegisterParticipantDto, AdminBulkUpdateParticipantDto, AdminRegisterParticipantDto, AdminUpdateParticipantDto } from './dto/admin-participation.dto.js';
import { AdminParticipationService } from './admin-participation.service.js';

@Controller('admin/seasons/:seasonId/participants')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
@RequirePermission(PermissionName.MANAGE_SEASONS)
export class AdminParticipationController {
  constructor(private readonly adminParticipation: AdminParticipationService) {}

  @Get()
  list(@Param('seasonId') seasonId: string) {
    return this.adminParticipation.listParticipants(seasonId);
  }

  @Post()
  register(@Param('seasonId') seasonId: string, @Body() dto: AdminRegisterParticipantDto, @Req() req: any) {
    return this.adminParticipation.register(seasonId, dto, this.actor(req));
  }

  @Post('bulk')
  bulkRegister(@Param('seasonId') seasonId: string, @Body() dto: AdminBulkRegisterParticipantDto, @Req() req: any) {
    return this.adminParticipation.bulkRegister(seasonId, dto, this.actor(req));
  }

  @Patch(':participantId')
  update(@Param('seasonId') seasonId: string, @Param('participantId') participantId: string, @Body() dto: AdminUpdateParticipantDto, @Req() req: any) {
    return this.adminParticipation.update(seasonId, participantId, dto, this.actor(req));
  }

  @Patch('bulk')
  bulkUpdate(@Param('seasonId') seasonId: string, @Body() dto: AdminBulkUpdateParticipantDto, @Req() req: any) {
    return this.adminParticipation.bulkUpdate(seasonId, dto, this.actor(req));
  }

  private actor(req: any) {
    return { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
  }
}