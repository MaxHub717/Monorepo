-- Keep historical global rows as legacy records and clone each attached ruleset per owning season.
ALTER TABLE "competition_rulesets"
  ADD COLUMN "season_id" UUID,
  ADD COLUMN "legacy_unassigned" BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX "competition_rulesets_name_version_key";

CREATE TEMP TABLE "season_ruleset_clone_map" (
  "season_id" UUID NOT NULL,
  "old_ruleset_id" UUID NOT NULL,
  "new_ruleset_id" UUID NOT NULL,
  PRIMARY KEY ("season_id", "old_ruleset_id")
) ON COMMIT DROP;

INSERT INTO "season_ruleset_clone_map" ("season_id", "old_ruleset_id", "new_ruleset_id")
SELECT "seasons"."id", "seasons"."ruleset_id", gen_random_uuid()
FROM "seasons"
WHERE "seasons"."ruleset_id" IS NOT NULL;

INSERT INTO "competition_rulesets" (
  "id", "season_id", "legacy_unassigned", "name", "version", "description", "status", "rules",
  "rules_hash", "published_at", "published_by_id", "supersedes_ruleset_id", "created_at", "updated_at"
)
SELECT
  "clone_map"."new_ruleset_id", "clone_map"."season_id", FALSE, "rulesets"."name", "rulesets"."version",
  "rulesets"."description", "rulesets"."status", "rulesets"."rules", "rulesets"."rules_hash",
  "rulesets"."published_at", "rulesets"."published_by_id", NULL, "rulesets"."created_at", "rulesets"."updated_at"
FROM "season_ruleset_clone_map" AS "clone_map"
JOIN "competition_rulesets" AS "rulesets" ON "rulesets"."id" = "clone_map"."old_ruleset_id";

UPDATE "seasons"
SET "ruleset_id" = "clone_map"."new_ruleset_id"
FROM "season_ruleset_clone_map" AS "clone_map"
WHERE "seasons"."id" = "clone_map"."season_id";

CREATE UNIQUE INDEX "competition_rulesets_id_season_id_key"
  ON "competition_rulesets"("id", "season_id");
CREATE UNIQUE INDEX "seasons_ruleset_id_id_key"
  ON "seasons"("ruleset_id", "id");

ALTER TABLE "seasons"
  DROP CONSTRAINT "seasons_ruleset_id_fkey",
  ADD CONSTRAINT "seasons_ruleset_id_fkey"
    FOREIGN KEY ("ruleset_id", "id") REFERENCES "competition_rulesets"("id", "season_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "competition_rulesets"
  DROP CONSTRAINT "competition_rulesets_supersedes_fkey",
  ADD CONSTRAINT "competition_rulesets_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "competition_rulesets_supersedes_fkey"
    FOREIGN KEY ("supersedes_ruleset_id", "season_id") REFERENCES "competition_rulesets"("id", "season_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "competition_rulesets_ownership_check"
    CHECK (("season_id" IS NOT NULL AND "legacy_unassigned" = FALSE) OR ("season_id" IS NULL AND "legacy_unassigned" = TRUE));

CREATE UNIQUE INDEX "competition_rulesets_season_id_name_version_key"
  ON "competition_rulesets"("season_id", "name", "version");
CREATE INDEX "competition_rulesets_season_id_status_idx"
  ON "competition_rulesets"("season_id", "status");
