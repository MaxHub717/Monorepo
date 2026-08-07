Title: Add `GET /auth/me` endpoint

Status: Proposed

Context:
No dedicated endpoint returns the current authenticated user's profile and session metadata; clients rely on ad-hoc requests.

Decision:
Introduce `GET /auth/me` in `AuthController` which returns user id, email, roles, player profile summary, and current session id (if available). Implement service method to assemble data.

Files to modify:
- apps/api/src/modules/auth/auth.controller.ts
- apps/api/src/modules/auth/auth.service.ts
- optional: apps/api/src/modules/user/user.service.ts to reuse existing user fetching logic

Dependencies:
- `AuthGuard` and `AuthzService.verifyAccessToken`
- Session binding (optional but recommended)

Acceptance criteria:
- Authenticated requests to `/auth/me` return structured user data and 200 status.
- Unauthenticated requests return 401.
- Unit test added.

Consequences:
- Provides client-friendly current-user endpoint; minimal security surface.

Risk level: Low
Estimated effort: 0.5–1 day
