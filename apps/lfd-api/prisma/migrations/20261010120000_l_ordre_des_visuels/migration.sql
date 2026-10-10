-- L'ordre des visuels (plan-evenements-durables.md §7 quater, #12, 2026-10-10).
--
-- ADDITIVE : une colonne nullable, aucune reprise de données. Une ligne sans
-- geste accepte le prochain fait de visuels, quel qu'il soit.
-- Retour arrière : DROP COLUMN, sans perte métier — la colonne ne porte que
-- l'ordre des projections, jamais un visuel.
-- Aucun droit accordé.

ALTER TABLE "public"."catalog_items" ADD COLUMN "visuals_gesture_id" TEXT NULL;
