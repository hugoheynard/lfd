-- L'ANNONCE DÉSIGNE UNE OPÉRATION — lot 5 du plan des opérations datées (D11)
--
-- Une info de vitrine (une « annonce ») ouvre au clic un rayon
-- (`link_shelf_key`) ou, désormais, le rayon d'une opération datée
-- (`operation_key`). L'action n'est PAS stockée : elle se déduit des cibles
-- (`operation` si `operation_key`, `shelf` si `link_shelf_key`, `none`
-- sinon), et une action ne peut donc pas contredire sa cible.
--
-- Liée à une opération, l'annonce HÉRITE ce qu'elle laisse vide — le titre
-- compris. La contrainte « une info a un titre » se RELÂCHE donc pour elle
-- seule : c'est un élargissement, aucune ligne existante ne devient invalide
-- (toutes ont `operation_key` NULL, et gardent l'obligation du titre).
--
-- **Additif** : une colonne nullable, sans défaut ni réécriture ; une
-- contrainte remplacée par une plus large ; deux contraintes neuves que toutes
-- les lignes existantes satisfont (leur `operation_key` est NULL).
--
-- Retour arrière, dans cet ordre — seulement tant qu'aucune annonce liée n'a
-- été enregistrée (sinon le titre NULL refuse la contrainte rétablie) :
--   ALTER TABLE "public"."storefront_content" DROP CONSTRAINT "storefront_content_one_target";
--   ALTER TABLE "public"."storefront_content" DROP CONSTRAINT "storefront_content_operation_key";
--   ALTER TABLE "public"."storefront_content" DROP CONSTRAINT "storefront_content_info_title";
--   ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_info_title"
--     CHECK (("kind" = 'info') = ("title" IS NOT NULL));
--   ALTER TABLE "public"."storefront_content" DROP COLUMN "operation_key";
--
-- Plan : documentation/order/architecture-operations-datees.md (D11)

ALTER TABLE "public"."storefront_content" ADD COLUMN "operation_key" TEXT;

-- La forme d'une clé d'opération — la même que `pim.operations` (lot 1).
-- Seulement sur une info : un produit ne désigne pas d'opération.
ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_operation_key" CHECK (
  "operation_key" IS NULL
  OR ("kind" = 'info' AND "operation_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("operation_key") <= 64)
);

-- Un rayon OU une opération, jamais les deux.
ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_one_target" CHECK (
  "link_shelf_key" IS NULL OR "operation_key" IS NULL
);

-- Le titre : jamais sur un produit ; obligatoire sur une info, sauf liée à une
-- opération (hérité). Remplace `("kind" = 'info') = ("title" IS NOT NULL)`.
ALTER TABLE "public"."storefront_content" DROP CONSTRAINT "storefront_content_info_title";
ALTER TABLE "public"."storefront_content" ADD CONSTRAINT "storefront_content_info_title" CHECK (
  ("kind" = 'product' AND "title" IS NULL)
  OR ("kind" = 'info' AND ("title" IS NOT NULL OR "operation_key" IS NOT NULL))
);
