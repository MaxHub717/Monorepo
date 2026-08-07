Title: Admin session & audit utilities (session export, revoke, audit view)

Status: Proposed

Context:
Administrators need tools to investigate sessions and audit trails for security and support tasks.

Decision:
Add admin endpoints to list sessions across users, revoke sessions, and search/export audit logs. Implement a new `AdminController` or extend `UserController` with admin-only routes protected by `PermissionsGuard` requiring `HQ_ADMIN` or `COMMISSIONER` roles.

Files to modify/add:
- apps/api/src/modules/admin/admin.controller.ts (new)
- apps/api/src/modules/auth/auth.service.ts (session revoke helpers)
- apps/api/src/modules/audit/audit.service.ts (search/export helpers)

Dependencies:
- Session binding (ADR 0002)
- `AuditService`

Acceptance criteria:
- Admins can list and revoke sessions, search audit logs, and export CSV for given filters; all admin actions produce audit entries.

Consequences:
- Powerful admin tools require strict permissioning and logging.

Risk level: Medium
Estimated effort: 2–3 days
