# PUB-007: Public Player Profiles and Career

## Public designation

Player profiles are private by default. `PlayerProfile.public_profile` is an explicit owner-controlled opt-in; existing records default to false. Public list and detail routes only select non-deleted profiles with this flag enabled.

## Public response allowlist

`GET /api/v1/players/public` returns only profile `id`, `gamerTag`, and optional `region`.

`GET /api/v1/players/public/:id` returns the same public identity fields and a career list derived from publicly visible series with published game results or an established final result. Career entries include only the series/season/phase context, public participant gamer tags, published game outcomes, and authoritative final-result projection.

Email, user/account identifiers, authentication/session details, verification/player status, classifications, profile counters, and metadata are not selected for public responses. An opted-out or deleted profile is indistinguishable from a missing public profile.

## Personal career access

`GET /api/v1/players/:id/career` remains authenticated and permits the profile owner or existing privileged administrator roles only. It verifies ownership using the profile's `user_id`, not by comparing a player-profile ID with a user ID.
