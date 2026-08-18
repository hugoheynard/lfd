-- AlterTable : ajoute la référence humaine, backfill des lignes existantes, puis NOT NULL + unique.
ALTER TABLE "companies" ADD COLUMN "reference" TEXT;

UPDATE "companies"
SET "reference" = 'C-' || upper(substr(md5(random()::text || "id"), 1, 6))
WHERE "reference" IS NULL;

ALTER TABLE "companies" ALTER COLUMN "reference" SET NOT NULL;

CREATE UNIQUE INDEX "companies_reference_key" ON "companies"("reference");
