# PUB-001: Public Season Discovery

## Diagnosis

The configured database was queried on 2026-10-16 for `NGL 2026 SEASON 1`. Its stored season values were:

- Status: `REGISTRATION_OPEN`
- Start/end: `2026-10-14` through `2026-10-28`
- Registration open/close: `2026-10-12 19:35:17.610` through `2026-10-13 00:00:00`
- Division 1: active, registration capacity 20, participant count 0

`listOpenRegistrationSeasons()` selects only `REGISTRATION_OPEN` seasons whose registration close time is null or later than the current time. This row fails the close-time predicate because registration closed on October 13, three days before the query. Its active division has space, but that does not override the close time. The participation service independently rejects registration when `now >= registration_close_at`, so returning this season from the registration endpoint would incorrectly offer an action the backend refuses.

The stored lifecycle status and registration deadline are inconsistent. No registration rule was changed to conceal that inconsistency. A live HTTP response could not be captured in this environment: the API was not running, WSL has no Node runtime, and the Windows package runner cannot launch from the UNC workspace. The database values above were queried directly from the configured PostgreSQL database.

## Change

`GET /seasons/open-for-registration` remains the registration-eligibility list and keeps its existing status, date, close-time, active-division, and capacity gates. `GET /seasons/public` provides a separate public-safe discovery list for non-draft, non-deleted seasons, including seasons that are no longer registerable. The gamer dashboard displays the public list and only renders registration controls for seasons also returned by the existing eligibility endpoint.
