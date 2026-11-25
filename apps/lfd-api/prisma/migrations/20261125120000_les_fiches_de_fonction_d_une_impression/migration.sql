-- Les fiches de fonction qu'une impression provisoire a portées
-- (documentation/evenements/plan-evenements.md) : la fenêtre d'impression
-- dit « fiche de fonction remplacée depuis l'impression #N ».
--
-- Additive : une colonne neuve, vide par défaut — les impressions déjà
-- tirées n'en portaient aucune. Identifiants opaques du schéma `events`,
-- sans clé étrangère : les deux blocs ne se joignent pas.
ALTER TABLE "production"."provisional_print"
  ADD COLUMN "function_sheet_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
