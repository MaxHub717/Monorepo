Title: Fix resetPassword token lookup vulnerability

Status: Proposed

Context:
The current `resetPassword` implementation in `apps/api/src/modules/auth/auth.service.ts` queries for the first valid password reset token rather than the token tied to the supplied value, allowing token confusion and potential unauthorized resets.

Decision:
Change `resetPassword` to: parse supplied token into id.secret, fetch verification token by id, verify the secret using argon2, ensure purpose/expiry/consumed checks against the fetched record.

Files to modify:
- apps/api/src/modules/auth/auth.service.ts
- apps/api/src/modules/auth/dto/auth.dto.ts (token format validation and tests)
- tests: update/add unit tests under apps/api/src/modules/auth

Dependencies:
- Prisma `verificationToken` model (existing)
- `argon2` verify logic (existing)

Acceptance criteria:
- `resetPassword` only succeeds when the supplied token matches the stored token record for that id.
- Unit tests demonstrate exploit case is resolved.
- No existing business logic behavior changes besides security fix.

Consequences:
- Eliminates token substitution vulnerability.
- Requires unit tests to be added/updated.

Alternatives considered:
- Keep current lookup and additionally verify token — rejected as it still allows ambiguity.

Risk level: Critical
Estimated effort: 0.5–1 day
