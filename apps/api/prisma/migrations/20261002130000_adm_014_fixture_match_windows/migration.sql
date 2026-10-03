CREATE TYPE "FixtureSchedulingStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'RESCHEDULED');

-- Legacy scheduled_at values were written from UTC instants into TIMESTAMP(3).
ALTER TABLE "fixtures"
  ALTER COLUMN "scheduled_at" TYPE TIMESTAMPTZ(6)
    USING "scheduled_at" AT TIME ZONE 'UTC',
  ADD COLUMN "scheduled_timezone" TEXT,
  ADD COLUMN "check_in_opens_at" TIMESTAMPTZ(6),
  ADD COLUMN "check_in_closes_at" TIMESTAMPTZ(6),
  ADD COLUMN "play_window_opens_at" TIMESTAMPTZ(6),
  ADD COLUMN "play_window_closes_at" TIMESTAMPTZ(6),
  ADD COLUMN "scheduling_status" "FixtureSchedulingStatus" NOT NULL DEFAULT 'UNSCHEDULED';

UPDATE "fixtures"
SET
  "scheduled_timezone" = 'UTC',
  "scheduling_status" = 'SCHEDULED'
WHERE "scheduled_at" IS NOT NULL;

ALTER TABLE "fixtures"
  ADD CONSTRAINT "fixtures_scheduling_windows_order_check"
  CHECK (
    ("check_in_opens_at" IS NULL AND "check_in_closes_at" IS NULL
      AND "play_window_opens_at" IS NULL AND "play_window_closes_at" IS NULL)
    OR (
      "check_in_opens_at" IS NOT NULL
      AND "check_in_closes_at" IS NOT NULL
      AND "play_window_opens_at" IS NOT NULL
      AND "play_window_closes_at" IS NOT NULL
      AND "check_in_opens_at" < "check_in_closes_at"
      AND "check_in_closes_at" <= "play_window_opens_at"
      AND "play_window_opens_at" <= "scheduled_at"
      AND "scheduled_at" <= "play_window_closes_at"
      AND "play_window_opens_at" < "play_window_closes_at"
    )
  );

CREATE INDEX "fixtures_division_scheduling_window_idx"
ON "fixtures"("division_id", "check_in_opens_at", "play_window_closes_at");