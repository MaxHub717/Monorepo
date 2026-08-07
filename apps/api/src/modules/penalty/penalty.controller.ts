import { Controller, Get, Post, UseGuards, Body, Req } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PenaltyService, CreatePenaltyDto } from './penalty.service.js';

interface AuthRequest {
  user?: { id?: string };
}

@Controller('penalties')
export class PenaltyController {
  constructor(private readonly penaltyService: PenaltyService) {}

  @Get()
  listPenalties() {
    return this.penaltyService.listPenalties();
  }

  @Post()
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_PENALTIES)
  createPenalty(@Body() dto: CreatePenaltyDto, @Req() req: AuthRequest) {
    const actor = { id: req.user?.id };
    return this.penaltyService.createPenalty(dto, actor);
  }
}
