Title: Add session management endpoints (`GET /auth/sessions`, `POST /auth/logout-all`, `POST /auth/logout/:sessionId`)

Status: Proposed

Context:
Users need transparency and control over active sessions. Current API creates sessions but lacks management endpoints.

Decision:
Implement session listing and revocation endpoints in `AuthController` and supporting methods in `AuthService` to list sessions for the current user, revoke all sessions, and revoke a specific session by ID.

Files to modify:
- apps/api/src/modules/auth/auth.controller.ts
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/modules/auth/dto/auth.dto.ts (if session DTOs required)
- tests for session behavior

Dependencies:
- Session binding to tokens (ADR 0002)
- `Prisma.session` model

Acceptance criteria:
- Authenticated users can list their sessions.
- Users can revoke a specific session or all sessions; session revocation updates DB and emits `user.session_revoked` outbox and audit entry.
- Tests verify behavior.

Consequences:
- Improves user security controls; requires careful handling of current session revocation.

Risk level: Medium
Estimated effort: 1–2 days
