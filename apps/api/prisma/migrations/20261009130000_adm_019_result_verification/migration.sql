CREATE TYPE "GameResultVerificationStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CORRECTION_REQUESTED',
  'OVERRIDDEN'
);

CREATE TABLE "competition_game_result_verifications" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "result_version" INTEGER NOT NULL,
  "status" "GameResultVerificationStatus" NOT NULL,
  "actor_id" UUID,
  "actor_role" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_game_result_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_game_result_verifications_game_fkey"
    FOREIGN KEY ("game_id") REFERENCES "competition_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "competition_game_result_verifications_game_version_idx"
  ON "competition_game_result_verifications"("game_id", "result_version", "created_at");
