-- L'accueil de la vitrine (plan-la-mediatheque-amelioree.md, L6, D7, D9 — 2026-10-10).
--
-- ADDITIVE : deux CHECK ÉLARGIS (la forme `banner`, la bannière 21/9) et deux
-- colonnes nullables sur `storefront_page` (l'image de la porte « Je passe la
-- prendre », permise sur la page `home` seule). Aucune ligne existante n'est
-- touchée : aucune page n'a d'image de porte, aucun objet n'est une bannière.
-- Retour arrière : remettre les deux CHECK de `20260924100100` (refusé tant
-- qu'une bannière existe — la retirer d'abord), DROP des deux colonnes.
-- Aucun droit accordé.

ALTER TABLE "public"."storefront_object" DROP CONSTRAINT "storefront_object_shape",
ADD CONSTRAINT "storefront_object_shape" CHECK ("shape" IN ('card', 'kakemono', 'tile', 'block', 'hero', 'band', 'doubleBand', 'banner'));

ALTER TABLE "public"."storefront_template" DROP CONSTRAINT "storefront_template_shape",
ADD CONSTRAINT "storefront_template_shape" CHECK ("shape" IN ('card', 'kakemono', 'tile', 'block', 'hero', 'band', 'doubleBand', 'banner'));

ALTER TABLE "public"."storefront_page" ADD COLUMN "pickup_door_image_url" TEXT NULL,
ADD COLUMN "pickup_door_image_alt" JSONB NULL,
ADD CONSTRAINT "storefront_page_door_on_home" CHECK ("pickup_door_image_url" IS NULL OR "shelf_key" = 'home'),
ADD CONSTRAINT "storefront_page_door_url" CHECK ("pickup_door_image_url" IS NULL OR length("pickup_door_image_url") > 0),
ADD CONSTRAINT "storefront_page_door_alt_with_image" CHECK ("pickup_door_image_alt" IS NULL OR "pickup_door_image_url" IS NOT NULL),
ADD CONSTRAINT "storefront_page_door_alt_object" CHECK ("pickup_door_image_alt" IS NULL OR jsonb_typeof("pickup_door_image_alt") = 'object');
