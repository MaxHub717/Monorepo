Title: Implement player-facing season registration endpoints and validation

Status: Proposed

Context:
Seasons support lifecycle management, but there are no player-facing endpoints to register or withdraw from a season.

Decision:
Add `POST /seasons/:id/register` and `POST /seasons/:id/withdraw` in `SeasonController` and implement `SeasonService.registerPlayer` and `withdrawPlayer` with checks for registration window, capacity, and eligibility.

Files to modify:
- apps/api/src/modules/season/season.controller.ts
- apps/api/src/modules/season/season.service.ts
- DTOs for registration
- tests for registration scenarios

Dependencies:
- Player profile completeness and verification (Phase 4)
- Season capacity and division models

Acceptance criteria:
- Players can register only during `REGISTRATION_OPEN` and meet eligibility; a `season.registration` record or membership is created.
- Outbox event `season.player_registered` emitted and audit log written.

Consequences:
- Enables player enrollment flows required for match scheduling.

Risk level: Medium
Estimated effort: 2–3 days
