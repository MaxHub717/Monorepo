# COMP-016 — Competition Engine End-to-End Verification

## Objective

Verify the complete competition lifecycle before the ADM-016–032 operational backlog begins consuming the canonical Phase/Plot/Series/Game engine.

## Scope

This verification covers the canonical competition model across small, medium, and large competitor pools, as well as the temporal and scheduling constraints that protect the season lifecycle.

## Required scenarios

### Small field verification
- 4 players
- 8 players
- odd field normalization

### Medium field verification
- 32 players
- 100 players

### Large field verification
- 500 players
- 1000 players

### Timing verification
- short Season
- 12-week Season
- final-week reservation
- insufficient capacity

### Series outcome verification
- 2–1 result
- 1–2 result
- game draw in Game 1, 2, and 3
- unresolved series

### Scheduling verification
- participant conflict
- Sunday exclusion
- outside 10:00–22:00 window
- phase boundary violation
- season boundary violation
- final-week feasibility

## Acceptance criteria status

- Scenario coverage is implemented in `src/modules/competition/competition.e2e.spec.ts`; it is not considered passed until the test command below completes successfully.
- The test asserts that incomplete Series remain pending and any Game draw eliminates both participants.
- The test asserts deterministic phase advancement, Season/final-week capacity limits, schedule conflicts, and date/time boundaries.
- The 32-, 100-, 500-, and 1000-player first-phase generation cases have a 30-second test limit.
- API and web production builds are required gates and must pass before ADM-016–032 begins.
- Current execution status: not verified in this environment. The workspace is on WSL, WSL has no Node executable, and Windows Node cannot resolve the Linux pnpm symlinks through the UNC path.

## Verification entry point

Run from the repository root in the WSL environment with Node.js and pnpm installed:

```bash
pnpm --filter @nexgen/api test -- --run src/modules/competition/competition.e2e.spec.ts
pnpm --filter @nexgen/api build
pnpm --filter @nexgen/web build
```

Then run the full API tests before treating the gate as complete:

```bash
pnpm --filter @nexgen/api test
```
