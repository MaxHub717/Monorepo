# ADM-031 — Operator Exception & Override Framework

## Supported override

The only supported override is correcting a completed Game result within a
locked, in-progress Series. The override creates a new result version, records
an `OVERRIDDEN` verification, and recalculates the Series Game totals and
resolution state. Other competition state mutations remain on their normal
state-machine paths; there is no general-purpose status or Season-date override.

An out-of-window check-in exception is also supported for a verified late
arrival. It requires a reason, cannot be recorded after the Match Window ends,
and remains distinct from changing the Series or Phase state.

## Permission and safeguards

The Game-result endpoint requires authentication, an active account, and the
explicit `OVERRIDE_COMPETITION_RESULTS` permission. Check-in exceptions require
the separate `MANAGE_COMPETITION_EXCEPTIONS` permission. Both permissions are
seeded for Commissioners and HQ Administrators, not Operators. Game and Series
state checks, participant validation, non-negative score validation, and
result/score consistency checks still apply.

Every override requires a reason and an authenticated actor. The Game result
audit and audit log record before/after state, actor and role, request ID,
timestamp, and recalculated Series totals. An optional evidence URL and
reference are persisted in the audit record; the reference is also stored as
the audit correlation ID. The reference falls back to the request ID.

The result override and check-in exception controls are only shown to users
with their respective explicit permission. The UI explains that a result
override creates a new audited result version and recalculates the Series
score, and that it does not bypass schedule locks, Series state, or Season
dates. It also explains the check-in exception's Match Window limit.
