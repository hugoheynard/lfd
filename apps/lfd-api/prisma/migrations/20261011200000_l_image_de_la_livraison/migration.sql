-- L'image de la porte livraison (2026-10-11).
--
-- ADDITIVE : quatre colonnes nullables sur `storefront_page`, la jumelle de la
-- porte « Je passe la prendre » (`20261010220000_l_accueil_de_la_vitrine`,
-- `20261011140000_le_point_focal_jusqu_a_la_vitrine`), avec les MÊMES CHECK :
-- sur la page `home` seule, url non vide, texte alternatif seulement avec une
-- image et en objet, point focal à deux coordonnées de 0 à 1 ou aucune.
-- Aucune ligne existante n'est touchée : les colonnes naissent vides, et une
-- porte livraison vide reprend l'image de la porte retrait côté boutique.
--
-- ⚠️ `IS NOT NULL` explicite dans la seconde branche du CHECK focal : sans
-- lui, une seule coordonnée posée donnait `TRUE AND NULL` = NULL, qui PASSE.
--
-- Retour arrière : DROP CONSTRAINT puis DROP COLUMN — perte des seuls réglages
-- de la porte livraison, la boutique retombe sur l'image retrait.
-- Aucun droit accordé.

ALTER TABLE "public"."storefront_page" ADD COLUMN "delivery_door_image_url" TEXT NULL,
ADD COLUMN "delivery_door_image_alt" JSONB NULL,
ADD COLUMN "delivery_door_focal_x" DOUBLE PRECISION NULL,
ADD COLUMN "delivery_door_focal_y" DOUBLE PRECISION NULL,
ADD CONSTRAINT "storefront_page_delivery_door_on_home" CHECK ("delivery_door_image_url" IS NULL OR "shelf_key" = 'home'),
ADD CONSTRAINT "storefront_page_delivery_door_url" CHECK ("delivery_door_image_url" IS NULL OR length("delivery_door_image_url") > 0),
ADD CONSTRAINT "storefront_page_delivery_door_alt_with_image" CHECK ("delivery_door_image_alt" IS NULL OR "delivery_door_image_url" IS NOT NULL),
ADD CONSTRAINT "storefront_page_delivery_door_alt_object" CHECK ("delivery_door_image_alt" IS NULL OR jsonb_typeof("delivery_door_image_alt") = 'object'),
ADD CONSTRAINT "storefront_page_delivery_door_focal_check" CHECK (
  ("delivery_door_focal_x" IS NULL AND "delivery_door_focal_y" IS NULL)
  OR ("delivery_door_focal_x" IS NOT NULL AND "delivery_door_focal_y" IS NOT NULL
      AND "delivery_door_focal_x" BETWEEN 0 AND 1 AND "delivery_door_focal_y" BETWEEN 0 AND 1)
);
