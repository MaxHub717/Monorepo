ALTER TABLE "fixtures"
  ADD COLUMN "scheduling_period_number" INTEGER,
  ADD COLUMN "concurrency_slot" INTEGER;

WITH assigned AS (
  SELECT
    fixture."id",
    ((COALESCE(match_week."week_number", 1) - 1) / GREATEST(division."matches_per_participant", 1)) + 1 AS period_number,
    division."concurrent_matches",
    ROW_NUMBER() OVER (
      PARTITION BY
        fixture."division_id",
        COALESCE(match_week."week_number", 1),
        ((COALESCE(match_week."week_number", 1) - 1) / GREATEST(division."matches_per_participant", 1)) + 1
      ORDER BY fixture."fixture_number", fixture."id"
    ) AS period_fixture_number
  FROM "fixtures" AS fixture
  JOIN "divisions" AS division ON division."id" = fixture."division_id"
  LEFT JOIN "match_weeks" AS match_week ON match_week."id" = fixture."match_week_id"
)
UPDATE "fixtures" AS fixture
SET
  "scheduling_period_number" = assigned.period_number,
  "concurrency_slot" = ((assigned.period_fixture_number - 1) / GREATEST(assigned.concurrent_matches, 1)) + 1
FROM assigned
WHERE assigned."id" = fixture."id";

ALTER TABLE "fixtures"
  ADD CONSTRAINT "fixtures_scheduling_period_positive_check"
  CHECK ("scheduling_period_number" IS NULL OR "scheduling_period_number" >= 1),
  ADD CONSTRAINT "fixtures_concurrency_slot_positive_check"
  CHECK ("concurrency_slot" IS NULL OR "concurrency_slot" >= 1);