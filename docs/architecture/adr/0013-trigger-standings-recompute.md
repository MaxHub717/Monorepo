Title: Trigger standings recompute on `match.result.confirmed` and emit `standings.updated`

Status: Proposed

Context:
Standings recompute is currently on-demand. Automatic recompute after confirmed results ensures up-to-date leaderboards.

Decision:
After `match.result.confirmed` outbox event, invoke `StandingsService.recomputeStandings` for the season and emit `standings.updated` outbox event. Implement a subscriber or call within `MatchService.confirmMatchResult` transactionally.

Files to modify:
- apps/api/src/modules/match/match.service.ts
- apps/api/src/modules/standings/standings.service.ts
- create subscriber or include call in match confirmation code

Dependencies:
- `OutboxDispatcher` / event emission pipeline
- `StandingsService` methods (existing)

Acceptance criteria:
- Confirmed results trigger recompute and `standings.updated` emission.
- Leaderboards/standings reflect confirmed results without manual request.

Consequences:
- Near-real-time standings updates; avoid heavy recompute by limiting to affected season/division.

Risk level: Medium
Estimated effort: 1–2 days
