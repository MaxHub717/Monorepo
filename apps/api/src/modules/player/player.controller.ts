import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequireRole } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, OwnershipGuard, RolesGuard } from '../../common/authz/authz.guards.js';
import { RoleName } from '../../common/authz/authz.types.js';
import { PlayerService } from './player.service.js';
import { UpdatePlayerProfileDto } from './dto/player-profile.dto.js';

@Controller('players')
@UseGuards(AuthGuard, AccountStatusGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('recruitment-pool')
  @UseGuards(RolesGuard)
  @RequireRole(RoleName.CLUB_MANAGER, RoleName.COMMISSIONER, RoleName.HQ_ADMIN)
  listRecruitmentPool(@Query('division') division?: string, @Query('region') region?: string) {
    return this.playerService.listRecruitmentPool({ division, region });
  }

  @Get(':id')
  getPlayer(@Param('id') id: string, @CurrentUser('id') requesterId: string, @CurrentUser('roles') requesterRoles: string[]) {
    return this.playerService.getPlayer(id, requesterId, requesterRoles);
  }

  @Get('me/profile')
  getMyProfile(@CurrentUser('id') userId: string) {
    return this.playerService.getProfileByUserId(userId);
  }

  @Patch('me/profile')
  updateMyProfile(@CurrentUser('id') userId: string, @Body() dto: UpdatePlayerProfileDto, @CurrentUser('roles') roles: string[]) {
    const actorRole = roles[0] ?? 'PLAYER';
    return this.playerService.updateProfile(userId, dto, userId, actorRole);
  }

  @Get(':id/career')
  getCareer(@Param('id') id: string) {
    return this.playerService.getCareer(id);
  }
}
