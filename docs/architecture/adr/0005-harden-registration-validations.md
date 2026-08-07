Title: Harden registration DTOs & validations

Status: Proposed

Context:
`RegisterDto` validates email and a strong password, but lacks username constraints and does not validate `gamerTag` format at registration.

Decision:
Enforce username length and character restrictions, validate `gamerTag` using shared profile rules during registration, and add server-side checks to prevent disposable emails if required.

Files to modify:
- apps/api/src/modules/auth/dto/auth.dto.ts
- apps/api/src/modules/auth/auth.service.ts (validation integrations)
- apps/api/src/modules/player/player.service.ts (extract gamerTag validation for reuse)

Dependencies:
- `class-validator` decorators
- Player profile validation logic

Acceptance criteria:
- Invalid usernames/gamerTags are rejected with 400 and clear message.
- Existing registration tests updated and pass.

Consequences:
- More consistent user data and fewer downstream errors.

Risk level: Low
Estimated effort: 0.5–1 day
