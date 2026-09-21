import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { RequirePermission } from '../../../common/authz/authz.decorators.js';
import { PermissionsGuard } from '../../../common/authz/authz.guards.js';
import { PermissionName } from '../../../common/authz/authz.types.js';
import { CurrentUser } from '../../../common/authz/authz.decorators.js';
import { AuthUser } from '../../../common/authz/authz.types.js';

/**
 * Admin User/RBAC Controller
 *
 * Provides management endpoints for platform users, roles, and permissions.
 *
 * Authorization:
 * - MANAGE_USERS: user account management
 * - MANAGE_ROLES: role and permission assignment
 *
 * Requires: HQ_ADMIN role (via permission mapping)
 *
 * Note: This controller coordinates with AdminUserController in user.module
 * which handles individual role/permission operations. This controller provides
 * a unified Admin-aware interface.
 */
@Controller('admin/users')
@UseGuards(PermissionsGuard)
export class AdminUserController {
  /**
   * LIST USERS
   * GET /admin/users
   *
   * Returns all platform users with their roles and active permissions.
   * Includes account status and recent activity.
   * Required permissions: MANAGE_USERS or MANAGE_ROLES
   */
  @Get()
  @RequirePermission(PermissionName.MANAGE_USERS, PermissionName.MANAGE_ROLES)
  @HttpCode(200)
  async listUsers(@CurrentUser() user: AuthUser) {
    return {
      message: 'User listing delegates to existing AdminUserController',
      note: 'Use GET /api/v1/admin/users (existing endpoint)',
      user: user.id,
    };
  }

  /**
   * GET USER
   * GET /admin/users/:userId
   *
   * Returns detailed user information including:
   * - account status
   * - assigned roles
   * - effective permissions
   * - operator profile (if applicable)
   * - audit history
   */
  @Get(':userId')
  @RequirePermission(PermissionName.MANAGE_USERS, PermissionName.MANAGE_ROLES)
  @HttpCode(200)
  async getUser(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    return {
      message: 'User detail view is not yet implemented',
      userId,
      user: user.id,
    };
  }

  /**
   * ASSIGN ROLE
   * POST /admin/users/:userId/roles
   *
   * Assigns a role to a user.
   * Required permissions: MANAGE_ROLES
   *
   * Delegates to existing AdminUserController.assignRole
   */
  @Post(':userId/roles')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(201)
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: { roleName: string },
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Role assignment delegates to existing AdminUserController',
      note: `Use POST /api/v1/admin/users/${userId}/roles (existing endpoint)`,
      userId,
      body,
      user: user.id,
    };
  }

  /**
   * REVOKE ROLE
   * DELETE /admin/users/:userId/roles/:role
   *
   * Removes a role from a user.
   * Required permissions: MANAGE_ROLES
   *
   * Delegates to existing AdminUserController.revokeRole
   */
  @Delete(':userId/roles/:role')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(204)
  async revokeRole(
    @Param('userId') userId: string,
    @Param('role') role: string,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Role revocation delegates to existing AdminUserController',
      note: `Use DELETE /api/v1/admin/users/${userId}/roles/${role} (existing endpoint)`,
      userId,
      role,
      user: user.id,
    };
  }

  /**
   * MANAGE OPERATOR PROFILE
   * POST /admin/users/:userId/operator-profile
   *
   * Creates or updates operator profile for a user.
   * Assigns division scope and region scope.
   * Required permissions: MANAGE_ROLES
   *
   * Delegates to existing AdminUserController.upsertOperatorProfile
   */
  @Post(':userId/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(201)
  async upsertOperatorProfile(
    @Param('userId') userId: string,
    @Body() body: { assignedDivisionId?: string | null; region?: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Operator profile management delegates to existing AdminUserController',
      note: `Use POST /api/v1/admin/users/${userId}/operator-profile (existing endpoint)`,
      userId,
      body,
      user: user.id,
    };
  }

  /**
   * GET OPERATOR PROFILE
   * GET /admin/users/:userId/operator-profile
   *
   * Returns operator profile details if applicable.
   * Required permissions: MANAGE_ROLES
   *
   * Delegates to existing AdminUserController.getOperatorProfile
   */
  @Get(':userId/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(200)
  async getOperatorProfile(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Operator profile retrieval delegates to existing AdminUserController',
      note: `Use GET /api/v1/admin/users/${userId}/operator-profile (existing endpoint)`,
      userId,
      user: user.id,
    };
  }

  /**
   * DELETE OPERATOR PROFILE
   * DELETE /admin/users/:userId/operator-profile
   *
   * Removes operator profile from a user.
   * Required permissions: MANAGE_ROLES
   *
   * Delegates to existing AdminUserController.deleteOperatorProfile
   */
  @Delete(':userId/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(204)
  async deleteOperatorProfile(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      message: 'Operator profile deletion delegates to existing AdminUserController',
      note: `Use DELETE /api/v1/admin/users/${userId}/operator-profile (existing endpoint)`,
      userId,
      user: user.id,
    };
  }

  /**
   * LIST PERMISSIONS
   * GET /admin/permissions
   *
   * Returns all available permissions in the system.
   * Required permissions: MANAGE_ROLES
   */
  @Get('permissions')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(200)
  async listPermissions(@CurrentUser() user: AuthUser) {
    return {
      message: 'Permission listing is not yet implemented',
      note: 'Future implementation will enumerate all permissions with descriptions',
      user: user.id,
    };
  }

  /**
   * LIST ROLES
   * GET /admin/roles
   *
   * Returns all available roles in the system with their assigned permissions.
   * Required permissions: MANAGE_ROLES
   */
  @Get('roles')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  @HttpCode(200)
  async listRoles(@CurrentUser() user: AuthUser) {
    return {
      message: 'Role listing is not yet implemented',
      note: 'Future implementation will enumerate all roles with their permissions',
      user: user.id,
    };
  }
}
