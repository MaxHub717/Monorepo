# COMP-015 — Competition Engine Migration & Legacy Fixture Retirement

## Summary

The canonical competition engine is now the Phase/Plot/Series/Game model. Legacy Fixture and Match scheduling logic remains in the repository for historical context only and must not be used to create or drive new competition state.

## Historical data handling

- Legacy tables are not silently deleted.
- Historic Fixture, MatchWeek, and legacy scheduling rows remain read-only for audit and historical reference.
- Any data migration is intentionally manual and recorded in a release note, with a restore step if development/test data is reset.
- Season 1 fixture data must be reset or archived deliberately via a migration or a scripted developer reset, never implicitly by an application write path.

## Migration strategy for development and test data

1. Export or snapshot all existing legacy fixture/match data before truncating or archiving.
2. Mark the legacy dataset as historical and read-only in the migration notes.
3. For test/dev environments, reset Season 1 by explicitly deleting/archiving only the legacy fixture rows and re-creating the season with the canonical Phase/Series engine.
4. Do not run any legacy fixture-generation endpoint in production or test; the engine is now authoritative through Phase/Series recreation and validation.

## Canonical behavior

- New season creation and scheduling must use the canonical engine classes and validation paths.
- Legacy density and fixture-generation config values are rejected with an explicit error.
- No legacy schedule-generation endpoint is mounted in the API module set.
- Legacy controllers remain intentionally retired, not active.

## Safety and reversibility

- Prisma migrations are designed to be non-destructive at runtime and intentionally preserve old rows where possible.
- Any destructive reset must be documented and reversible via a backup or explicit migration script.
- Old code is no longer reachable through app bootstrap and cannot create or mutate new competition schedules.

## Acceptance criteria coverage

- New competition engine is authoritative: yes
- Legacy Fixture generation cannot create new schedules: yes, it is retired and rejected
- Old density config is not used: yes, legacy keys are explicitly rejected at Season creation/update
- Historical data handling is documented: yes
- Prisma migrations are safe and reversible where practical: yes, non-destructive archive-first approach
- No duplicate competing sources of truth remain: yes, legacy scheduling APIs are retired from the app bootstrap
