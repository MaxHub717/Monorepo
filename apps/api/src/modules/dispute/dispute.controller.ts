import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PermissionName } from '../../common/authz/authz.types.js';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../common/authz/authz.guards.js';
import {
  AddDisputeEvidenceDto,
  AssignDisputeDto,
  CloseDisputeDto,
  CreateDisputeDto,
  DisputeDecisionDto,
  DisputeInvestigationNoteDto,
  DisputeService,
} from './dispute.service.js';
import type { AuthUser } from '../../common/authz/authz.types.js';
import type { DisputeActor } from './dispute.service.js';

interface AuthRequest {
  id?: string;
  user?: AuthUser;
}

@Controller('disputes')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Get()
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  listDisputes() {
    return this.disputeService.listDisputes();
  }

  @Get(':disputeId')
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  getDispute(@Param('disputeId', new ParseUUIDPipe()) disputeId: string) {
    return this.disputeService.getDispute(disputeId);
  }

  @Post()
  createDispute(@Body() dto: CreateDisputeDto, @Req() req: AuthRequest) {
    return this.disputeService.createDispute(dto, this.actor(req));
  }

  @Post(':disputeId/evidence')
  addEvidence(
    @Param('disputeId', new ParseUUIDPipe()) disputeId: string,
    @Body() dto: AddDisputeEvidenceDto,
    @Req() req: AuthRequest,
  ) {
    return this.disputeService.addEvidence(disputeId, dto, this.actor(req));
  }

  @Patch(':disputeId/assignment')
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  assignReviewer(
    @Param('disputeId', new ParseUUIDPipe()) disputeId: string,
    @Body() dto: AssignDisputeDto,
    @Req() req: AuthRequest,
  ) {
    return this.disputeService.assignReviewer(disputeId, dto.reviewerId, this.actor(req));
  }

  @Post(':disputeId/investigation')
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  addInvestigationNote(
    @Param('disputeId', new ParseUUIDPipe()) disputeId: string,
    @Body() dto: DisputeInvestigationNoteDto,
    @Req() req: AuthRequest,
  ) {
    return this.disputeService.addInvestigationNote(disputeId, dto.note, this.actor(req));
  }

  @Post(':disputeId/decision')
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  decideDispute(
    @Param('disputeId', new ParseUUIDPipe()) disputeId: string,
    @Body() dto: DisputeDecisionDto,
    @Req() req: AuthRequest,
  ) {
    return this.disputeService.decideDispute(disputeId, dto.action, dto.reason, this.actor(req));
  }

  @Post(':disputeId/close')
  @RequirePermission(PermissionName.MANAGE_DISPUTES)
  closeDispute(
    @Param('disputeId', new ParseUUIDPipe()) disputeId: string,
    @Body() dto: CloseDisputeDto,
    @Req() req: AuthRequest,
  ) {
    return this.disputeService.closeDispute(disputeId, dto.reason, this.actor(req));
  }

  private actor(request: AuthRequest): DisputeActor {
    return {
      id: request.user?.id,
      role: request.user?.roles[0],
      roles: request.user?.roles,
      permissions: request.user?.permissions,
      requestId: request.id,
    };
  }
}
