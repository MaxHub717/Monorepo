# NexGen League — Lifecycle, Scheduler, Multi-Title, and Player Experience Gap Assessment

**Version:** 1.0 · **Status:** Review draft for implementation planning  
**Basis:** Uploaded `Monorepo.zip` and the NGL Competition & Scheduling Specification / Season Lifecycle documents reviewed in this project.

> This is an assessment and implementation-planning document, not a code or database change. Findings describe the uploaded repository snapshot and should be verified against the active branch before implementation.

## 1. Executive summary

The current code already has season status transitions, phase/plot/series/game domain concepts, scheduling and validation, versioned competition rulesets, registration, public competition pages, player identity, career and notifications. Several important gaps remain:

1. `buildSeriesForPlot()` creates every possible pair in a plot, conflicting with the supplied progressive competition specification and inflating scheduling/capacity estimates.
2. The schema has no first-class season game-title relationship. Existing `Game` means an individual game inside a series, not a title such as E-Football or Free Fire.
3. Season registration must be distinct from title participation: register once per season, then select only the title(s) the gamer wants to compete in. Registration must not enrol them in every title.
4. Multi-title progression and scheduling must be coordinated. Each selected title has an independent competitive track and champion, but all tracks share the season/phase framework. A gamer must never have overlapping series across titles.
5. Registration discovery and registration submission do not use one authoritative readiness evaluation. The registration service also requires `VERIFIED` player status, contrary to the previously agreed MVP direction that verification is not a mandatory Season 1 participation requirement.
6. Operational competition configuration is used to derive player-facing rules. Public rules and participation instructions should instead be authored, versioned and published separately from settings that control the engine.
7. Player Dashboard and My League Identity currently overlap. The dashboard should be a concise overview and navigation hub; identity should focus on the gamer’s profile and identity settings.
8. A storage abstraction exists, but a complete admin workflow for title images was not confirmed. The reviewed competition service/controller also did not reveal a clear production entry point for initial phase/series generation.

**Recommended order:** correct competition semantics and registration gates; add title-aware participation and scheduling; separate public rules/instructions; then finish Dashboard and identity-page separation.

## 2. Product decisions to preserve

### 2.1 Registration and selected titles

- A season may offer one or more game titles.
- A gamer creates **one season registration** per season and selects one or more titles during that registration.
- The gamer competes **only in the selected title(s)**. Registering for a season does **not** mean automatic participation in every title offered by that season.
- Each selected title has a distinct title-specific participation record/track. Registration and selected title records must be created consistently.
- A gamer may choose a subset of the season’s titles; the UI must make the selection explicit and confirm the selected titles.
- If a gamer selects multiple titles, the scheduler must coordinate those tracks to prevent overlapping series.

### 2.2 Competition structure

Canonical hierarchy: **Season → Phase → Plot → Series → Games → Result → Advancement**.

- Existing `Game` means a game played within a series, not a game title.
- A normal series contains three games under the supplied specification.
- Each title has independent progression and a title champion/final.
- Title tracks share the season and phase framework. Finals for all titles in a season must be in the same final phase, but can be in different plots and at different times.
- Public schedules must identify the title associated with each series.

### 2.3 Separate operational configuration, rules and instructions

1. **Operational competition configuration:** structured settings used by the engine for scheduling, advancement, check-in, results, disputes, penalties and related operations. Admin/internal only; do not expose raw configuration to gamers.
2. **Season Rules:** public human-readable policies about eligibility, conduct, penalties, result submission, disputes and participant obligations.
3. **Season Instructions:** admin-authored step-by-step guidance on how to participate.

Rules/instructions should support authorized editing, sections/headings/lists and ordering, draft/preview/publish and version history. Changing public wording must not silently change operational settings.

### 2.4 Player experience

- Public visitors can browse competitions and published season information without signing in.
- My League Identity is for gamer identity/profile details and identity settings.
- Dashboard is an overview and navigation hub, not a duplicate of every dedicated page.
- Competitions, My Competitions, My Schedule, Career History and Notifications each need a clear purpose.
- Signed-in Notifications navigation should use a bell icon. Show unread indicator/count only if the API reliably supports unread state.
- Preserve existing admin routes and access controls.

## 3. Current implementation findings

### 3.1 Schema and domain model

The reviewed schema contains `Season`, versioned `CompetitionRuleset`, `Phase`, `Plot`, `Series`, `Game`, `Division` and `DivisionParticipant`. `DivisionParticipant` is unique by season/player and does not represent selected title participation.

**Confirmed gap:** no first-class season-title relation, title entity with image metadata, or explicit link from a phase/plot/series to a title track was found in the reviewed schema. Do not repurpose `Game` to represent titles. Introduce an unambiguous title model and title-specific participation/progression relationships, preserving legacy compatibility.

### 3.2 Series generation conflicts with the supplied specification

The reviewed `buildSeriesForPlot()` creates every possible pairing inside a plot, and tests assert this all-pairs behaviour:

- 4 players → 6 series
- 8 players → 28 series
- 100 players → 950 series across configured plots
- 500 players → 12,250 series
- 1,000 players → 49,500 series

This is round-robin/all-pairs workload, not the progressive phase model described in the supplied specification. It inflates workload, affects schedule feasibility, season duration, phase completion, advancement, final-phase planning and multi-title scale. Correct the pairing rule and tests together; do not merely raise capacity estimates to fit the current output.

### 3.3 Scheduler behaviour

The current scheduler uses the season timezone, Monday–Saturday, local hours 10:00–22:00, 60-minute match windows, check-in at T-60/T-30, results deadline T+90, and final-week protection. These broadly align with the reviewed specification.

However, the scheduler and validator reject all overlapping series, including series with unrelated participants. This is safe but restrictive. The specification clearly requires preventing player conflicts and duplicate appointments, but does not fully settle whether unrelated series may overlap.

**Decision needed:** permit unrelated series to overlap subject to platform/operator capacity, or retain global serialization. Do not relax the validator until the policy is decided. Capacity estimates should not be trusted until series generation is corrected. Add timezone and final-week boundary tests.

### 3.4 Phase creation, normalization and terminal outcomes

- Helpers exist for plots, odd-field normalization and phase transition planning.
- Odd-field normalization chooses the first two players in a supplied order; the helper does not itself prove those are the lowest-seeded competitors. Define and test the seed-order contract.
- Transition planning can fail with fewer than two survivors, leaving one-survivor or zero-survivor outcomes insufficiently defined.
- No clear production API entry point for initial phase/series generation was found in the reviewed competition service/controller. Trace admin endpoints, jobs, seeds and migrations before concluding no pathway exists.
- `generateNextPhase` does create later phases, plots, series and games, records audit information and attempts scheduling.

Define a deterministic lifecycle from roster lock through the first phase, each subsequent phase, title champion and season completion. No valid outcome should leave a season stuck because the code assumes at least two survivors.

### 3.5 Lifecycle and registration readiness

Persisted season statuses include `DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → ROSTER_LOCKED → ACTIVE → PLAYOFFS → COMPLETED → ARCHIVED`. The specification has more granular phase activity; existing season statuses can remain if phase records reliably represent detailed progress.

Current registration gaps:

- Public discovery checks `REGISTRATION_OPEN`, dates, closing time, active divisions and capacity, but does not use one shared readiness evaluation with the submission endpoint.
- Submission checks season status, closing time, active division, player profile/eligibility and uniqueness/capacity.
- Eligibility currently requires `verification_status === VERIFIED`, conflicting with the agreed MVP policy that player verification is not mandatory for Season 1 participation.
- Public discovery does not currently use future `registration_open_at` as a gate, reject a season solely because its start date passed, or require title configuration.
- Therefore, a `REGISTRATION_OPEN` label does not prove registration is actually available. The blocker for a particular season requires its live database values and exact API response.

**Required outcome:** one authoritative readiness service for discovery, season details, registration form and submission. Return stable reason codes for clear UI messages and revalidate server-side on submission. Review registration window/start boundary, configured titles, eligible track/division, capacity, account/identity state, title selection and duplicate registration. Do not restore a mandatory verification gate unless product policy changes.

### 3.6 Rules and public content

`CompetitionRuleset` is already season-aware and versioned. However, `buildPlayerFacingRules()` derives public rules from operational JSON, conflicting with the desired separation.

Preserve operational settings for the engine, add/adapt separate authored Season Rules and Season Instructions, support draft/preview/publish/version history, expose only published content publicly, and ensure prose edits cannot change scheduling or advancement. Do not serialize raw operational configuration into public responses.

### 3.7 Title images and storage

A storage module and local storage driver exist, but a complete admin upload/validation/storage/display workflow for title images was not confirmed. Reuse the existing storage abstraction. Define file type/size limits, admin permissions, metadata, public URLs and fallback behaviour; verify the deployment storage is durable before production use.

## 4. Target title-aware model

This is a logical design proposal, not a claim that these tables already exist.

### 4.1 Season title catalogue

Each season title should have a stable ID, season relationship, display name, optional description/participation notes, image reference using existing storage, display order, active/selectable state and appropriate audit/timestamps. Admins can add/edit/reorder/remove titles while configuration is safe. After selections, series or results exist, destructive changes should be blocked or require a controlled audited workflow.

### 4.2 One registration with explicit title participation

Recommended logical relationship:

- **SeasonRegistration:** one record per gamer per season.
- **SelectedTitleParticipation:** one record per selected title, linked to that registration and the season-title entry.
- Enforce one registration per gamer/season and no duplicate title selection within it.
- Validate that each selected title belongs to that season and is selectable.
- A registration can select one or multiple titles, but must never silently select every title.
- Show selected titles in My Competitions and confirmation.
- Define when title selections can be edited, based on registration/track state, and audit permitted changes.
- Define capacity deliberately: season registration, per-title, division, or combined. Do not assume existing division capacity automatically equals title capacity.

Use existing Prisma conventions and assess legacy migration needs. Avoid overloading `DivisionParticipant` with ambiguous title semantics if a distinct relationship is clearer.

### 4.3 Independent title tracks in shared phases

Each title has its own eligible participants, plots, series, results and advancement. Each series is associated with the correct title; results affect only that title track; each title has its own final and champion. All title finals for a season belong to the same final phase, while plot and time can differ. Season completion waits until every required title reaches a valid terminal outcome, subject to a defined cancellation/abandonment policy.

### 4.4 Cross-title scheduling

Hard constraints:

- Never schedule a gamer in overlapping series, including across titles.
- Validate participant count, title/phase/plot association, duplicate appointments and schedule keys.
- Enforce season/phase windows and timezone rules.
- Reserve enough time for all title tracks and finals.
- If infeasible, block schedule generation/lock and return actionable reasons; never silently drop series.

Decide whether unrelated series may overlap. If concurrency is allowed, define capacity limits and enforce them in planning and validation. If global serialization remains, document its capacity impact. Validate the entire season across all title tracks, not each title independently.

## 5. Public website, Dashboard and My League Identity

### 5.1 Public discovery

Signed-out visitors should browse leagues/seasons, see status and registration windows, view title cards/images, read published overview/rules/instructions, browse phases/plots/schedules/series/published results and see the title for each series. Public player profiles are shown only when public visibility is enabled. APIs must use explicit field allowlists and never expose private account data, internal moderation notes, raw operational config or unpublished content. Preserve and test admin authorization.

### 5.2 Player Dashboard

Use concise cards/sections, clear spacing and links to dedicated pages. Recommended content:

1. **Player Profile summary:** gamer tag, region, profile-completion hint.
2. **Account status:** account state, email verification and player verification, shown as distinct concepts.
3. **Competitive record:** reputation and published wins/losses/draws, with a clear empty state.
4. **My Competitions:** registrations and selected titles, plus link to the dedicated page.
5. **Upcoming Schedule:** next series/check-in summary and link to My Schedule.
6. **Career snapshot:** small published-results summary and link to Career History.
7. **Notifications:** unread/recent summary if supported and link to Notifications.
8. **Discover Competitions:** clear CTA when the gamer has no registration or wants another season.
9. **My League Identity:** concise identity summary and edit/view link.

Do not duplicate the full schedule, complete career history, all notifications or full identity form on the dashboard. Use real API data and intentional loading/error/empty states.

### 5.3 My League Identity

Focus only on identity and public profile settings. Do not repeat dashboard sections, registrations, schedule, career or notifications. Responsibilities:

- gamer tag and region;
- avatar/profile image only if supported by the model and upload workflow;
- public-profile visibility toggle;
- profile-completion guidance and public-profile preview;
- edit/save actions with validation and clear success/error feedback.

Keep identity, account status, email verification, player verification and reputation separate. Creating an identity must not require competitive classification. Do not promise image upload until the field and workflow are confirmed; otherwise implement supported fields and scope avatar support separately.

### 5.4 Dedicated pages and navigation

| Page | Responsibility |
|---|---|
| Dashboard | Overview and shortcuts |
| My League Identity | Gamer identity/profile and visibility |
| Competitions | Public discovery |
| My Competitions | Registrations and selected title participation |
| My Schedule | Series, title labels and check-in actions |
| Career History | Season participation and published results |
| Notifications | Personal notifications/read state |

Use existing route conventions and verify paths before creating duplicates. Notifications should use a bell icon; show unread dot/count only if the API supports it.

### 5.5 Season details and registration flow

Season details should show league/season information, status/window, title cards/images, readable rules summary and **Season Rules & Instructions** link, phases/schedule/results, and a registration CTA with availability reason.

Registration flow:
1. Sign in or create the existing gamer account/identity.
2. Select one or more titles offered by the season.
3. Review selected titles and published rules/instructions.
4. Submit one season registration.
5. Confirm only the selected title(s).

If unavailable, show a specific reason from the shared readiness response (e.g. closed/not open, no titles configured, capacity reached, missing eligible identity), not a generic message when the backend knows the reason.

## 6. Implementation priority

These are work packages, not new GitHub issues yet.

### P0 — Correct competition and registration foundations

**P0.1 — Progressive series generation**
- Confirm/document the exact pairing rule.
- Replace all-pairs generation where it conflicts with the approved spec.
- Update unit/integration/E2E tests and capacity estimates.
- Test small, odd and large fields.

**P0.2 — Initial phase generation**
- Trace the real production path from roster lock to first phase.
- Make it auditable, idempotent and permission-protected.
- Ensure it can support title-aware structures after the title model is added.

**P0.3 — Normalization and terminal outcomes**
- Enforce deterministic seed order for odd-field normalization.
- Test normalization winner/loser/draw outcomes.
- Define one-survivor, zero-survivor and cancelled/abandoned outcomes.
- Keep title champion and season completion consistent.

**P0.4 — Shared registration readiness**
- Use one readiness service for discovery, details, form and submission.
- Return stable reason codes and revalidate on submission.
- Remove mandatory `VERIFIED` participation gate in line with the approved MVP policy, while retaining separate security/sanction restrictions.
- Define date boundaries and test stale submissions.

### P1 — Multi-title competition

**P1.1 — Season titles and images:** first-class title data, storage integration, admin create/edit/reorder, safe removal, public-safe output.

**P1.2 — One registration, selected titles:** one season registration; explicit participation per selected title; subset selection; duplicate/ownership validation; capacity rules and legacy migration.

**P1.3 — Title-aware progression:** independent participants/advancement; title association for series/results; finals in the shared final phase; season completion waits for every required title outcome.

**P1.4 — Cross-title scheduling:** prevent player conflicts; decide unrelated-series concurrency; update generator, validator and capacity estimator; return actionable infeasibility diagnostics.

### P2 — Public content and player experience

**P2.1 — Authored rules/instructions:** separate from engine config; edit/version/preview/publish; public only shows published content; no raw config exposure.

**P2.2 — Distinct Dashboard and Identity pages:** dashboard cards and shortcuts; identity page focused on gamer tag, region, supported image field, visibility and preview/edit; remove duplicate content; provide loading/error/empty states.

**P2.3 — Navigation and notifications:** verify routes and avoid duplicates; bell icon; unread indicator only if backed by API; links to My Competitions, My Schedule, Career History, Notifications and Competitions.

**P2.4 — Regression tests:** public browsing signed out; private data hidden; admin protected; registration creates one registration and only selected title participations; no cross-title double-booking; Dashboard and Identity differ; authored content does not alter engine behaviour; title results/finals display correctly.

## 7. Cross-cutting acceptance criteria

- [ ] Season supports one or more configured game titles with safe title images.
- [ ] Gamer registers once and explicitly selects one or more titles.
- [ ] No participation is created for unselected titles.
- [ ] Registration readiness is consistent across discovery, details, form and submission.
- [ ] Verification is not accidentally required contrary to approved MVP policy.
- [ ] Initial and later phases can be generated through the real production workflow.
- [ ] Progressive series generator matches the canonical specification and tests.
- [ ] Odd-field normalization and terminal outcomes are deterministic and tested.
- [ ] Every series has a title association and public title label.
- [ ] Same gamer cannot be double-booked across titles.
- [ ] Concurrency policy is consistent in scheduler, validator and capacity planning.
- [ ] Each title has independent progression and champion resolution.
- [ ] All title finals fit in the same final phase and final-week constraints.
- [ ] Season completion waits for all required title outcomes.
- [ ] Public Rules/Instructions are separate from operational configuration.
- [ ] Public APIs expose only safe, published data.
- [ ] Dashboard and Identity have distinct responsibilities/layouts.
- [ ] Notifications uses a bell icon; unread state is shown only if supported.
- [ ] Existing admin authorization, identity/auth and legacy data remain compatible.
- [ ] Migration/rollback implications are reviewed before live schema changes.

## 8. Decisions to confirm before implementation

1. **Pairing rule:** the supplied spec conflicts with current all-pairs behaviour. Confirm exact per-phase pairing/normalization before changing the generator.
2. **Concurrency:** may unrelated players’ series overlap subject to capacity, or must all series be globally serialized?
3. **Capacity:** per season registration, per title, per division, or multiple layers? Define interactions.
4. **Selection edits:** until what lifecycle point may a gamer add/remove a selected title?
5. **Title-track cancellation:** what if a title has too few eligible players or must be cancelled after registration?
6. **Profile image:** does the current player model support an avatar, and is the upload workflow production-ready?

These choices should be resolved in implementation tickets rather than guessed.

## 9. Source findings vs. proposals

**Observed in the uploaded source/specification:** season/phase/plot/series/game models exist; no distinct season-title relation was found; division participants do not encode selected title participation; series generation creates all possible pairs and tests assert it; scheduler follows the specified windows/check-ins/results deadline/final-week protection; all overlapping series are rejected; normalization depends on supplied order; terminal transitions can fail with fewer than two survivors; registration discovery and submission lack one readiness evaluation; registration currently requires `VERIFIED`; ruleset is versioned but player-facing rules derive from operational JSON; storage abstraction exists but complete title-image admin workflow was not confirmed; no clear production initial-phase generation entry point was found in the reviewed competition service/controller.

**Proposals in this document:** one registration with explicit selected-title participation; title-aware progression/finals; shared readiness service with reason codes; separately authored rules/instructions; redesigned Dashboard and focused Identity page; cross-title scheduling and an explicit concurrency decision; P0/P1/P2 order and acceptance criteria.

All source findings should be checked against the active branch before coding because this assessment is based on the uploaded repository snapshot.
