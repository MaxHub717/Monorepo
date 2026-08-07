Title: Invalidate prior verification tokens on resend & enforce limits

Status: Proposed

Context:
`resendVerification()` generates new verification tokens but does not invalidate prior tokens, and lacks rate limits for repeated resends.

Decision:
On resend, mark prior `verificationToken` records for that user and purpose as consumed/invalid and create a new token. Enforce a minimum resend interval per user.

Files to modify:
- apps/api/src/modules/auth/auth.service.ts (resendVerification)
- apps/api/src/modules/auth/dto/auth.dto.ts (resend request validation if needed)
- tests for resend behavior

Dependencies:
- `verificationToken` Prisma model
- rate-limiting (ADR 0006)

Acceptance criteria:
- Existing tokens for the same purpose are marked consumed/invalid upon resend.
- Rapid repeated resends are prevented by rate limiting.

Consequences:
- Eliminates multiple active tokens and reduces phishing risk.

Risk level: Medium
Estimated effort: 0.5–1 day
