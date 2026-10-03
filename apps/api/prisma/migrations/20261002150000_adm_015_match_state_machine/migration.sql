ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'AWAITING_RESULT';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'RESULT_SUBMITTED';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TABLE "match_status_transitions" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "reason" TEXT,
    "correlation_id" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_status_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "match_status_transitions_match_id_transitioned_at_idx"
ON "match_status_transitions"("match_id", "transitioned_at");

ALTER TABLE "match_status_transitions"
  ADD CONSTRAINT "match_status_transitions_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "match_status_transitions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
