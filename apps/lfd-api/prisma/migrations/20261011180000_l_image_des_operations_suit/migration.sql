-- L'image d'une opération suit la médiathèque sans push
-- (documentation/mediatheque/mediatheque.md §7 bis, 2026-10-11).
--
-- ADDITIVE : une colonne nullable, aucune reprise de données. Une ligne sans
-- geste accepte le prochain fait d'image, quel qu'il soit.
-- Retour arrière : DROP COLUMN, sans perte métier — la colonne ne porte que
-- l'ordre des projections, jamais une image.
-- Aucun droit accordé.

ALTER TABLE "public"."catalog_operations" ADD COLUMN "image_gesture_id" TEXT NULL;
