-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "leagues" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "LeagueStatus" NOT NULL DEFAULT 'ACTIVE',
    "region" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- Preserve existing seasons under the first permanent league during migration.
INSERT INTO "leagues" ("id", "name", "description", "status", "created_at", "updated_at")
SELECT
    '00000000-0000-0000-0000-000000000003',
    'NGL Professional',
    'Legacy league container for existing seasons',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "leagues"
    WHERE "id" = '00000000-0000-0000-0000-000000000003'
);

-- CreateTable
CREATE TABLE "league_operators" (
    "id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "region" TEXT,
    "assigned_division_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_operators_pkey" PRIMARY KEY ("id")
);

-- Add the league relationship without breaking existing rows.
ALTER TABLE "seasons" ADD COLUMN "league_id" UUID;
UPDATE "seasons" SET "league_id" = '00000000-0000-0000-0000-000000000003' WHERE "league_id" IS NULL;
ALTER TABLE "seasons" ALTER COLUMN "league_id" SET NOT NULL;

-- Season names are unique within a league, not globally across the platform.
DROP INDEX IF EXISTS "seasons_name_key";
CREATE UNIQUE INDEX "seasons_league_id_name_key" ON "seasons"("league_id", "name");
CREATE UNIQUE INDEX "leagues_name_key" ON "leagues"("name");
CREATE INDEX "leagues_status_idx" ON "leagues"("status");
CREATE INDEX "seasons_league_id_status_idx" ON "seasons"("league_id", "status");
CREATE UNIQUE INDEX "league_operators_league_id_user_id_key" ON "league_operators"("league_id", "user_id");
CREATE INDEX "league_operators_user_id_idx" ON "league_operators"("user_id");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "league_operators" ADD CONSTRAINT "league_operators_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "league_operators" ADD CONSTRAINT "league_operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
