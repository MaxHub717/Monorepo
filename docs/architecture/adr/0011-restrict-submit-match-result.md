Title: Restrict `submitMatchResult` to participants or authorized staff

Status: Proposed

Context:
`submitMatchResult` is currently guarded only by authentication; any authenticated user can submit results, creating integrity risk.

Decision:
Enforce that submitters must be a participant (club member in the match) or an authorized role (club manager, operator). Add checks in `MatchService.submitMatchResult` and validate `submittedById` accordingly.

Files to modify:
- apps/api/src/modules/match/match.controller.ts
- apps/api/src/modules/match/match.service.ts

Dependencies:
- `clubMember` model to validate membership
- `AuthGuard` to provide requesterId if omitted

Acceptance criteria:
- Only valid participants or authorized staff can submit results; others receive 403.
- Submitted records include `submittedById` and are audited.

Consequences:
- Improves result integrity; needs thorough tests for edge cases.

Risk level: High
Estimated effort: 1–2 days
