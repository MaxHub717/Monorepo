import { Controller, Get, Post, Put, Body, Param, Delete, UseGuards, HttpCode, Req } from '@nestjs/common';
import { RequirePermission } from '../../../common/authz/authz.decorators.js';
import { PermissionsGuard } from '../../../common/authz/authz.guards.js';
import { PermissionName } from '../../../common/authz/authz.types.js';
import { AdminLeagueService } from '../admin-league.service.js';
import { AssignLeagueOperatorDto, CreateLeagueDto, UpdateLeagueDto } from '../dto/league.dto.js';

/**
 * Admin League Controller
 *
 * Provides management endpoints for league operations.
 *
 * Authorization:
 * - VIEW_ADMIN_DASHBOARD: read access to league overview
 * - MANAGE_SEASONS: create, update leagues
 *
 * Requires: HQ_ADMIN role (via permission mapping)
 */
@Controller('admin/leagues')
@UseGuards(PermissionsGuard)
export class AdminLeagueController {
  constructor(private readonly leagueService: AdminLeagueService) {}
  /**
   * LIST LEAGUES
   * GET /admin/leagues
   *
   * Returns all leagues accessible to the authenticated admin.
   * Future: filter by operator assignment.
   */
  @Get()
  @RequirePermission(PermissionName.VIEW_ADMIN_DASHBOARD)
  @HttpCode(200)
  async listLeagues() {
    return this.leagueService.listLeagues();
  }

  /**
   * GET LEAGUE
   * GET /admin/leagues/:leagueId
   *
   * Returns detailed league information.
   * Future: include season history, operator assignments.
   */
  @Get(':leagueId')
  @RequirePermission(PermissionName.VIEW_ADMIN_DASHBOARD)
  @HttpCode(200)
  async getLeague(@Param('leagueId') leagueId: string) {
    return this.leagueService.getLeague(leagueId);
  }

  /**
   * CREATE LEAGUE
   * POST /admin/leagues
   *
   * Creates a new league.
   * Required permissions: MANAGE_SEASONS
   */
  @Post()
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  @HttpCode(201)
  async createLeague(@Body() dto: CreateLeagueDto, @Req() req: any) {
    return this.leagueService.createLeague(dto, this.actor(req));
  }

  /**
   * UPDATE LEAGUE
   * PUT /admin/leagues/:leagueId
   *
   * Updates league configuration.
   * Required permissions: MANAGE_SEASONS
   */
  @Put(':leagueId')
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  @HttpCode(200)
  async updateLeague(
    @Param('leagueId') leagueId: string,
    @Body() dto: UpdateLeagueDto,
    @Req() req: any,
  ) {
    return this.leagueService.updateLeague(leagueId, dto, this.actor(req));
  }

  /**
   * MANAGE LEAGUE OPERATORS
   * POST /admin/leagues/:leagueId/operators
   *
   * Assigns or updates operator assignments for a league.
   * Required permissions: MANAGE_SEASONS
   */
  @Post(':leagueId/operators')
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  @HttpCode(201)
  async assignOperator(
    @Param('leagueId') leagueId: string,
    @Body() dto: AssignLeagueOperatorDto,
    @Req() req: any,
  ) {
    return this.leagueService.assignOperator(leagueId, dto, this.actor(req));
  }

  @Delete(':leagueId')
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  async archiveLeague(@Param('leagueId') leagueId: string, @Req() req: any) {
    return this.leagueService.deleteLeague(leagueId, this.actor(req));
  }

  @Delete(':leagueId/operators/:userId')
  @RequirePermission(PermissionName.MANAGE_SEASONS)
  async removeOperator(@Param('leagueId') leagueId: string, @Param('userId') userId: string, @Req() req: any) {
    return this.leagueService.removeOperator(leagueId, userId, this.actor(req));
  }

  private actor(req: any) {
    return { id: req.user?.id, role: req.user?.roles?.[0], correlationId: req.id };
  }
}
