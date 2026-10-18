# PUB-008: Public Integration and Authorization Regressions

## Automated coverage

- `apps/web/app/competitions/public-discovery.test.tsx` follows the public league, season, phase/schedule, series, results, and player-profile views using deterministic API fixtures. It covers published versus unpublished outcomes, public privacy fields, empty states, timezone presentation, and rejected requests that must not appear as empty success states.
- `apps/api/src/modules/season/season.service.spec.ts` creates a season through the admin service, verifies that the draft is not public, publishes it, and verifies that the same persisted fixture appears in public season discovery without internal fields.
- `apps/api/src/modules/participation/participation.service.spec.ts` registers a gamer against a deterministic fixture and verifies that the same participant is returned by both the gamer's registration list and the admin participant list.
- Season, league, competition, player, and participation controller specs assert which routes are public, authenticated, or permission-gated.
- Competition and player service specs verify result-publication filtering and public player-profile privacy.
- `apps/web/app/auth/auth-flow.test.ts` verifies safe registration/verification return paths and the authenticated sign-in destination contract.

All automated service tests use mocked Prisma clients and fixed fixtures. They do not require `DATABASE_URL`, developer credentials, or a live season and do not mutate a developer or production database.

## Verification boundary

The repository does not currently provide a repeatable cross-process HTTP test harness with an isolated database and seeded user roles. The automated coverage composes API service/controller contracts with web request-flow/component tests; it does not claim to verify cookies or authorization against a running deployed stack. `apps/api/scripts/auth-regression.sh` is a manual environment-dependent check and is not part of the deterministic test suite.

## Unsupported behavior

- Registration outcome notifications are not currently emitted by the notification service. The UI and tests must not synthesize them.
- Public announcements are not part of the personal notification feed; they require a separate public announcement source and presentation.
- Notification delivery is limited to event types implemented by the current notification service. Adding new categories or delivery infrastructure is outside this verification scope.