# ADM-032 — Full Season End-to-End Verification

## Objective

Prove the canonical competition engine supports a complete Season lifecycle from initial field setup through qualification, automatic scheduling, final-week capacity protection, phase transitions, and completion readiness.

## Implementation

The repository already contains the canonical engine logic for:

- season phase generation and final-week protection
- odd-field normalization and scheduled series generation
- participant pairing and automatic scheduling validation
- series advancement and phase transition planning
- season capacity planning for the remaining schedule window

The explicit end-to-end coverage for this requirement now lives in:

- `apps/api/src/modules/competition/competition.e2e.spec.ts`

This suite exercises the full Season path:

1. build a valid multi-phase Season schedule
2. normalize odd fields and generate 3-game series records
3. confirm automatic scheduling fits within the allowed window
4. resolve a series to a valid advancement outcome
5. transition winners into a subsequent Phase
6. validate season capacity and protected final-week constraints

## Acceptance Criteria Covered

- Complete Season structure can be generated without violating the protected final-week window.
- Odd-field edges are normalized before the first Phase is scheduled.
- Every generated series contains exactly three games.
- Automatic scheduling respects the 10:00-22:00 window, weekday restrictions, and season boundaries.
- Resolved Series produce a single valid advancement outcome for the next Phase.
- Phase transitions only carry finalized winners into the next Phase.
- Remaining season capacity remains feasible when the final week is reserved.

## Verification

Run the API coverage using the WSL Linux runtime:

```bash
cd /home/martin/Nexgen/League
source /home/martin/.nvm/nvm.sh
nvm use 20
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --filter @nexgen/api test -- --run src/modules/competition/competition.e2e.spec.ts
```

This is the end-to-end proof gate for the full Season lifecycle under the canonical competition model.
