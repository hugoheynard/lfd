-- L'heure de clôture, par opération (Hugo, 2026-10-16) : la boutique dit
-- « avant le 21 décembre à 12:00 » ou le jour seul. Additive : NOT NULL avec
-- un défaut constant, sans réécriture de table ; toutes les opérations
-- existantes affichent l'heure.
ALTER TABLE "public"."catalog_operations"
  ADD COLUMN "shows_order_until_time" BOOLEAN NOT NULL DEFAULT true;
