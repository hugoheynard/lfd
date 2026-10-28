-- LE PRIX AU KILO SAISI — lot K0 de `documentation/pricing/plan-prix-au-kilo.md`.
--
-- Deux montants SAISIS par déclinaison, informatifs : le prix au kilo pro HT
-- en millicentimes (l'unité du prix pro), le prix au kilo public TTC en
-- centimes (l'unité du prix public). Rien ne les lit pour tarifer.
--
-- ADDITIF : deux colonnes nullables, aucune ligne réécrite. `> 0` : un prix au
-- kilo à zéro n'a pas de sens et s'afficherait « 0,00 € / kg ».
--
-- Retour arrière : supprimer les deux colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "pro_price_per_kg_millicents" INTEGER,
  ADD COLUMN "public_price_per_kg_ttc_cents" INTEGER,
  ADD CONSTRAINT "product_variant_pro_price_per_kg_millicents_check" CHECK ("pro_price_per_kg_millicents" > 0),
  ADD CONSTRAINT "product_variant_public_price_per_kg_ttc_cents_check" CHECK ("public_price_per_kg_ttc_cents" > 0);
