ALTER TABLE "competition_series"
  ADD COLUMN "participant_player_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "schedule_key" TEXT,
  ADD COLUMN "check_in_opens_at" TIMESTAMPTZ(6),
  ADD COLUMN "check_in_closes_at" TIMESTAMPTZ(6),
  ADD COLUMN "results_deadline_at" TIMESTAMPTZ(6),
  ALTER COLUMN "match_window_start" TYPE TIMESTAMPTZ(6)
    USING "match_window_start" AT TIME ZONE 'UTC',
  ALTER COLUMN "match_window_end" TYPE TIMESTAMPTZ(6)
    USING "match_window_end" AT TIME ZONE 'UTC';

CREATE UNIQUE INDEX "competition_series_schedule_key_key"
  ON "competition_series"("schedule_key");

CREATE INDEX "competition_series_phase_match_window_idx"
  ON "competition_series"("phase_id", "match_window_start", "match_window_end");

ALTER TABLE "competition_series"
  ADD CONSTRAINT "competition_series_participant_ids_check"
    CHECK (jsonb_typeof("participant_player_ids") = 'array' AND jsonb_array_length("participant_player_ids") IN (0, 2)),
  ADD CONSTRAINT "competition_series_schedule_window_check"
    CHECK (
      (
        "match_window_start" IS NULL
        AND "match_window_end" IS NULL
        AND "match_window_timezone" IS NULL
        AND "check_in_opens_at" IS NULL
        AND "check_in_closes_at" IS NULL
        AND "results_deadline_at" IS NULL
      )
      OR (
        "match_window_start" IS NOT NULL
        AND "match_window_end" = "match_window_start" + INTERVAL '60 minutes'
        AND "match_window_timezone" IS NOT NULL
        AND "check_in_opens_at" = "match_window_start" - INTERVAL '60 minutes'
        AND "check_in_closes_at" = "match_window_start" - INTERVAL '30 minutes'
        AND "results_deadline_at" = "match_window_start" + INTERVAL '90 minutes'
        AND EXTRACT(ISODOW FROM ("match_window_start" AT TIME ZONE "match_window_timezone")) BETWEEN 1 AND 6
        AND EXTRACT(HOUR FROM ("match_window_start" AT TIME ZONE "match_window_timezone")) BETWEEN 10 AND 21
        AND EXTRACT(MINUTE FROM ("match_window_start" AT TIME ZONE "match_window_timezone")) = 0
      )
    );