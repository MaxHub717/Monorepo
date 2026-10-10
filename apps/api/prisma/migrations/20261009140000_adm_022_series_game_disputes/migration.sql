CREATE TYPE "DisputeTargetType" AS ENUM ('MATCH', 'SEASON', 'PHASE', 'PLOT', 'SERIES', 'GAME');

ALTER TABLE "disputes"
  ADD COLUMN "target_type" "DisputeTargetType" NOT NULL DEFAULT 'MATCH',
  ADD COLUMN "target_id" UUID,
  ADD COLUMN "season_id" UUID,
  ADD COLUMN "phase_id" UUID,
  ADD COLUMN "plot_id" UUID,
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "game_id" UUID,
  ADD COLUMN "assigned_reviewer_id" UUID,
  ADD COLUMN "decision" TEXT,
  ADD COLUMN "resolution_reason" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6);

UPDATE "disputes"
SET "target_id" = "match_id",
    "submitted_at" = "created_at";

ALTER TABLE "disputes"
  ALTER COLUMN "target_id" SET NOT NULL,
  ALTER COLUMN "submitted_at" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "match_id" DROP NOT NULL,
  ALTER COLUMN "resolved_at" TYPE TIMESTAMPTZ(6)
    USING "resolved_at" AT TIME ZONE 'UTC';

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_target_matches_target_id_check"
    CHECK (
      ("target_type" = 'MATCH' AND "match_id" = "target_id")
      OR ("target_type" = 'SEASON' AND "season_id" = "target_id")
      OR ("target_type" = 'PHASE' AND "phase_id" = "target_id" AND "season_id" IS NOT NULL)
      OR ("target_type" = 'PLOT' AND "plot_id" = "target_id" AND "phase_id" IS NOT NULL AND "season_id" IS NOT NULL)
      OR ("target_type" = 'SERIES' AND "series_id" = "target_id" AND "plot_id" IS NOT NULL AND "phase_id" IS NOT NULL AND "season_id" IS NOT NULL)
      OR ("target_type" = 'GAME' AND "game_id" = "target_id" AND "series_id" IS NOT NULL AND "plot_id" IS NOT NULL AND "phase_id" IS NOT NULL AND "season_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "disputes_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "disputes_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "disputes_plot_id_fkey"
    FOREIGN KEY ("plot_id") REFERENCES "competition_plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "disputes_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "competition_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "disputes_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "competition_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "disputes_assigned_reviewer_id_fkey"
    FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "disputes_target_type_target_id_status_idx"
  ON "disputes"("target_type", "target_id", "status");
CREATE INDEX "disputes_season_id_status_idx" ON "disputes"("season_id", "status");
CREATE INDEX "disputes_phase_id_status_idx" ON "disputes"("phase_id", "status");
CREATE INDEX "disputes_series_id_status_idx" ON "disputes"("series_id", "status");
CREATE INDEX "disputes_game_id_status_idx" ON "disputes"("game_id", "status");
CREATE INDEX "disputes_assigned_reviewer_id_status_idx" ON "disputes"("assigned_reviewer_id", "status");

CREATE TABLE "dispute_evidence" (
  "id" UUID NOT NULL,
  "dispute_id" UUID NOT NULL,
  "submitted_by_id" UUID,
  "resource_url" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispute_evidence_dispute_id_fkey"
    FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispute_evidence_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "dispute_evidence_dispute_id_created_at_idx"
  ON "dispute_evidence"("dispute_id", "created_at");

CREATE TABLE "dispute_events" (
  "id" UUID NOT NULL,
  "dispute_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "from_status" "DisputeStatus",
  "to_status" "DisputeStatus",
  "actor_id" UUID,
  "actor_role" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispute_events_dispute_id_fkey"
    FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispute_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "dispute_events_dispute_id_created_at_idx"
  ON "dispute_events"("dispute_id", "created_at");
CREATE INDEX "dispute_events_actor_id_created_at_idx"
  ON "dispute_events"("actor_id", "created_at");

CREATE FUNCTION reject_dispute_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Dispute evidence and events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "dispute_evidence_append_only"
BEFORE UPDATE OR DELETE ON "dispute_evidence"
FOR EACH ROW EXECUTE FUNCTION reject_dispute_history_mutation();
CREATE TRIGGER "dispute_events_append_only"
BEFORE UPDATE OR DELETE ON "dispute_events"
FOR EACH ROW EXECUTE FUNCTION reject_dispute_history_mutation();
