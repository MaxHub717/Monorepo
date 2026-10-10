CREATE TYPE "CompetitionSeriesResolutionState" AS ENUM (
  'UNRESOLVED',
  'IN_PROGRESS',
  'RESOLVED',
  'DRAW'
);

CREATE TYPE "CompetitionEliminationOutcome" AS ENUM (
  'WINNER_ADVANCES',
  'BOTH_ELIMINATED'
);

ALTER TABLE "competition_series"
  ADD COLUMN "expected_game_count" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "completed_game_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "home_win_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "away_win_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draw_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resolution_state" "CompetitionSeriesResolutionState" NOT NULL DEFAULT 'UNRESOLVED',
  ADD COLUMN "elimination_outcome" "CompetitionEliminationOutcome",
  ADD COLUMN "eliminated_player_id" UUID;

ALTER TABLE "competition_series"
  ADD CONSTRAINT "competition_series_expected_game_count_check"
    CHECK ("expected_game_count" = 3),
  ADD CONSTRAINT "competition_series_result_counts_check"
    CHECK (
      "completed_game_count" BETWEEN 0 AND 3
      AND "home_win_count" >= 0
      AND "away_win_count" >= 0
      AND "draw_count" >= 0
      AND "home_win_count" + "away_win_count" + "draw_count" = "completed_game_count"
    ),
  ADD CONSTRAINT "competition_series_resolution_check"
    CHECK (
      ("resolution_state" = 'UNRESOLVED' AND "completed_game_count" = 0 AND "winner_player_id" IS NULL AND "elimination_outcome" IS NULL AND "eliminated_player_id" IS NULL)
      OR ("resolution_state" = 'IN_PROGRESS' AND "completed_game_count" BETWEEN 1 AND 2 AND "winner_player_id" IS NULL AND "elimination_outcome" IS NULL AND "eliminated_player_id" IS NULL)
      OR ("resolution_state" = 'RESOLVED' AND "completed_game_count" = 3 AND "home_win_count" <> "away_win_count" AND "winner_player_id" IS NOT NULL AND "elimination_outcome" = 'WINNER_ADVANCES' AND "eliminated_player_id" IS NOT NULL)
      OR ("resolution_state" = 'DRAW' AND "completed_game_count" = 3 AND "home_win_count" = "away_win_count" AND "winner_player_id" IS NULL AND "elimination_outcome" = 'BOTH_ELIMINATED' AND "eliminated_player_id" IS NULL)
    ),
  ADD CONSTRAINT "competition_series_completed_requires_three_games_check"
    CHECK ("status" <> 'COMPLETED' OR ("completed_game_count" = 3 AND "resolution_state" IN ('RESOLVED', 'DRAW')));

ALTER TABLE "competition_games"
  ADD COLUMN "started_at" TIMESTAMPTZ(6),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6),
  ADD COLUMN "result_recorded_at" TIMESTAMPTZ(6),
  ADD COLUMN "result_recorded_by_id" UUID,
  ADD COLUMN "result_reason" TEXT,
  ADD COLUMN "result_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "competition_games"
  ADD CONSTRAINT "competition_games_number_range_check"
    CHECK ("game_number" BETWEEN 1 AND 3),
  ADD CONSTRAINT "competition_games_result_state_check"
    CHECK (
      ("status" = 'COMPLETED' AND "result" IS NOT NULL AND "completed_at" IS NOT NULL AND "result_recorded_at" IS NOT NULL)
      OR ("status" <> 'COMPLETED' AND "result" IS NULL AND "winner_player_id" IS NULL AND "completed_at" IS NULL AND "result_recorded_at" IS NULL)
    ),
  ADD CONSTRAINT "competition_games_result_winner_check"
    CHECK (
      ("result" IS NULL AND "winner_player_id" IS NULL)
      OR ("result" = 'HOME_WIN' AND "home_player_id" IS NOT NULL AND "winner_player_id" = "home_player_id")
      OR ("result" = 'AWAY_WIN' AND "away_player_id" IS NOT NULL AND "winner_player_id" = "away_player_id")
      OR ("result" = 'DRAW' AND "winner_player_id" IS NULL)
    ),
  ADD CONSTRAINT "competition_games_result_version_check"
    CHECK (("result" IS NULL AND "result_version" = 0) OR ("result" IS NOT NULL AND "result_version" > 0));

CREATE TABLE "competition_game_result_audits" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "result_version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "result" "CompetitionGameOutcome",
  "winner_player_id" UUID,
  "home_score" INTEGER,
  "away_score" INTEGER,
  "actor_id" UUID,
  "actor_role" TEXT,
  "reason" TEXT,
  "before_state" JSONB,
  "after_state" JSONB,
  "request_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_game_result_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_game_result_audits_version_unique" UNIQUE ("game_id", "result_version"),
  CONSTRAINT "competition_game_result_audits_version_positive_check" CHECK ("result_version" > 0),
  CONSTRAINT "competition_game_result_audits_game_fkey"
    FOREIGN KEY ("game_id") REFERENCES "competition_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "competition_game_result_audits_game_created_idx"
  ON "competition_game_result_audits"("game_id", "created_at");

CREATE OR REPLACE FUNCTION enforce_competition_game_result_audit_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'competition game result audit rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "competition_game_result_audits_immutable"
BEFORE UPDATE OR DELETE ON "competition_game_result_audits"
FOR EACH ROW EXECUTE FUNCTION enforce_competition_game_result_audit_immutable();

REVOKE UPDATE, DELETE ON "competition_game_result_audits" FROM PUBLIC;

CREATE OR REPLACE FUNCTION enforce_competition_series_three_games()
RETURNS trigger AS $$
DECLARE
  target_series_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'competition_series' THEN
    target_series_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_series_id := OLD.series_id;
  ELSE
    target_series_id := NEW.series_id;
  END IF;

  IF TG_TABLE_NAME = 'competition_games'
     AND TG_OP = 'UPDATE'
     AND OLD.series_id IS DISTINCT FROM NEW.series_id THEN
    RAISE EXCEPTION 'a game cannot be moved between series';
  END IF;

  IF EXISTS (SELECT 1 FROM "competition_series" WHERE "id" = target_series_id)
     AND (SELECT COUNT(*) FROM "competition_games" WHERE "series_id" = target_series_id) <> 3 THEN
    RAISE EXCEPTION 'a series must contain exactly three games';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "competition_series_exactly_three_games"
AFTER INSERT OR UPDATE ON "competition_series"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_competition_series_three_games();

CREATE CONSTRAINT TRIGGER "competition_games_preserve_three_per_series"
AFTER INSERT OR UPDATE OR DELETE ON "competition_games"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_competition_series_three_games();