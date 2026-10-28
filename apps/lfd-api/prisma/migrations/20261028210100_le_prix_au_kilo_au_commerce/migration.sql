-- LE PRIX AU KILO AU COMMERCE — lot K3 de `documentation/pricing/plan-prix-au-kilo.md`.
--
-- Le miroir du catalogue reçoit les deux prix au kilo saisis au référentiel
-- (fil v13). Informatifs : aucune résolution de prix ne les lit.
--
-- ADDITIF : deux colonnes nullables ; les lignes existantes restent `NULL`
-- jusqu'au prochain envoi de leur fiche (ou « Tout réémettre »). Même `CHECK`
-- qu'à la source.
--
-- Retour arrière : supprimer les deux colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "pro_price_per_kg_millicents" INTEGER,
  ADD COLUMN "public_price_per_kg_ttc_cents" INTEGER,
  ADD CONSTRAINT "catalog_items_pro_price_per_kg_millicents_check" CHECK ("pro_price_per_kg_millicents" > 0),
  ADD CONSTRAINT "catalog_items_public_price_per_kg_ttc_cents_check" CHECK ("public_price_per_kg_ttc_cents" > 0);
