import { Module } from '@nestjs/common';
import { AdminLeagueController } from './controllers/admin-league.controller.js';
import { AdminSeasonController } from './controllers/admin-season.controller.js';
import { AdminUserController } from './controllers/admin-user.controller.js';
import { AdminAuditController } from './controllers/admin-audit.controller.js';
import { AdminDashboardController } from './controllers/admin-dashboard.controller.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { UserModule } from '../user/user.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

/**
 * Admin Module
 *
 * Provides centralized management endpoints for:
 * - Leagues: creation, configuration, operator assignment
 * - Seasons: lifecycle control, configuration
 * - Users/RBAC: role and permission management
 * - Audit: historical action tracking
 *
 * Authorization:
 * - Uses existing AuthGuard + PermissionsGuard from @common/authz
 * - All endpoints require valid authentication + appropriate permissions
 * - No duplicate auth system introduced
 *
 * Route contract: `/api/v1/admin/*`
 */
@Module({
  imports: [UserModule, AuthzModule, AuditModule, PrismaModule],
  controllers: [
    AdminLeagueController,
    AdminSeasonController,
    AdminUserController,
    AdminAuditController,
    AdminDashboardController,
  ],
  providers: [AdminDashboardService],
})
export class AdminModule {}
