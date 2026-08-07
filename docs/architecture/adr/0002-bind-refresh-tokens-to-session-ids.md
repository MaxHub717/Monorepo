Title: Bind refresh tokens to session IDs (jti)

Status: Proposed

Context:
Refresh tokens are not currently bound to a session identifier; `refresh()` and `logout()` locate sessions with `findFirst()` and rely on hash checks. This weak mapping allows imprecise revocation when multiple sessions exist.

Decision:
Add a `jti` (session id) claim to refresh tokens, store the `jti` in the `session` record on creation, and update `refresh()`/`logout()` to locate the session by `jti` and validate the stored hash.

Files to modify:
- apps/api/src/modules/auth/auth.service.ts (token creation, verifyRefreshToken, refresh, logout)
- apps/api/src/modules/auth/auth.controller.ts (optionally adjust refresh behavior)
- prisma schema migration if session table lacks `jti`/session_id field (apps/api/prisma/schema.prisma) — add field and run migration
- tests for auth sessions

Dependencies:
- Prisma migrations (DB change may be required)
- Existing `session` model and `argon2` hashing

Acceptance criteria:
- New refresh tokens include a `jti` claim.
- Sessions store the `jti` and are retrieved by `jti` during refresh/logout.
- Revoking a session only affects that session.
- Tests validate multi-session behavior.

Consequences:
- Requires DB migration if schema change needed.
- Tightens session revocation and auditing.

Alternatives considered:
- Use token hash matching only (keeps weakness), or add DB index on refresh hash (less precise). Rejected.

Risk level: High
Estimated effort: 2–3 days
