import { Controller, Get, Post, Put, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { RequirePermission } from '../../../common/authz/authz.decorators.js';
import { PermissionsGuard } from '../../../common/authz/authz.guards.js';
import { PermissionName } from '../../../common/authz/authz.types.js';
import { CurrentUser } from '../../../common/authz/authz.decorators.js';
import { AuthUser } from '../../../common/authz/authz.types.js';

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
  async listLeagues(@CurrentUser() user: AuthUser) {
    return {
      message: 'League listing is not yet implemented',
      note: 'ADM-003 will implement the League domain',
      user: user.id,
    };
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
  async getLeague(@Param('leagueId') leagueId: string, @CurrentUser() user: AuthUser) {
    return {
      message: 'League retrieval is not yet implemented',
      note: 'ADM-003 will implement the League domain',
      leagueId,
      user: user.id,
    };
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
  async createLeague(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return {
      message: 'League creation is not yet implemented',
      note: 'ADM-003 will implement the League domain',
      body,
      user: user.id,
    };
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
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'League update is not yet implemented',
      note: 'ADM-003 will implement the League domain',
      leagueId,
      body,
      user: user.id,
    };
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
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Operator assignment is not yet implemented',
      note: 'ADM-003 will implement the League domain',
      leagueId,
      body,
      user: user.id,
    };
  }
}
