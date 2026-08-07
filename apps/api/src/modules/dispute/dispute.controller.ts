import { Controller, Get, Post, UseGuards, Body, Req } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import { DisputeService, CreateDisputeDto } from './dispute.service.js';

interface AuthRequest {
  user?: { id?: string };
}

@Controller('disputes')
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Get()
  listDisputes() {
    return this.disputeService.listDisputes();
  }

  @Post()
  @UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  createDispute(@Body() dto: CreateDisputeDto, @Req() req: AuthRequest) {
    const actor = { id: req.user?.id };
    return this.disputeService.createDispute(dto, actor);
  }
}
