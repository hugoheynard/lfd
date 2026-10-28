-- LA VENTE AU POIDS SAISIE — lot P1 de `documentation/pricing/plan-vente-au-poids.md`.
--
-- Sur chaque déclinaison : l'unité de vente (`piece` | `weight`), et au poids
-- le minimum et le pas de saisie en grammes ; plus le drapeau « déjà publiée »,
-- qui fige l'unité (une ligne de commande a pu la lire).
--
-- ADDITIF : quatre colonnes ; `sale_unit` naît `piece` partout, ce qu'est tout
-- l'existant. Les CHECK tiennent la cohérence : à la pièce, ni pas ni minimum.
--
-- Le drapeau `has_been_published` est rempli pour l'existant, au plus large :
-- toute déclinaison d'une fiche en vente aujourd'hui, ou dont la fiche a été
-- mise en vente un jour (fait `product.published` du journal — une fiche
-- retirée a pu être commandée). Une déclinaison figée à tort se contourne par
-- une autre déclinaison ; une déclinaison libérée à tort ferait mentir des
-- factures.
--
-- Retour arrière : supprimer les quatre colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD COLUMN "weight_min_grams" INTEGER,
  ADD COLUMN "weight_step_grams" INTEGER,
  ADD COLUMN "has_been_published" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "product_variant_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight')),
  ADD CONSTRAINT "product_variant_weight_min_grams_check" CHECK ("weight_min_grams" > 0),
  ADD CONSTRAINT "product_variant_weight_step_grams_check" CHECK ("weight_step_grams" > 0),
  ADD CONSTRAINT "product_variant_piece_has_no_weight_terms_check" CHECK (
    "sale_unit" = 'weight' OR ("weight_min_grams" IS NULL AND "weight_step_grams" IS NULL)
  );

UPDATE "pim"."product_variant" AS v
SET "has_been_published" = true
WHERE v."product_id" IN (
  SELECT p."id" FROM "pim"."product" AS p WHERE p."status" = 'published'
  UNION
  SELECT e."subject_id" FROM "growth"."activity_events" AS e
  WHERE e."type" = 'product.published' AND e."subject_type" = 'product'
);
