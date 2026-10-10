CREATE TYPE "CompetitionRulesetStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TABLE "competition_rulesets"
  ADD COLUMN "status" "CompetitionRulesetStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "rules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "rules_hash" TEXT,
  ADD COLUMN "published_at" TIMESTAMPTZ(6),
  ADD COLUMN "published_by_id" UUID,
  ADD COLUMN "supersedes_ruleset_id" UUID;

CREATE INDEX "competition_rulesets_status_published_at_idx"
  ON "competition_rulesets"("status", "published_at");

ALTER TABLE "competition_rulesets"
  ADD CONSTRAINT "competition_rulesets_supersedes_fkey"
    FOREIGN KEY ("supersedes_ruleset_id") REFERENCES "competition_rulesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "competition_rulesets_publication_state_check"
    CHECK (
      ("status" = 'DRAFT' AND "published_at" IS NULL AND "rules_hash" IS NULL)
      OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "rules_hash" IS NOT NULL)
    );

ALTER TABLE "seasons"
  DROP CONSTRAINT "seasons_ruleset_id_fkey",
  ADD CONSTRAINT "seasons_ruleset_id_fkey"
    FOREIGN KEY ("ruleset_id") REFERENCES "competition_rulesets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_published_competition_ruleset_immutable()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published competition rulesets are immutable; create a new version';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "competition_rulesets_published_immutable"
BEFORE UPDATE OR DELETE ON "competition_rulesets"
FOR EACH ROW EXECUTE FUNCTION enforce_published_competition_ruleset_immutable();