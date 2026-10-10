# ADM-030 — Competition Notifications

Competition notifications are in-app notifications addressed to users through
their player profiles. Notification content uses the canonical Series and Phase
terms.

## Preferences

`GET /notifications/preferences` returns `competitionEnabled`, defaulting to
`true` when no preference has been saved.

`PATCH /notifications/preferences` accepts:

```json
{ "competitionEnabled": false }
```

This preference suppresses routine competition notifications. Critical
competition outcomes and dispute decisions are always delivered.

## Event coverage

Competition notifications are created for Series scheduling and schedule
changes, Game result submission, Series resolution and player advancement or
elimination, next Phase generation, dispute opening and resolution, and Season
completion. A one-minute scheduled task also sends check-in opening and closing,
Match Window opening, and Results deadline reminders. These reminders are
idempotent per event, Series, and scheduled time.

All notifications are persisted in the same transaction as the triggering
competition change where applicable. Critical notifications bypass routine
preferences, and every newly delivered competition notification has an audit
log entry. The unique event key prevents duplicate delivery on retry.
