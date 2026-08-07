Title: Add rate-limiting for auth endpoints (register/resend/forgot)

Status: Proposed

Context:
Auth endpoints are sensitive to abuse; rate limiting is necessary to mitigate brute-force and enumeration attacks.

Decision:
Enable Nest `ThrottlerModule` usage on specific controllers or routes (`register`, `resend-verification`, `forgot-password`, `login`) with conservative defaults and ability to tune via env.

Files to modify:
- apps/api/src/main.ts (global module or import settings)
- apps/api/src/modules/auth/auth.controller.ts (apply `@UseGuards(ThrottlerGuard)` or route decorators)
- configuration in apps/api/src/config/env.validation.ts and `.env` keys

Dependencies:
- `@nestjs/throttler` already present in project dependencies and AppModule imports

Acceptance criteria:
- Rate limits apply and return 429 after threshold.
- Configurable via environment variables.

Consequences:
- Reduces attack surface; must ensure legitimate users aren't overly constrained.

Risk level: Low
Estimated effort: 0.5–1 day
