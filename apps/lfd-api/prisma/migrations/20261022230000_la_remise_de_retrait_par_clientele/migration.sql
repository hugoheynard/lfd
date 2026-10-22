-- La remise de retrait, une par clientèle, avec sa portée (plan
-- documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md, lot A).
--
-- ADDITIVE, et rien n'est effacé (V8) : `discount_mode`/`discount_value`
-- deviennent la remise des PROS, lue seulement si `discount_for_b2b` ; la
-- remise des particuliers est COPIÉE dans ses propres colonnes quand la case
-- B2C était cochée (Q3). Les deux cases restent en base : revenir en arrière
-- reste possible. « Pas de règle sans réduction » et « un mode `only` inclut
-- quelque chose » sont tenus par l'agrégat `Site`, pas ici.

CREATE TYPE "public"."PickupDiscountScope" AS ENUM ('all_except', 'only');
CREATE TYPE "public"."PickupDiscountAudience" AS ENUM ('b2b', 'b2c');
CREATE TYPE "public"."PickupDiscountTarget" AS ENUM ('category', 'product');

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "discount_scope" "public"."PickupDiscountScope" NOT NULL DEFAULT 'all_except',
  ADD COLUMN "b2c_discount_mode" "public"."CartAdjustmentMode",
  ADD COLUMN "b2c_discount_value" INTEGER,
  ADD COLUMN "b2c_discount_scope" "public"."PickupDiscountScope" NOT NULL DEFAULT 'all_except';

-- Reprise (Q3) : la réduction commune devient aussi celle des particuliers là
-- où ils la recevaient. Défaut de portée : `all_except` sans règle — le
-- comportement d'hier.
UPDATE "public"."pickup_addresses"
   SET "b2c_discount_mode" = "discount_mode",
       "b2c_discount_value" = "discount_value"
 WHERE "discount_for_b2c" AND "discount_mode" IS NOT NULL;

CREATE TABLE "public"."pickup_discount_rules" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "audience" "public"."PickupDiscountAudience" NOT NULL,
    "target" "public"."PickupDiscountTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,

    CONSTRAINT "pickup_discount_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pickup_discount_rules_site_id_audience_target_target_id_key"
  ON "public"."pickup_discount_rules"("site_id", "audience", "target", "target_id");
CREATE INDEX "pickup_discount_rules_site_id_idx" ON "public"."pickup_discount_rules"("site_id");

ALTER TABLE "public"."pickup_discount_rules"
  ADD CONSTRAINT "pickup_discount_rules_site_id_fkey" FOREIGN KEY ("site_id")
  REFERENCES "public"."pickup_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- L'éligibilité figée sur la ligne (R2) : les bons passés étaient tous
-- éligibles, et le défaut dit la vérité. Produit et famille en snapshot,
-- NULL sur les bons d'avant.
ALTER TABLE "public"."order_lines"
  ADD COLUMN "pickup_discount_eligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "product_id" TEXT,
  ADD COLUMN "category_id" TEXT;
