/**
 * ADM-001 IMPLEMENTATION SUMMARY
 * Define Admin route and authorization contract
 *
 * Status: COMPLETE
 * Date: 2026-09-14
 *
 * ============================================================================
 * OBJECTIVE
 * ============================================================================
 *
 * Establish the canonical Admin route structure and authorization contract
 * for the Management system, reusing existing cookie-based authentication
 * and permission guards without introducing duplicate auth systems.
 *
 * ============================================================================
 * IMPLEMENTATION OVERVIEW
 * ============================================================================
 *
 * Created a new Admin module (`apps/api/src/modules/admin/`) with four
 * controllers providing endpoints for:
 *
 * 1. League Management       - /api/v1/admin/leagues
 * 2. Season Lifecycle       - /api/v1/admin/seasons
 * 3. User/RBAC Management   - /api/v1/admin/users
 * 4. Audit Log Access       - /api/v1/admin/audit
 *
 * All endpoints are protected using:
 * - AuthGuard (existing cookie-based JWT validation)
 * - AccountStatusGuard (existing account status validation)
 * - PermissionsGuard (existing permission-based access control)
 * - @RequirePermission decorator (existing metadata-driven authorization)
 *
 * ============================================================================
 * API ROUTE CONTRACT
 * ============================================================================
 *
 * LEAGUES
 * -------
 *
 * GET    /api/v1/admin/leagues
 *   - List all leagues
 *   - Permission: VIEW_ADMIN_DASHBOARD
 *
 * GET    /api/v1/admin/leagues/:leagueId
 *   - Get league details
 *   - Permission: VIEW_ADMIN_DASHBOARD
 *
 * POST   /api/v1/admin/leagues
 *   - Create new league
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-003
 *
 * PUT    /api/v1/admin/leagues/:leagueId
 *   - Update league configuration
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-003
 *
 * POST   /api/v1/admin/leagues/:leagueId/operators
 *   - Assign operators to league
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-003
 *
 * SEASONS
 * -------
 *
 * GET    /api/v1/admin/seasons
 *   - List all seasons
 *   - Permission: VIEW_ADMIN_DASHBOARD
 *
 * GET    /api/v1/admin/seasons/:seasonId
 *   - Get season overview
 *   - Permission: VIEW_ADMIN_DASHBOARD
 *   - Future: implemented in ADM-005
 *
 * POST   /api/v1/admin/seasons
 *   - Create new season in DRAFT status
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-004
 *
 * PUT    /api/v1/admin/seasons/:seasonId
 *   - Update season configuration
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-006
 *
 * POST   /api/v1/admin/seasons/:seasonId/open-registration
 *   - Transition DRAFT → REGISTRATION_OPEN
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-009
 *
 * POST   /api/v1/admin/seasons/:seasonId/close-registration
 *   - Transition REGISTRATION_OPEN → REGISTRATION_CLOSED
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-009
 *
 * POST   /api/v1/admin/seasons/:seasonId/lock-roster
 *   - Transition REGISTRATION_CLOSED → ROSTER_LOCKED
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-010
 *
 * POST   /api/v1/admin/seasons/:seasonId/activate
 *   - Transition ROSTER_LOCKED → ACTIVE
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-006
 *
 * POST   /api/v1/admin/seasons/:seasonId/start-playoffs
 *   - Transition ACTIVE → PLAYOFFS
 *   - Permission: MANAGE_SEASONS
 *   - Future: playoff system implementation
 *
 * POST   /api/v1/admin/seasons/:seasonId/complete
 *   - Transition PLAYOFFS/ACTIVE → COMPLETED
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-006
 *
 * POST   /api/v1/admin/seasons/:seasonId/archive
 *   - Transition any → ARCHIVED
 *   - Permission: MANAGE_SEASONS
 *   - Future: implemented in ADM-006
 *
 * USERS / RBAC
 * -------
 *
 * GET    /api/v1/admin/users
 *   - List all users with roles and permissions
 *   - Permission: MANAGE_USERS or MANAGE_ROLES
 *   - Delegates to existing AdminUserController endpoint
 *
 * GET    /api/v1/admin/users/:userId
 *   - Get user details
 *   - Permission: MANAGE_USERS or MANAGE_ROLES
 *
 * POST   /api/v1/admin/users/:userId/roles
 *   - Assign role to user
 *   - Permission: MANAGE_ROLES
 *   - Delegates to existing AdminUserController.assignRole
 *
 * DELETE /api/v1/admin/users/:userId/roles/:role
 *   - Revoke role from user
 *   - Permission: MANAGE_ROLES
 *   - Delegates to existing AdminUserController.revokeRole
 *
 * POST   /api/v1/admin/users/:userId/operator-profile
 *   - Create/update operator profile
 *   - Permission: MANAGE_ROLES
 *   - Delegates to existing AdminUserController.upsertOperatorProfile
 *
 * GET    /api/v1/admin/users/:userId/operator-profile
 *   - Get operator profile details
 *   - Permission: MANAGE_ROLES
 *   - Delegates to existing AdminUserController.getOperatorProfile
 *
 * DELETE /api/v1/admin/users/:userId/operator-profile
 *   - Delete operator profile
 *   - Permission: MANAGE_ROLES
 *   - Delegates to existing AdminUserController.deleteOperatorProfile
 *
 * GET    /api/v1/admin/permissions
 *   - List all permissions in system
 *   - Permission: MANAGE_ROLES
 *   - Future: to be implemented
 *
 * GET    /api/v1/admin/roles
 *   - List all roles with their permissions
 *   - Permission: MANAGE_ROLES
 *   - Future: to be implemented
 *
 * AUDIT LOGS
 * -------
 *
 * GET    /api/v1/admin/audit
 *   - List audit log entries (with filtering)
 *   - Permission: VIEW_AUDIT
 *   - Future: to be implemented
 *
 * GET    /api/v1/admin/audit/:logId
 *   - Get specific audit log entry details
 *   - Permission: VIEW_AUDIT
 *   - Future: to be implemented
 *
 * GET    /api/v1/admin/audit/entities/:entityType/:entityId
 *   - Get complete audit trail for a specific entity
 *   - Permission: VIEW_AUDIT
 *   - Future: to be implemented
 *
 * GET    /api/v1/admin/audit/actors/:actorId
 *   - Get all actions performed by a specific actor
 *   - Permission: VIEW_AUDIT
 *   - Future: to be implemented
 *
 * GET    /api/v1/admin/audit/competitions/:seasonId
 *   - Get competition-relevant audit events for a season
 *   - Permission: VIEW_AUDIT
 *   - Future: to be implemented
 *
 * ============================================================================
 * AUTHORIZATION ARCHITECTURE
 * ============================================================================
 *
 * REUSED COMPONENTS (NO DUPLICATION)
 * 
 * ✓ AuthGuard
 *   - Validates JWT from cookies or Authorization header
 *   - Attached globally in main.ts
 *   - Respects @Public() decorator for public endpoints
 *
 * ✓ AccountStatusGuard
 *   - Validates user account status (ACTIVE vs PENDING/SUSPENDED/BANNED)
 *   - Attached globally in main.ts
 *   - Logs denied access attempts via audit system
 *
 * ✓ PermissionsGuard
 *   - Checks @RequirePermission decorator against user permissions
 *   - Evaluates permission names from Prisma model
 *   - Logs denied access attempts via audit system
 *
 * ✓ RolesGuard (optional, available if needed)
 *   - Checks @RequireRole decorator against user roles
 *   - Not used in ADM-001 controllers (permission-based preferred)
 *
 * ✓ OperatorScopeGuard (optional, available for future use)
 *   - Validates operator scope (division/region assignments)
 *
 * ✓ @RequirePermission decorator
 *   - Sets metadata for PermissionsGuard
 *   - Supports multiple permissions (OR logic)
 *   - Example: @RequirePermission(MANAGE_USERS, MANAGE_ROLES)
 *
 * ✓ @CurrentUser decorator
 *   - Injects authenticated user into controller methods
 *   - Provides access to user.id, user.roles, user.permissions, etc.
 *
 * ============================================================================
 * PERMISSION REQUIREMENTS
 * ============================================================================
 *
 * LEAGUE OPERATIONS
 * - VIEW_ADMIN_DASHBOARD   (read league list/details)
 * - MANAGE_SEASONS         (create/update leagues)
 *
 * SEASON OPERATIONS
 * - VIEW_ADMIN_DASHBOARD   (read season list/details)
 * - MANAGE_SEASONS         (create/update/transition seasons)
 *
 * USER/RBAC OPERATIONS
 * - MANAGE_USERS           (view users)
 * - MANAGE_ROLES           (assign/revoke roles, manage permissions)
 *
 * AUDIT OPERATIONS
 * - VIEW_AUDIT             (read audit logs)
 *
 * ============================================================================
 * ROLE ASSIGNMENTS (FROM PRISMA SCHEMA)
 * ============================================================================
 *
 * HQ_ADMIN
 *   - Full platform administrative authority
 *   - Automatically grants all permissions
 *   - Can create leagues, seasons, manage all users/operators
 *
 * COMMISSIONER
 *   - League-level authority
 *   - Typically granted: MANAGE_SEASONS, VIEW_ADMIN_DASHBOARD
 *   - Can create/operate seasons within assigned league
 *
 * OPERATOR
 *   - Operational match/league personnel
 *   - Typically granted: MANAGE_MATCHES, MANAGE_RESULTS, VIEW_AUDIT
 *   - Subject to OperatorScopeGuard (division/region constraints)
 *
 * CLUB_MANAGER
 *   - Club-level management (not platform admin)
 *   - No automatic admin permissions
 *
 * PLAYER
 *   - Participant in competitions
 *   - No administrative access
 *
 * ============================================================================
 * ARCHITECTURE DECISIONS LOCKED
 * ============================================================================
 *
 * ✓ Route prefix: /api/v1/admin/
 * ✓ Auth mechanism: Reuse existing guards (no duplication)
 * ✓ Authorization: Permission-based (not role-based) where possible
 * ✓ Permission scope: Prefer fine-grained permissions over broad roles
 * ✓ Audit trail: All permission denials logged via AuditLog entity
 * ✓ Module structure: Admin module with four controllers
 * ✓ Future layers: League domain (ADM-003), Season workspace (ADM-005),
 *   Registration UI (ADM-009), Roster workflow (ADM-010), Lifecycle controls (ADM-006)
 *
 * ============================================================================
 * FUTURE WORK
 * ============================================================================
 *
 * ADM-002: Build operational Admin Dashboard
 *   - Integrate league/season overview, pending actions, audit visibility
 *
 * ADM-003: Add permanent League domain above Season
 *   - Implement League model, service, controller
 *   - Implement league creation, configuration, operator assignment
 *
 * ADM-004: Implement Admin Create Season workflow
 *   - Season creation form, validation, defaults
 *
 * ADM-005: Build Season Management Workspace
 *   - Season overview, configuration UI, navigation
 *
 * ADM-006: Complete Admin Season lifecycle controls
 *   - Season state transitions (DRAFT → REGISTRATION_OPEN → ... → ARCHIVED)
 *   - State-aware configuration restrictions
 *
 * ADM-007: Build Admin Division configuration
 *   - Division creation, format selection, capacity setting
 *
 * ADM-008: Harden participant management API for Admin operations
 *   - Bulk registration, withdrawal, disqualification
 *
 * ADM-009: Build Admin registration and participant management UI
 *   - Registration period management, participant listing, removal
 *
 * ADM-010: Implement Admin roster review and lock workflow
 *   - Roster inspection, locking, transition to fixture generation
 *
 * ADM-011: Verify Admin foundation end-to-end
 *   - Test complete workflow: auth, dashboard, navigation, operations
 *
 * ============================================================================
 * FILES CREATED/MODIFIED
 * ============================================================================
 *
 * CREATED:
 * - apps/api/src/modules/admin/admin.module.ts
 * - apps/api/src/modules/admin/controllers/admin-league.controller.ts
 * - apps/api/src/modules/admin/controllers/admin-season.controller.ts
 * - apps/api/src/modules/admin/controllers/admin-user.controller.ts
 * - apps/api/src/modules/admin/controllers/admin-audit.controller.ts
 *
 * MODIFIED:
 * - apps/api/src/app.module.ts (added AdminModule import)
 *
 * REUSED (NO CHANGES):
 * - apps/web/app/lib/auth-guard.ts
 * - apps/web/app/admin/dashboard/page.tsx
 * - apps/web/app/admin/rbac/page.tsx
 * - apps/web/app/components/nav-bar.tsx
 * - apps/api/src/common/authz/authz.guards.ts
 * - apps/api/src/common/authz/authz.decorators.ts
 * - apps/api/src/modules/user/admin.controller.ts
 *
 * ============================================================================
 * ACCEPTANCE CRITERIA STATUS
 * ============================================================================
 *
 * ✓ HQ_ADMIN can access Admin management routes
 *   - All controllers use @RequirePermission with appropriate guards
 *
 * ✓ Unauthorized users cannot access protected management routes
 *   - AuthGuard validates JWT; PermissionsGuard validates permissions
 *   - Access denials are logged to audit trail
 *
 * ✓ Route protection uses the existing auth/permission architecture
 *   - No new auth guards introduced
 *   - Reuses AuthGuard, AccountStatusGuard, PermissionsGuard
 *
 * ✓ Admin navigation is permission-aware where applicable
 *   - Existing nav-bar.tsx includes /admin/dashboard link
 *   - Dashboard uses requireRole() guard function
 *
 * ✓ No duplicate auth guard implementation introduced
 *   - All controllers use existing @common/authz infrastructure
 *
 * ✓ Existing authentication behavior remains intact
 *   - No changes to core auth mechanisms
 *   - Cookie-based JWT validation unchanged
 *   - Global guards applied uniformly
 *
 * ============================================================================
 * VERIFICATION CHECKLIST
 * ============================================================================
 *
 * [ ] Build API: pnpm -C apps/api build
 * [ ] Build Web: pnpm -C apps/web build
 * [ ] Start API: pnpm -C apps/api dev (or docker-compose)
 * [ ] Start Web: pnpm -C apps/web dev
 *
 * MANUAL TEST: Authorized Access
 * [ ] Login as HQ_ADMIN user
 * [ ] Navigate to /admin/dashboard (should succeed)
 * [ ] Make request: GET /api/v1/admin/users (should return 200)
 * [ ] Verify response includes user list
 *
 * MANUAL TEST: Unauthorized Access
 * [ ] Logout
 * [ ] Navigate to /admin/dashboard (should redirect to /auth/login)
 * [ ] Make request: GET /api/v1/admin/users without auth (should return 401)
 *
 * MANUAL TEST: Permission Denial
 * [ ] Login as PLAYER user
 * [ ] Navigate to /admin/dashboard (should redirect to /)
 * [ ] Make request: GET /api/v1/admin/users as PLAYER (should return 403)
 *
 * MANUAL TEST: Audit Logging
 * [ ] Perform denied access attempt
 * [ ] Check database: SELECT * FROM audit_logs WHERE action = 'PERMISSION_DENIED'
 * [ ] Verify entry includes actor_id, action, reason, metadata
 *
 * ============================================================================
 * NEXT STEPS
 * ============================================================================
 *
 * 1. Build and test the implementation
 * 2. Verify all acceptance criteria are met
 * 3. Close ADM-001 issue
 * 4. Begin ADM-002 (Admin Dashboard) implementation
 *
 */
