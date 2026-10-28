-- LA VENTE AU POIDS AU COMMERCE — lot P2 de `documentation/pricing/plan-vente-au-poids.md`.
--
-- Le miroir du catalogue reçoit l'unité de vente de chaque déclinaison (fil
-- v14) : `piece` ou `weight`, et au poids le minimum et le pas de saisie en
-- grammes. Stockés seulement : ni la commande ni la vitrine ne les lisent
-- encore (P3, P4).
--
-- ADDITIF : trois colonnes ; `sale_unit` naît `piece` partout, ce qu'est tout
-- l'existant (aucune déclinaison au poids n'a pu traverser avant la v14). Mêmes
-- CHECK qu'à la source (`20261028233000_la_vente_au_poids_saisie`) : à la
-- pièce, ni pas ni minimum.
--
-- Retour arrière : supprimer les trois colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD COLUMN "weight_min_grams" INTEGER,
  ADD COLUMN "weight_step_grams" INTEGER,
  ADD CONSTRAINT "catalog_items_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight')),
  ADD CONSTRAINT "catalog_items_weight_min_grams_check" CHECK ("weight_min_grams" > 0),
  ADD CONSTRAINT "catalog_items_weight_step_grams_check" CHECK ("weight_step_grams" > 0),
  ADD CONSTRAINT "catalog_items_piece_has_no_weight_terms_check" CHECK (
    "sale_unit" = 'weight' OR ("weight_min_grams" IS NULL AND "weight_step_grams" IS NULL)
  );
