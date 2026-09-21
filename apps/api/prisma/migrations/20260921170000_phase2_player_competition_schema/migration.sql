-- CreateEnum
CREATE TYPE "CompetitionFormat" AS ENUM ('ROUND_ROBIN_SINGLE', 'ROUND_ROBIN_DOUBLE');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "MatchParticipantRole" AS ENUM ('HOME', 'AWAY');

-- DropForeignKey
ALTER TABLE "fixtures" DROP CONSTRAINT "fixtures_away_club_id_fkey";

-- DropForeignKey
ALTER TABLE "fixtures" DROP CONSTRAINT "fixtures_home_club_id_fkey";

-- DropForeignKey
ALTER TABLE "match_participants" DROP CONSTRAINT "match_participants_club_id_fkey";

-- DropForeignKey
ALTER TABLE "match_results" DROP CONSTRAINT "match_results_winner_club_id_fkey";

-- DropForeignKey
ALTER TABLE "standings_rows" DROP CONSTRAINT "standings_rows_club_id_fkey";

-- DropIndex
DROP INDEX "standings_rows_season_id_division_id_club_id_key";

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "player_id" UUID;

-- AlterTable
ALTER TABLE "divisions" ADD COLUMN     "format" "CompetitionFormat" NOT NULL DEFAULT 'ROUND_ROBIN_SINGLE',
ALTER COLUMN "capacity" DROP NOT NULL,
ALTER COLUMN "capacity" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fixtures" DROP COLUMN "away_club_id",
DROP COLUMN "home_club_id",
ADD COLUMN     "away_player_id" UUID NOT NULL,
ADD COLUMN     "home_player_id" UUID NOT NULL,
ADD COLUMN     "schedule_key" TEXT;

-- AlterTable
ALTER TABLE "match_participants" DROP COLUMN "club_id",
ADD COLUMN     "player_id" UUID NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "MatchParticipantRole" NOT NULL;

-- AlterTable
ALTER TABLE "match_results" DROP COLUMN "winner_club_id",
ADD COLUMN     "winner_player_id" UUID;

-- AlterTable
ALTER TABLE "penalties" ADD COLUMN     "player_id" UUID,
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "standings_rows" DROP COLUMN "club_id",
ADD COLUMN     "player_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "division_participants" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "division_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "division_participants_division_id_seed_idx" ON "division_participants"("division_id", "seed");

-- CreateIndex
CREATE INDEX "division_participants_season_id_player_id_idx" ON "division_participants"("season_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "division_participants_season_id_player_id_key" ON "division_participants"("season_id", "player_id");

-- CreateIndex
CREATE INDEX "disputes_match_id_status_idx" ON "disputes"("match_id", "status");

-- CreateIndex
CREATE INDEX "disputes_player_id_status_idx" ON "disputes"("player_id", "status");

-- CreateIndex
CREATE INDEX "fixtures_division_id_scheduled_at_idx" ON "fixtures"("division_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "fixtures_division_id_schedule_key_key" ON "fixtures"("division_id", "schedule_key");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_match_id_player_id_key" ON "match_participants"("match_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_match_id_role_key" ON "match_participants"("match_id", "role");

-- CreateIndex
CREATE INDEX "matches_season_id_division_id_status_idx" ON "matches"("season_id", "division_id", "status");

-- CreateIndex
CREATE INDEX "penalties_match_id_status_idx" ON "penalties"("match_id", "status");

-- CreateIndex
CREATE INDEX "penalties_player_id_status_idx" ON "penalties"("player_id", "status");

-- CreateIndex
CREATE INDEX "standings_rows_season_id_division_id_points_idx" ON "standings_rows"("season_id", "division_id", "points");

-- CreateIndex
CREATE UNIQUE INDEX "standings_rows_season_id_division_id_player_id_key" ON "standings_rows"("season_id", "division_id", "player_id");

-- AddForeignKey
ALTER TABLE "division_participants" ADD CONSTRAINT "division_participants_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_participants" ADD CONSTRAINT "division_participants_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_participants" ADD CONSTRAINT "division_participants_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_player_id_fkey" FOREIGN KEY ("home_player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_player_id_fkey" FOREIGN KEY ("away_player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings_rows" ADD CONSTRAINT "standings_rows_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

