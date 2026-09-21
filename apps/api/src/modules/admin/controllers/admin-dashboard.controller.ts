import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, PermissionsGuard } from '../../../common/authz/authz.guards.js';
import { PermissionName } from '../../../common/authz/authz.types.js';
import { AdminDashboardService } from '../admin-dashboard.service.js';

@Controller('admin/dashboard')
@UseGuards(AuthGuard, AccountStatusGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @RequirePermission(PermissionName.VIEW_ADMIN_DASHBOARD)
  @HttpCode(200)
  getOverview() {
    return this.dashboardService.getOverview();
  }
}