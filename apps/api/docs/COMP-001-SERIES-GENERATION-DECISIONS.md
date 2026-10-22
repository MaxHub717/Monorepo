# COMP-001: Canonical Series Generation Rule and Decisions Required

## Status

Product direction has shifted toward a preliminary qualification stage; the canonical v2 rules and runtime behavior must be reconciled before implementation. This document records the decisions received and remaining format details.

## Confirmed by the canonical NGL Competition & Scheduling Specification v2

The canonical source is `NGL Docs/NGL Competition & Scheduling Specif.txt`, sections 2, 8–12, 16–18, and 36–37. The identical copy under `Season Lifecycle/` contains the same rules.

- The format is progressive Phase → Plot → Series, not round robin or all-versus-all.
- A Series pairs exactly two players within a Plot and has three Games.
- Section 12 illustrates sequential pairings in approved order: Player 1 vs Player 2, Player 3 vs Player 4, and so on. For an even-sized, already ordered Plot, this supports pairing adjacent players and generating `P / 2` Series.
- Odd fields must be normalized before normal Series generation. No automatic bye is allowed. The normalization Series uses the approved lowest-seeded competitors; its winner remains eligible, its loser is eliminated, and a draw eliminates both.
- Advancement is based on resolved Series, and the next Phase is generated from actual survivors.

Therefore, all-pairs generation is explicitly disallowed. The adjacent-pair example describes one possible order, but the approved product pairing order below supersedes that example.

## Approved implementation decisions

1. **Seed ordering and pairing.** Seed 1 is strongest. Within a Plot, pair strongest versus weakest, then next-strongest versus next-weakest, inward (`1 vs N`, `2 vs N-1`, ...). The two lowest-seeded normalization participants are the largest seed numbers. Equal seeds use participant ID in ascending lexical order as a stable tie-breaker. The approved phase seed order is authoritative; database row order, account creation order, and randomness are not.

2. **Odd-sized Plots.** Distribute players to preserve all participants, balance Plot sizes, and minimize odd-sized Plots: zero odd Plots for even fields when feasible, one odd Plot for odd fields when feasible. Normalize only the unique odd-sized Plot; do not normalize each Plot independently when the overall field is even. Never eliminate players to make Plots even.

3. **Plot count.** The explicit initial/later formulas are authoritative. For 34 initial competitors the plot count is `min(10, ceil(34 / 20)) = 2`; correct the conflicting three-plot example in both copies of the canonical specification. Twenty is a sizing target, and plot sizes should be balanced subject to the count and maximum of ten.

4. **Normalization winner in the same Phase.** The normalization winner must not be forced to play an additional regular Series in the same Phase. Irregular participant counts should be resolved in a preliminary qualification stage, separate from regular Series records, with its outcomes retained in qualification history.

## New product direction received

- Qualification should use published seed rules and may assign byes where appropriate, superseding the current no-automatic-bye rule.
- For large fields, group qualification is the default; Swiss qualification is a future option.
- Example only: if a four-player main bracket is the target for five entrants, seeds 4 and 5 play; the winner joins seeds 1–3 and the loser is out of qualification.
- Do not implement one enormous round robin or single-elimination stage.

This direction conflicts with canonical v2 sections 16–17, which explicitly prohibit automatic byes and prescribe odd-field normalization. The canonical specification and affected acceptance tests must be revised and approved before code changes.

## Remaining decisions required before implementation

1. **Qualification format and threshold.** What exact field size starts “large field” group qualification? For all other fields, is the 4-player main-bracket/play-in example the standard format? Define group sizing and whether groups are balanced by seeds, plots, or another rule.
2. **Group advancement.** How many players advance from each group, what determines ordering/ties, and what happens to unresolved/tied group outcomes? This determines the exact pairings and next-phase participant set.
3. **Bye policy.** Confirm that the new qualification format intentionally supersedes the existing prohibition on automatic byes, and define which seed ranges receive byes for fields that are not exactly one above a bracket size.
4. **Normalization draw / terminal outcome.** Earlier direction said repeat normalization after a draw and declare a sole remaining competitor champion. Confirm whether this still applies to qualification Series, or whether qualification group rules supersede normalization.
5. **Qualification history model.** Confirm whether qualification matches are persisted as a distinct type/record or are ordinary Series with a separate stage/type. This affects the data model, results, audit trail, and public history.

## Active-branch evidence

- `apps/api/src/modules/competition/competition.domain.ts`: `buildSeriesForPlot()` currently emits every combination in a Plot. `buildPhasePlots()` distributes ordered players round-robin across its calculated Plot count. `normalizeOddField()` selects the first two IDs from `approvedOrder`.
- `apps/api/src/modules/competition/competition.domain.spec.ts` and `apps/api/src/modules/competition/competition.e2e.spec.ts` currently assert all-pairs Series counts.
- The current Prisma schema has no first-class season-title model; title work is separate from this pairing change.

## Implementation after decisions

Once these decisions are approved and the canonical specification is reconciled, update the pure planner, persistence model if required, schedule/capacity planning, and result/advancement flows as one format change. Assert exact pairings and stable keys; update small, odd, large, and repeated-input cases; derive season workload from the production planner; and retain result, advancement, and schedule-window regression coverage.