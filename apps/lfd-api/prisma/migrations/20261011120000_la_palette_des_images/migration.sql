-- La palette des images (plan-la-mediatheque-amelioree.md, L9, 2026-10-11).
--
-- ADDITIVE : une colonne nullable, aucune reprise de données. `NULL` dit
-- « pas encore calculée » ; l'écran de la médiathèque la calcule dans le
-- navigateur et la pose par `PUT /media/palette`, qui n'écrit que sur NULL.
-- Retour arrière : DROP COLUMN, sans perte métier — la palette se recalcule
-- depuis les octets.
-- Aucun droit accordé.

ALTER TABLE "media"."media_asset" ADD COLUMN "palette" JSONB NULL;
