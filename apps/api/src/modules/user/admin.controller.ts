import { Controller, Post, Body, UseGuards, Delete, Param, Get } from '@nestjs/common';
import { RequirePermission } from '../../common/authz/authz.decorators.js';
import { PermissionsGuard } from '../../common/authz/authz.guards.js';
import { PermissionName } from '../../common/authz/authz.types.js';
import { UserService } from './user.service.js';

class AssignRoleDto {
  userId!: string;
  roleName!: string;
}

class OperatorScopeDto {
  assignedDivisionId?: string | null;
  region?: string | null;
}

@Controller('admin/users')
@UseGuards(PermissionsGuard)
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Post(':id/roles')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async assignRole(@Param('id') id: string, @Body() body: AssignRoleDto) {
    return this.userService.assignRole(id, body.roleName);
  }

  @Delete(':id/roles/:role')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async revokeRole(@Param('id') id: string, @Param('role') role: string) {
    return this.userService.revokeRole(id, role);
  }

  @Get('/')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async listUsers() {
    return this.userService.listUsersWithRoles();
  }

  @Post(':id/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async upsertOperatorProfile(@Param('id') id: string, @Body() body: OperatorScopeDto) {
    return this.userService.upsertOperatorProfile(id, { assignedDivisionId: body.assignedDivisionId, region: body.region });
  }

  @Get(':id/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async getOperatorProfile(@Param('id') id: string) {
    return this.userService.getOperatorProfile(id);
  }

  @Delete(':id/operator-profile')
  @RequirePermission(PermissionName.MANAGE_ROLES)
  async deleteOperatorProfile(@Param('id') id: string) {
    return this.userService.deleteOperatorProfile(id);
  }
}
