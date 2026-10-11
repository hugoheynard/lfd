-- Le point focal jusqu'à la vitrine (plan-la-mediatheque-amelioree.md, L10,
-- 2026-10-11).
--
-- ADDITIVE : six colonnes nullables, aucune reprise de données. `NULL` dit
-- « personne ne s'est prononcé », et la boutique recadre alors au centre — ce
-- qu'elle faisait pour toutes ces images avant. Le prochain enregistrement de
-- la vitrine, la prochaine redescription à la médiathèque ou le prochain push
-- du catalogue les remplissent.
--
-- Les CHECK tiennent la paire : un point focal a ses DEUX coordonnées, chacune
-- une fraction de 0 à 1, ou aucune. Aucune ligne existante ne peut les violer
-- (les colonnes naissent vides).
--
-- ⚠️ `IS NOT NULL` explicite dans la seconde branche : sans lui, une seule
-- coordonnée posée rendait `TRUE AND NULL` = NULL, et un CHECK qui vaut NULL
-- PASSE. La paire n'aurait rien tenu.
--
-- Retour arrière : DROP CONSTRAINT puis DROP COLUMN, sans perte métier — la
-- source du point focal reste `media.media_asset.focal_x/focal_y`.
-- Aucun droit accordé.

ALTER TABLE "public"."storefront_content" ADD COLUMN "image_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "image_focal_y" DOUBLE PRECISION NULL;

ALTER TABLE "public"."storefront_page" ADD COLUMN "pickup_door_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "pickup_door_focal_y" DOUBLE PRECISION NULL;

ALTER TABLE "public"."catalog_operations" ADD COLUMN "image_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "image_focal_y" DOUBLE PRECISION NULL;

ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_image_focal_check" CHECK (
  ("image_focal_x" IS NULL AND "image_focal_y" IS NULL)
  OR ("image_focal_x" IS NOT NULL AND "image_focal_y" IS NOT NULL
      AND "image_focal_x" BETWEEN 0 AND 1 AND "image_focal_y" BETWEEN 0 AND 1)
);

ALTER TABLE "public"."storefront_page" ADD CONSTRAINT "storefront_page_pickup_door_focal_check" CHECK (
  ("pickup_door_focal_x" IS NULL AND "pickup_door_focal_y" IS NULL)
  OR ("pickup_door_focal_x" IS NOT NULL AND "pickup_door_focal_y" IS NOT NULL
      AND "pickup_door_focal_x" BETWEEN 0 AND 1 AND "pickup_door_focal_y" BETWEEN 0 AND 1)
);

ALTER TABLE "public"."catalog_operations" ADD CONSTRAINT "catalog_operations_image_focal_check" CHECK (
  ("image_focal_x" IS NULL AND "image_focal_y" IS NULL)
  OR ("image_focal_x" IS NOT NULL AND "image_focal_y" IS NOT NULL
      AND "image_focal_x" BETWEEN 0 AND 1 AND "image_focal_y" BETWEEN 0 AND 1)
);
