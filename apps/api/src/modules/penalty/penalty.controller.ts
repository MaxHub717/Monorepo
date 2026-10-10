import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { CreatePenaltyDto, PenaltyService, UpdatePenaltyStatusDto } from './penalty.service.js';
import type { PenaltyActor } from './penalty.service.js';
import type { AuthUser } from '../../common/authz/authz.types.js';

interface AuthRequest {
  id?: string;
  user?: AuthUser;
}

@Controller('penalties')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
@RequirePermission(PermissionName.MANAGE_PENALTIES)
export class PenaltyController {
  constructor(private readonly penaltyService: PenaltyService) {}

  @Get()
  listPenalties() {
    return this.penaltyService.listPenalties();
  }

  @Get(':penaltyId')
  getPenalty(@Param('penaltyId', new ParseUUIDPipe()) penaltyId: string) {
    return this.penaltyService.getPenalty(penaltyId);
  }

  @Post()
  createPenalty(@Body() dto: CreatePenaltyDto, @Req() req: AuthRequest) {
    return this.penaltyService.createPenalty(dto, this.actor(req));
  }

  @Patch(':penaltyId/status')
  updatePenaltyStatus(
    @Param('penaltyId', new ParseUUIDPipe()) penaltyId: string,
    @Body() dto: UpdatePenaltyStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.penaltyService.updatePenaltyStatus(penaltyId, dto, this.actor(req));
  }

  private actor(request: AuthRequest): PenaltyActor {
    return {
      id: request.user?.id,
      role: request.user?.roles[0],
      permissions: request.user?.permissions,
      requestId: request.id,
    };
  }
}
