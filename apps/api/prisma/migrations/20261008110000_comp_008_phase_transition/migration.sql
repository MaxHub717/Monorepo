ALTER TABLE "competition_plots"
  ADD COLUMN "player_ids" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE "competition_phase_transition_audits" (
  "id" UUID NOT NULL,
  "from_phase_id" UUID NOT NULL,
  "to_phase_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "advancement_pool" JSONB NOT NULL,
  "eliminated_player_ids" JSONB NOT NULL,
  "source_series_ids" JSONB NOT NULL,
  "phase_window" JSONB NOT NULL,
  "actor_id" UUID,
  "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_phase_transition_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_phase_transition_audits_from_phase_unique" UNIQUE ("from_phase_id"),
  CONSTRAINT "competition_phase_transition_audits_to_phase_unique" UNIQUE ("to_phase_id"),
  CONSTRAINT "competition_phase_transition_audits_idempotency_unique" UNIQUE ("idempotency_key"),
  CONSTRAINT "competition_phase_transition_audits_from_phase_fkey"
    FOREIGN KEY ("from_phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "competition_phase_transition_audits_to_phase_fkey"
    FOREIGN KEY ("to_phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_competition_phase_transition_audit_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'competition phase transition audit rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "competition_phase_transition_audits_immutable"
BEFORE UPDATE OR DELETE ON "competition_phase_transition_audits"
FOR EACH ROW EXECUTE FUNCTION enforce_competition_phase_transition_audit_immutable();

REVOKE UPDATE, DELETE ON "competition_phase_transition_audits" FROM PUBLIC;