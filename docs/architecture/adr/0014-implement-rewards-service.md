Title: Implement `RewardsService` and issue reward events on confirmations

Status: Proposed

Context:
Prisma schema includes `Reward` and `Achievement` models but no service to award them.

Decision:
Create `RewardsService` that listens to `match.result.confirmed` and `standings.updated` events to issue rewards (participation, victory, MVP). Rewards are recorded and outbox events `player.reward.earned` emitted.

Files to modify/add:
- apps/api/src/modules/rewards/rewards.service.ts (new)
- hook into event subscribers (e.g., create `rewards.subscriber.ts` or call from match confirmation)
- tests for reward issuance

Dependencies:
- Match confirmation flow (Phase 8/9), standings recompute
- `prisma.reward` model

Acceptance criteria:
- Confirmed matches create appropriate reward records and emit events; tests validate reward issuance for simple cases.

Consequences:
- Adds gamification baseline; future rules can expand.

Risk level: Medium
Estimated effort: 2–3 days
