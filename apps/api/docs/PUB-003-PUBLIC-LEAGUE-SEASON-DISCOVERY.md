# PUB-003: Public League and Season Discovery

## Visibility policy

The current schema has no separate public-visibility field. Until one is introduced through an approved domain change, public visibility uses the existing lifecycle states:

- A league is public when it is `ACTIVE` and `deleted_at` is null.
- A season is public when it is not `DRAFT`, `deleted_at` is null, and its parent league is public.
- Registration status, registration close time, and division capacity do not control public visibility. Registration eligibility remains the responsibility of `GET /seasons/open-for-registration`.
- Only active divisions are included in public season details.

Archived and inactive leagues are not listed. Non-draft seasons of active leagues remain discoverable even after registration closes or the season completes.

## Read contracts

- `GET /api/v1/leagues/public` returns active public leagues and their visible seasons.
- `GET /api/v1/leagues/public/:id` returns one active public league and its visible seasons; hidden or missing leagues return not found.
- `GET /api/v1/seasons/public` returns public seasons independently of registration eligibility.
- `GET /api/v1/seasons/public/:id` returns one publicly visible season; hidden or missing seasons return not found.

League responses expose only `id`, `name`, `description`, `region`, and a limited season projection. Season responses expose `id`, `name`, `description`, `status`, dates, registration window timestamps, configured competition timezone, league `id`/`name`, and active division `id`/`name`/`type`. Operator assignments, user data, counts, metadata JSON, ruleset internals, and competition configuration are not selected or returned.

## Web routes

- `/leagues` lists public leagues.
- `/leagues/[leagueId]` displays the public league and its visible seasons.
- `/competitions` lists public seasons.
- `/competitions/[seasonId]` displays public season metadata and active divisions.

The administrative `/admin/leagues`, `/seasons`, and `/seasons/[seasonId]` workflows retain their existing authorization checks and are not reused for public reads.
