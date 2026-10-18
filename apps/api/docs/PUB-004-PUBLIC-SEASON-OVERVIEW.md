# PUB-004: Public Season Overview

## Public route and visibility

`GET /api/v1/seasons/public/:id/overview` is a read-only public endpoint. It returns only a non-deleted, non-draft season belonging to an active, non-deleted league. The existing `/seasons/:id/overview` admin workspace endpoint and its `MANAGE_SEASONS` permission remain unchanged.

## Public projection

The response includes public season identity, status, dates, competition timezone, league identity, active divisions, and these aggregate fields:

- Active, competition-selected participant totals overall and per division. No participant identities are returned.
- Non-draft phase names, types, lifecycle status, dates, and series counts.
- Scheduled-series totals derived from persisted match-window values.
- Published game-result totals derived only from completed games with a current approved verification (or the existing legacy completed-result state when no verification exists).
- Player-facing rules only when the season's current attached ruleset belongs to that season, is not legacy-unassigned, and is `PUBLISHED`. Rules are validated and formatted for players; draft or mismatched rulesets return no public rules.

Competition configuration, rules JSON, participant/player IDs, check-in data, result verification records, conflict/readiness data, and administrative transition controls are not returned.

The UI shows explicit empty states for missing published rules, participants, phases, schedule, and results. Phase, schedule, and results navigation uses in-page overview anchors only when corresponding persisted data exists; the existing schedule and results workspaces remain permission-protected.
