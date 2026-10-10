ALTER TABLE "competition_series"
  ADD COLUMN "unresolved_game_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "eliminated_player_ids" JSONB,
  ADD COLUMN "resolution_reason" TEXT;

ALTER TABLE "competition_series"
  DROP CONSTRAINT "competition_series_result_counts_check",
  DROP CONSTRAINT "competition_series_resolution_check",
  DROP CONSTRAINT "competition_series_completed_requires_three_games_check";

ALTER TABLE "competition_series"
  ADD CONSTRAINT "competition_series_result_counts_check"
    CHECK (
      "completed_game_count" BETWEEN 0 AND 3
      AND "home_win_count" >= 0
      AND "away_win_count" >= 0
      AND "draw_count" >= 0
      AND "unresolved_game_count" >= 0
      AND "home_win_count" + "away_win_count" + "draw_count" + "unresolved_game_count" = "completed_game_count"
    ),
  ADD CONSTRAINT "competition_series_resolution_check"
    CHECK (
      (
        "resolution_state" = 'UNRESOLVED'
        AND "completed_game_count" = 0
        AND "elimination_outcome" IS NULL
        AND "eliminated_player_id" IS NULL
        AND "eliminated_player_ids" IS NULL
        AND "resolution_reason" IS NULL
      )
      OR (
        "resolution_state" = 'IN_PROGRESS'
        AND "completed_game_count" BETWEEN 1 AND 2
        AND "elimination_outcome" IS NULL
        AND "eliminated_player_id" IS NULL
        AND "eliminated_player_ids" IS NULL
        AND "resolution_reason" IS NULL
      )
      OR (
        "resolution_state" = 'RESOLVED'
        AND "completed_game_count" = 3
        AND "home_win_count" + "away_win_count" = 3
        AND (("home_win_count" = 2 AND "away_win_count" = 1) OR ("home_win_count" = 1 AND "away_win_count" = 2))
        AND "draw_count" = 0
        AND "unresolved_game_count" = 0
        AND "winner_player_id" IS NOT NULL
        AND "elimination_outcome" = 'WINNER_ADVANCES'
        AND "eliminated_player_id" IS NOT NULL
        AND "eliminated_player_ids" IS NULL
        AND "resolution_reason" = 'NORMAL_RESULT'
      )
      OR (
        "resolution_state" = 'DRAW'
        AND "completed_game_count" BETWEEN 1 AND 3
        AND "draw_count" > 0
        AND "winner_player_id" IS NULL
        AND "elimination_outcome" = 'BOTH_ELIMINATED'
        AND "eliminated_player_id" IS NULL
        AND "eliminated_player_ids" IS NOT NULL
        AND "resolution_reason" = 'GAME_DRAW'
      )
      OR (
        "resolution_state" = 'UNRESOLVED'
        AND "completed_game_count" = 3
        AND "draw_count" = 0
        AND "winner_player_id" IS NULL
        AND "elimination_outcome" = 'BOTH_ELIMINATED'
        AND "eliminated_player_id" IS NULL
        AND "eliminated_player_ids" IS NOT NULL
        AND "resolution_reason" = 'NO_VALID_OUTCOME'
      )
    ),
  ADD CONSTRAINT "competition_series_completed_requires_valid_advancement_check"
    CHECK ("status" <> 'COMPLETED' OR ("completed_game_count" = 3 AND "resolution_state" = 'RESOLVED')),
  ADD CONSTRAINT "competition_series_eliminated_requires_terminal_outcome_check"
    CHECK ("status" <> 'ELIMINATED' OR ("elimination_outcome" = 'BOTH_ELIMINATED' AND "eliminated_player_ids" IS NOT NULL));

ALTER TABLE "competition_games"
  DROP CONSTRAINT "competition_games_result_winner_check",
  ADD CONSTRAINT "competition_games_result_winner_check"
    CHECK (
      ("result" IS NULL AND "winner_player_id" IS NULL)
      OR ("result" = 'HOME_WIN' AND "home_player_id" IS NOT NULL AND "winner_player_id" = "home_player_id")
      OR ("result" = 'AWAY_WIN' AND "away_player_id" IS NOT NULL AND "winner_player_id" = "away_player_id")
      OR (("result" = 'DRAW' OR "result" = 'UNRESOLVED') AND "winner_player_id" IS NULL)
    );

CREATE TABLE "competition_series_resolution_audits" (
  "id" UUID NOT NULL,
  "series_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "outcome" "CompetitionEliminationOutcome" NOT NULL,
  "advancing_player_id" UUID,
  "eliminated_player_ids" JSONB NOT NULL,
  "resolution_reason" TEXT NOT NULL,
  "game_results" JSONB NOT NULL,
  "before_state" JSONB,
  "after_state" JSONB NOT NULL,
  "actor_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_series_resolution_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_series_resolution_audits_series_unique" UNIQUE ("series_id"),
  CONSTRAINT "competition_series_resolution_audits_idempotency_unique" UNIQUE ("idempotency_key"),
  CONSTRAINT "competition_series_resolution_audits_series_fkey"
    FOREIGN KEY ("series_id") REFERENCES "competition_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_competition_series_resolution_audit_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'competition series resolution audit rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "competition_series_resolution_audits_immutable"
BEFORE UPDATE OR DELETE ON "competition_series_resolution_audits"
FOR EACH ROW EXECUTE FUNCTION enforce_competition_series_resolution_audit_immutable();

REVOKE UPDATE, DELETE ON "competition_series_resolution_audits" FROM PUBLIC;