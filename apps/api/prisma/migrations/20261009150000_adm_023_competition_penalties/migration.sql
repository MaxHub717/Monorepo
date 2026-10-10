CREATE TYPE "PenaltyScopeType" AS ENUM ('PLAYER', 'CLUB', 'MATCH', 'SEASON', 'PHASE', 'PLOT', 'SERIES', 'GAME', 'USER', 'LEGACY');
CREATE TYPE "PenaltyEffectType" AS ENUM ('NONE', 'POINTS_DEDUCTION', 'GAME_FORFEIT', 'SERIES_FORFEIT', 'EXECUTION_BLOCK', 'ADVANCEMENT_EXCLUSION', 'COMPETITION_DISQUALIFICATION');
CREATE TYPE "PenaltyEffectStatus" AS ENUM ('NOT_APPLICABLE', 'DECLARED_NOT_APPLIED', 'APPLIED', 'EXPIRED', 'REVOKED');

ALTER TABLE "penalties"
  ADD COLUMN "scope_type" "PenaltyScopeType" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "scope_id" UUID,
  ADD COLUMN "season_id" UUID,
  ADD COLUMN "phase_id" UUID,
  ADD COLUMN "plot_id" UUID,
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "game_id" UUID,
  ADD COLUMN "issued_by_id" UUID,
  ADD COLUMN "effect_type" "PenaltyEffectType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "effect_status" "PenaltyEffectStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "effect_amount" INTEGER,
  ADD COLUMN "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "penalties"
SET "scope_type" = CASE
      WHEN "match_id" IS NOT NULL THEN 'MATCH'::"PenaltyScopeType"
      WHEN "club_id" IS NOT NULL THEN 'CLUB'::"PenaltyScopeType"
      WHEN "player_id" IS NOT NULL THEN 'PLAYER'::"PenaltyScopeType"
      WHEN "user_id" IS NOT NULL THEN 'USER'::"PenaltyScopeType"
      ELSE 'LEGACY'::"PenaltyScopeType"
    END,
    "scope_id" = COALESCE("match_id", "club_id", "player_id", "user_id"),
    "effect_type" = CASE "type"
      WHEN 'FORFEIT' THEN 'SERIES_FORFEIT'::"PenaltyEffectType"
      WHEN 'POINT_DEDUCTION' THEN 'POINTS_DEDUCTION'::"PenaltyEffectType"
      WHEN 'SUSPENSION' THEN 'EXECUTION_BLOCK'::"PenaltyEffectType"
      WHEN 'BAN' THEN 'EXECUTION_BLOCK'::"PenaltyEffectType"
      ELSE 'NONE'::"PenaltyEffectType"
    END,
    "effect_status" = CASE
      WHEN "type" = 'WARNING' THEN 'NOT_APPLICABLE'::"PenaltyEffectStatus"
      ELSE 'DECLARED_NOT_APPLIED'::"PenaltyEffectStatus"
    END,
    "effective_at" = "issued_at",
    "reason" = COALESCE(NULLIF(trim("reason"), ''), 'Legacy penalty: reason not recorded');

ALTER TABLE "penalties"
  ALTER COLUMN "reason" SET NOT NULL,
  ADD CONSTRAINT "penalties_scope_target_check"
    CHECK (
      ("scope_type" = 'LEGACY' AND "scope_id" IS NULL)
      OR ("scope_type" = 'PLAYER' AND "scope_id" = "player_id" AND "player_id" IS NOT NULL)
      OR ("scope_type" = 'CLUB' AND "scope_id" = "club_id" AND "club_id" IS NOT NULL)
      OR ("scope_type" = 'MATCH' AND "scope_id" = "match_id" AND "match_id" IS NOT NULL)
      OR ("scope_type" = 'SEASON' AND "scope_id" = "season_id" AND "season_id" IS NOT NULL)
      OR ("scope_type" = 'PHASE' AND "scope_id" = "phase_id" AND "phase_id" IS NOT NULL)
      OR ("scope_type" = 'PLOT' AND "scope_id" = "plot_id" AND "plot_id" IS NOT NULL)
      OR ("scope_type" = 'SERIES' AND "scope_id" = "series_id" AND "series_id" IS NOT NULL)
      OR ("scope_type" = 'GAME' AND "scope_id" = "game_id" AND "game_id" IS NOT NULL)
      OR ("scope_type" = 'USER' AND "scope_id" = "user_id" AND "user_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "penalties_effect_amount_check"
    CHECK ("effect_amount" IS NULL OR "effect_amount" > 0),
  ADD CONSTRAINT "penalties_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "penalties_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "penalties_plot_id_fkey"
    FOREIGN KEY ("plot_id") REFERENCES "competition_plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "penalties_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "competition_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "penalties_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "competition_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "penalties_issued_by_id_fkey"
    FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "penalties_scope_type_scope_id_status_idx" ON "penalties"("scope_type", "scope_id", "status");
CREATE INDEX "penalties_season_id_phase_id_status_idx" ON "penalties"("season_id", "phase_id", "status");
CREATE INDEX "penalties_series_id_status_idx" ON "penalties"("series_id", "status");
CREATE INDEX "penalties_game_id_status_idx" ON "penalties"("game_id", "status");
CREATE INDEX "penalties_issued_by_id_status_idx" ON "penalties"("issued_by_id", "status");

CREATE TABLE "penalty_events" (
  "id" UUID NOT NULL,
  "penalty_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "from_status" "PenaltyStatus",
  "to_status" "PenaltyStatus",
  "actor_id" UUID,
  "actor_role" TEXT,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "penalty_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "penalty_events_penalty_id_fkey"
    FOREIGN KEY ("penalty_id") REFERENCES "penalties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "penalty_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "penalty_events_penalty_id_created_at_idx" ON "penalty_events"("penalty_id", "created_at");

CREATE FUNCTION reject_penalty_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Penalty events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "penalty_events_append_only"
BEFORE UPDATE OR DELETE ON "penalty_events"
FOR EACH ROW EXECUTE FUNCTION reject_penalty_event_mutation();

ALTER TYPE "PenaltyType" ADD VALUE IF NOT EXISTS 'DISQUALIFICATION';
