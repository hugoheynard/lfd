-- La limite de commande d'une FAMILLE (demande de Hugo du 2026-11-23,
-- documentation/limites-de-commande/plan-limite-par-famille.md §3.4).
--
-- Une limite se pose sur un produit ou sur une famille ; « toute la
-- production » et la déclinaison restent retirées. Une limite de famille
-- porte une liste de produits exclus nommément.
--
-- ADDITIVE : le CHECK s'élargit (aucune ligne existante ne le viole, l'ancien
-- n'admettait que 'product') et une table s'ajoute. Retirer une exclusion
-- pose `removed_at` : aucune ligne ne s'efface, d'où les clés en RESTRICT et
-- l'unicité limitée aux exclusions vivantes.

ALTER TABLE "pim"."order_time_limit"
  DROP CONSTRAINT "order_time_limit_product_only";
ALTER TABLE "pim"."order_time_limit"
  ADD CONSTRAINT "order_time_limit_product_or_family"
  CHECK ("scope_type" IN ('product', 'category'));

CREATE TABLE "pim"."order_time_limit_exclusion" (
  "id"         TEXT PRIMARY KEY,
  "limit_id"   TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "removed_at" TIMESTAMPTZ,
  CONSTRAINT "order_time_limit_exclusion_limit_fkey"
    FOREIGN KEY ("limit_id") REFERENCES "pim"."order_time_limit"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_time_limit_exclusion_product_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "order_time_limit_exclusion_one_live"
  ON "pim"."order_time_limit_exclusion" ("limit_id", "product_id")
  WHERE "removed_at" IS NULL;
