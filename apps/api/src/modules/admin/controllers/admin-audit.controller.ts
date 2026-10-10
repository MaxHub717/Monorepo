import { Controller, Get, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { RequirePermission } from '../../../common/authz/authz.decorators.js';
import { PermissionsGuard } from '../../../common/authz/authz.guards.js';
import { PermissionName } from '../../../common/authz/authz.types.js';
import { CurrentUser } from '../../../common/authz/authz.decorators.js';
import { AuthUser } from '../../../common/authz/authz.types.js';
import { AuditService } from '../../audit/audit.service.js';

/**
 * Admin Audit Controller
 *
 * Provides read-only endpoints for audit log inspection and compliance.
 *
 * Authorization:
 * - VIEW_AUDIT: read access to audit logs
 *
 * Requires: HQ_ADMIN or COMMISSIONER role (via permission mapping)
 *
 * All operations are read-only. Audit logs are immutable and created
 * automatically by the system when sensitive actions occur.
 */
@Controller('admin/audit')
@UseGuards(PermissionsGuard)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * LIST AUDIT LOGS
   * GET /admin/audit
   *
   * Returns paginated audit log entries.
   * Supports filtering by:
   * - entity type
   * - entity id
   * - actor id
   * - actor role
   * - action
   * - date range
   *
   * Required permissions: VIEW_AUDIT
   */
  @Get()
  @RequirePermission(PermissionName.VIEW_AUDIT)
  @HttpCode(200)
  async listAuditLogs(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.auditService.listLogs({
      entityType: typeof query.entityType === 'string' ? query.entityType : undefined,
      entityId: typeof query.entityId === 'string' ? query.entityId : undefined,
      actorId: typeof query.actorId === 'string' ? query.actorId : undefined,
      actorRole: typeof query.actorRole === 'string' ? query.actorRole : undefined,
      action: typeof query.action === 'string' ? query.action : undefined,
      correlationId: typeof query.correlationId === 'string' ? query.correlationId : undefined,
      requestId: typeof query.requestId === 'string' ? query.requestId : undefined,
      from: typeof query.from === 'string' ? query.from : undefined,
      to: typeof query.to === 'string' ? query.to : undefined,
      page: typeof query.page === 'string' ? Number(query.page) : Number(query.page ?? 1),
      limit: typeof query.limit === 'string' ? Number(query.limit) : Number(query.limit ?? 50),
    });

    return { ...result, userId: user.id };
  }

  /**
   * GET ENTITY HISTORY
   * GET /admin/audit/entities/:entityType/:entityId
   *
   * Returns complete audit trail for a specific entity.
   * Shows all actions that modified or affected the entity.
   * Includes before/after state for each action.
   *
   * Required permissions: VIEW_AUDIT
   */
  @Get('entities/:entityType/:entityId')
  @RequirePermission(PermissionName.VIEW_AUDIT)
  @HttpCode(200)
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const history = await this.auditService.getEntityHistory(entityType, entityId);
    return { ...history, userId: user.id };
  }

  /**
   * GET ACTOR HISTORY
   * GET /admin/audit/actors/:actorId
   *
   * Returns all actions performed by a specific actor.
   * Useful for reviewing an admin's operational history.
   *
   * Required permissions: VIEW_AUDIT
   */
  @Get('actors/:actorId')
  @RequirePermission(PermissionName.VIEW_AUDIT)
  @HttpCode(200)
  async getActorHistory(
    @Param('actorId') actorId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    const history = await this.auditService.getActorHistory(actorId, {
      entityType: typeof query.entityType === 'string' ? query.entityType : undefined,
      entityId: typeof query.entityId === 'string' ? query.entityId : undefined,
      action: typeof query.action === 'string' ? query.action : undefined,
      from: typeof query.from === 'string' ? query.from : undefined,
      to: typeof query.to === 'string' ? query.to : undefined,
      page: typeof query.page === 'string' ? Number(query.page) : Number(query.page ?? 1),
      limit: typeof query.limit === 'string' ? Number(query.limit) : Number(query.limit ?? 50),
    });
    return { ...history, userId: user.id };
  }

  /**
   * GET AUDIT LOG ENTRY
   * GET /admin/audit/:logId
   *
   * Returns detailed information about a specific audit log entry.
   * Includes complete before/after state and metadata.
   *
   * Required permissions: VIEW_AUDIT
   */
  @Get(':logId')
  @RequirePermission(PermissionName.VIEW_AUDIT)
  @HttpCode(200)
  async getAuditLogEntry(
    @Param('logId') logId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entry = await this.auditService.getAuditLogEntry(logId);
    return { entry, userId: user.id };
  }

  /**
   * GET COMPETITION TIMELINE
   * GET /admin/audit/competitions/:seasonId
   *
   * Returns audit events for a specific season/competition.
   * Filters to show only competition-relevant actions (matches, results, standings, etc.)
   *
   * Required permissions: VIEW_AUDIT
   */
  @Get('competitions/:seasonId')
  @RequirePermission(PermissionName.VIEW_AUDIT)
  @HttpCode(200)
  async getCompetitionTimeline(
    @Param('seasonId') seasonId: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    const timeline = await this.auditService.getCompetitionTimeline(seasonId, {
      action: typeof query.action === 'string' ? query.action : undefined,
      actorId: typeof query.actorId === 'string' ? query.actorId : undefined,
      actorRole: typeof query.actorRole === 'string' ? query.actorRole : undefined,
      from: typeof query.from === 'string' ? query.from : undefined,
      to: typeof query.to === 'string' ? query.to : undefined,
      page: typeof query.page === 'string' ? Number(query.page) : Number(query.page ?? 1),
      limit: typeof query.limit === 'string' ? Number(query.limit) : Number(query.limit ?? 50),
    });
    return { ...timeline, userId: user.id };
  }
}
