-- Le point focal voyage (plan-la-mediatheque-amelioree.md, L4, 2026-10-10).
--
-- ADDITIVE : quatre colonnes nullables, aucune reprise de données. `NULL` dit
-- « personne ne s'est prononcé », et la vitrine recadre alors au centre — ce
-- qu'elle faisait pour toutes les images avant. Le prochain fait de visuels ou
-- le prochain push les remplit.
-- Retour arrière : DROP COLUMN, sans perte métier — la source du point focal
-- reste `media.media_asset.focal_x/focal_y`.
-- Aucun droit accordé.

ALTER TABLE "public"."catalog_items" ADD COLUMN "image_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "image_focal_y" DOUBLE PRECISION NULL,
ADD COLUMN "thumbnail_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "thumbnail_focal_y" DOUBLE PRECISION NULL;
