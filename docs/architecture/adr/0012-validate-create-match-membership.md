Title: Validate `createMatch` clubs/division/season membership

Status: Proposed

Context:
`createMatch` does not currently ensure that the clubs and matchWeek belong to the specified division/season or that clubs are active and eligible.

Decision:
Add validation in `MatchService.createMatch` to assert:
- `matchWeekId` belongs to `divisionId` and season
- `homeClubId` and `awayClubId` are active and have membership to the division/season

Files to modify:
- apps/api/src/modules/match/match.service.ts
- tests for match creation

Dependencies:
- Season/division models
- Club membership model

Acceptance criteria:
- Invalid combinations rejected with clear errors.
- Valid matches create fixture and match as before.

Consequences:
- Prevents scheduling invalid matches; minor performance cost for extra lookups.

Risk level: Medium
Estimated effort: 1–2 days
