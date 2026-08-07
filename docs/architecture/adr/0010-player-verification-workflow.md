Title: Add player profile verification workflow and completion checks

Status: Proposed

Context:
Player profile exists but there is no verification lifecycle (manual or automated) to mark trusted/verified players beyond email verification.

Decision:
Implement endpoints to request verification and admin endpoints to approve/reject. Add profile `verification_status` transitions and events `player.verification_requested` / `player.verified`.

Files to modify:
- apps/api/src/modules/player/player.service.ts
- create `apps/api/src/modules/player/verification.controller.ts`
- DTOs under `apps/api/src/modules/player/dto/`
- tests and audit integration

Dependencies:
- `AuditModule`, `EventModule` (outbox)
- Club and season enrollment checks will depend on this field

Acceptance criteria:
- Players can request verification; admins can approve/reject.
- Verification updates `player_profile.verification_status`, emits outbox events, and writes audit logs.

Consequences:
- Enables higher-trust workflows (club membership, division eligibility).

Risk level: Medium
Estimated effort: 2–3 days
