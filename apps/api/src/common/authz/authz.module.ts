import { Module } from '@nestjs/common';
import { AuditModule } from '../../modules/audit/audit.module.js';
import { AuthzService } from './authz.service.js';
import { AuthGuard, AccountStatusGuard, RolesGuard, PermissionsGuard, OwnershipGuard, OperatorScopeGuard } from './authz.guards.js';

@Module({
  imports: [AuditModule],
  providers: [
    AuthzService,
    AuthGuard,
    AccountStatusGuard,
    RolesGuard,
    PermissionsGuard,
    OwnershipGuard,
    OperatorScopeGuard,
  ],
  exports: [
    AuthzService,
    AuthGuard,
    AccountStatusGuard,
    RolesGuard,
    PermissionsGuard,
    OwnershipGuard,
    OperatorScopeGuard,
  ],
})
export class AuthzModule {}
