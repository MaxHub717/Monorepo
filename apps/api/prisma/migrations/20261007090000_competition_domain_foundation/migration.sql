CREATE TYPE "CompetitionPhaseType" AS ENUM (
  'QUALIFYING',
  'PLAYOFF',
  'FINAL',
  'CUSTOM'
);

CREATE TYPE "CompetitionPlotStatus" AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED'
);

CREATE TYPE "CompetitionSeriesStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'ELIMINATED',
  'DISPUTED'
);

CREATE TYPE "CompetitionGameStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED'
);

CREATE TYPE "CompetitionGameOutcome" AS ENUM (
  'HOME_WIN',
  'AWAY_WIN',
  'DRAW',
  'UNRESOLVED'
);

CREATE TABLE "competition_rulesets" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_rulesets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competition_rulesets_name_version_key"
  ON "competition_rulesets"("name", "version");

ALTER TABLE "seasons"
  ADD COLUMN "competition_timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "ruleset_id" UUID,
  ADD COLUMN "ruleset_name" TEXT,
  ADD COLUMN "ruleset_version" TEXT,
  ADD COLUMN "competition_config" JSONB;

ALTER TABLE "seasons"
  ADD CONSTRAINT "seasons_ruleset_id_fkey"
    FOREIGN KEY ("ruleset_id") REFERENCES "competition_rulesets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "competition_phases" (
  "id" UUID NOT NULL,
  "season_id" UUID NOT NULL,
  "phase_number" INTEGER NOT NULL,
  "phase_type" "CompetitionPhaseType" NOT NULL DEFAULT 'QUALIFYING',
  "name" TEXT,
  "start_at" TIMESTAMP(3),
  "end_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "participating_player_ids" JSONB,
  "configuration" JSONB,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_phases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_phases_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "competition_phases_season_id_phase_number_key"
  ON "competition_phases"("season_id", "phase_number");

CREATE TABLE "competition_plots" (
  "id" UUID NOT NULL,
  "phase_id" UUID NOT NULL,
  "name" TEXT,
  "status" "CompetitionPlotStatus" NOT NULL DEFAULT 'ACTIVE',
  "configuration" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_plots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_plots_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "competition_plots_phase_id_status_idx"
  ON "competition_plots"("phase_id", "status");

CREATE TABLE "competition_series" (
  "id" UUID NOT NULL,
  "season_id" UUID NOT NULL,
  "phase_id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "series_number" INTEGER,
  "status" "CompetitionSeriesStatus" NOT NULL DEFAULT 'DRAFT',
  "start_at" TIMESTAMP(3),
  "end_at" TIMESTAMP(3),
  "match_window_start" TIMESTAMP(3),
  "match_window_end" TIMESTAMP(3),
  "match_window_timezone" TEXT,
  "winner_player_id" UUID,
  "configuration" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_series_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "competition_series_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "competition_series_plot_id_fkey"
    FOREIGN KEY ("plot_id") REFERENCES "competition_plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "competition_series_phase_id_plot_id_series_number_key"
  ON "competition_series"("phase_id", "plot_id", "series_number");

CREATE TABLE "competition_games" (
  "id" UUID NOT NULL,
  "series_id" UUID NOT NULL,
  "game_number" INTEGER NOT NULL,
  "home_player_id" UUID,
  "away_player_id" UUID,
  "winner_player_id" UUID,
  "home_score" INTEGER,
  "away_score" INTEGER,
  "result" "CompetitionGameOutcome",
  "status" "CompetitionGameStatus" NOT NULL DEFAULT 'PENDING',
  "scheduled_at" TIMESTAMP(3),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "competition_games_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_games_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "competition_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "competition_games_series_id_game_number_key"
  ON "competition_games"("series_id", "game_number");