ALTER TABLE "fixtures" ADD COLUMN "fixture_number" INTEGER;

CREATE UNIQUE INDEX "fixtures_division_id_fixture_number_key"
ON "fixtures"("division_id", "fixture_number");