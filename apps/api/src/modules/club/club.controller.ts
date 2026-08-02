import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionName, RoleName } from '../../common/authz/authz.types.js';
import { CurrentUser, RequirePermission, RequireRole } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard, RolesGuard } from '../../common/authz/authz.guards.js';
import { ClubService } from './club.service.js';
import { CreateClubDto, UpdateClubDto, AssignClubStaffDto, ApplyClubApplicationDto, UpdateClubMemberStatusDto } from './dto/club.dto.js';

@Controller('clubs')
export class ClubController {
  constructor(private readonly clubService: ClubService) {}

  @Get()
  listClubs() {
    return this.clubService.listClubs();
  }

  @Post()
  @UseGuards(AuthGuard, AccountStatusGuard)
  createClub(@Body() dto: CreateClubDto, @CurrentUser('id') userId: string) {
    return this.clubService.createClub({ ...dto, ownerId: userId });
  }

  @Post(':id/applications')
  @UseGuards(AuthGuard, AccountStatusGuard)
  applyToClub(@Param('id') clubId: string, @Body() dto: ApplyClubApplicationDto, @CurrentUser('id') userId: string) {
    return this.clubService.applyToClub(clubId, userId, dto.note);
  }

  @Get(':id/applications')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_CLUBS)
  listClubApplications(@Param('id') clubId: string) {
    return this.clubService.listClubApplications(clubId);
  }

  @Post('applications/:applicationId/approve')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_CLUBS)
  approveClubApplication(@Param('applicationId') applicationId: string, @CurrentUser('id') actorId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.COMMISSIONER) ? RoleName.COMMISSIONER : roles.includes(RoleName.HQ_ADMIN) ? RoleName.HQ_ADMIN : roles[0];
    return this.clubService.approveClubApplication(applicationId, actorId, actorRole);
  }

  @Post('applications/:applicationId/reject')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_CLUBS)
  rejectClubApplication(@Param('applicationId') applicationId: string, @CurrentUser('id') actorId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.COMMISSIONER) ? RoleName.COMMISSIONER : roles.includes(RoleName.HQ_ADMIN) ? RoleName.HQ_ADMIN : roles[0];
    return this.clubService.rejectClubApplication(applicationId, actorId, actorRole);
  }

  @Delete(':id/members/:memberUserId')
  @UseGuards(AuthGuard, AccountStatusGuard)
  removeClubMember(@Param('id') clubId: string, @Param('memberUserId') memberUserId: string, @CurrentUser('id') actorId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.CLUB_MANAGER) ? RoleName.CLUB_MANAGER : roles[0] ?? RoleName.PLAYER;
    return this.clubService.removeClubMember(clubId, memberUserId, actorId, actorRole);
  }

  @Patch(':id/members/:memberUserId/status')
  @UseGuards(AuthGuard, AccountStatusGuard)
  updateClubMemberStatus(@Param('id') clubId: string, @Param('memberUserId') memberUserId: string, @Body() dto: UpdateClubMemberStatusDto, @CurrentUser('id') actorId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.CLUB_MANAGER) ? RoleName.CLUB_MANAGER : roles[0] ?? RoleName.PLAYER;
    return this.clubService.updateClubMemberStatus(clubId, memberUserId, dto.status, actorId, actorRole);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AccountStatusGuard)
  updateClub(@Param('id') clubId: string, @Body() dto: UpdateClubDto, @CurrentUser('id') userId: string) {
    return this.clubService.updateClub(clubId, userId, dto);
  }

  @Post(':id/staff')
  @UseGuards(AuthGuard, AccountStatusGuard)
  assignClubStaff(@Param('id') clubId: string, @Body() dto: AssignClubStaffDto, @CurrentUser('id') userId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.CLUB_MANAGER) ? RoleName.CLUB_MANAGER : roles[0] ?? RoleName.PLAYER;
    return this.clubService.assignClubStaff(clubId, userId, dto, actorRole);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_CLUBS)
  updateClubStatus(@Param('id') clubId: string, @Body('status') status: string, @CurrentUser('id') actorId: string, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles.includes(RoleName.COMMISSIONER) ? RoleName.COMMISSIONER : roles.includes(RoleName.HQ_ADMIN) ? RoleName.HQ_ADMIN : roles[0];
    return this.clubService.updateClubStatus(clubId, status, actorId, actorRole);
  }
}
