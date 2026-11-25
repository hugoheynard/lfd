-- Une version plus récente d'une fiche de fonction (documentation/evenements/plan-evenements.md,
-- « Une version plus récente d'une fiche »). Additive : une colonne nullable,
-- et l'unicité du rang ne vaut plus que parmi les fiches en vigueur.

-- La fiche que celle-ci remplace : interne au schéma, jamais effacée (RESTRICT).
ALTER TABLE "events"."function_sheet" ADD COLUMN "replaces_sheet_id" TEXT;
ALTER TABLE "events"."function_sheet"
  ADD CONSTRAINT "function_sheet_replaces_sheet_id_fkey"
  FOREIGN KEY ("replaces_sheet_id") REFERENCES "events"."function_sheet"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "function_sheet_replaces_sheet_id_key"
  ON "events"."function_sheet" ("replaces_sheet_id");

-- La nouvelle version prend le rang de l'ancienne, archivée : le rang n'est
-- unique que parmi les fiches en vigueur.
DROP INDEX "events"."function_sheet_event_id_position_key";
CREATE UNIQUE INDEX "function_sheet_active_position_key"
  ON "events"."function_sheet" ("event_id", "position")
  WHERE "archived_at" IS NULL;
