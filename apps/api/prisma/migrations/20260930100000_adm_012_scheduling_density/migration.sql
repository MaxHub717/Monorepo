ALTER TABLE "divisions"
  ADD COLUMN "registration_capacity" INTEGER,
  ADD COLUMN "competition_participant_count" INTEGER,
  ADD COLUMN "scheduling_period_days" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "matches_per_participant" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "match_window_start_minutes" INTEGER,
  ADD COLUMN "match_window_end_minutes" INTEGER,
  ADD COLUMN "match_window_timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "concurrent_matches" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "division_participants"
  ADD COLUMN "competition_selected" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_registration_capacity_check"
  CHECK ("registration_capacity" IS NULL OR "registration_capacity" >= 2);

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_competition_participant_count_check"
  CHECK ("competition_participant_count" IS NULL OR "competition_participant_count" >= 2);

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_capacity_relationship_check"
  CHECK (
    "capacity" IS NULL
    OR "competition_participant_count" IS NULL
    OR "competition_participant_count" <= "capacity"
  );

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_registration_capacity_relationship_check"
  CHECK (
    "registration_capacity" IS NULL
    OR "capacity" IS NULL
    OR "registration_capacity" >= "capacity"
  );

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_scheduling_period_days_check"
  CHECK ("scheduling_period_days" >= 1);

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_matches_per_participant_check"
  CHECK ("matches_per_participant" >= 1);

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_match_window_check"
  CHECK (
    ("match_window_start_minutes" IS NULL AND "match_window_end_minutes" IS NULL)
    OR (
      "match_window_start_minutes" >= 0
      AND "match_window_start_minutes" < 1440
      AND "match_window_end_minutes" > 0
      AND "match_window_end_minutes" <= 1440
      AND "match_window_end_minutes" > "match_window_start_minutes"
    )
  );

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_concurrent_matches_check"
  CHECK ("concurrent_matches" >= 1);