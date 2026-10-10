CREATE TABLE "competition_series_check_ins" (
  "id" UUID NOT NULL,
  "series_id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "checked_in_at" TIMESTAMPTZ(6) NOT NULL,
  "checked_in_by_id" UUID,
  "is_exception" BOOLEAN NOT NULL DEFAULT false,
  "exception_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_series_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_series_check_ins_exception_reason_check"
    CHECK (("is_exception" = false AND "exception_reason" IS NULL)
      OR ("is_exception" = true AND "exception_reason" IS NOT NULL
        AND length(trim("exception_reason")) > 0)),
  CONSTRAINT "competition_series_check_ins_series_fkey"
    FOREIGN KEY ("series_id") REFERENCES "competition_series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "competition_series_check_ins_player_fkey"
    FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "competition_series_check_ins_operator_fkey"
    FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "competition_series_check_ins_series_player_key"
  ON "competition_series_check_ins"("series_id", "player_id");
CREATE INDEX "competition_series_check_ins_player_checked_in_at_idx"
  ON "competition_series_check_ins"("player_id", "checked_in_at");
