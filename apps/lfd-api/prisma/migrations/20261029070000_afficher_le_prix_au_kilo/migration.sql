-- AFFICHER LE PRIX AU KILO EN BOUTIQUE — `documentation/pricing/plan-carte-tarif.md`.
--
-- Une case par déclinaison : décochée, le prix au kilo reste saisi au
-- référentiel, mais le canal ne le reçoit plus (le référentiel émet `null`).
--
-- ADDITIF : une colonne NOT NULL DEFAULT true — défaut constant, donc aucune
-- réécriture de table ; tout l'existant garde l'affichage d'aujourd'hui.
--
-- Retour arrière : supprimer la colonne (seul ce plan la lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "price_per_kg_shown" BOOLEAN NOT NULL DEFAULT true;
