-- LE PRIX AU KILO, AFFICHÉ PAR AUDIENCE — `documentation/pricing/plan-carte-tarif.md`.
--
-- Hugo, 2026-10-29 : la case unique `price_per_kg_shown` (migration
-- `20261029070000_afficher_le_prix_au_kilo`) devient deux cases, une par
-- audience : le prix public TTC au kilo aux particuliers, le prix pro HT au
-- kilo aux pros.
--
-- ADDITIF + REPRISE DE DONNÉES, petite :
--   1. deux colonnes NOT NULL DEFAULT true — défaut constant, pas de
--      réécriture de table ;
--   2. chacune reprend la valeur de la case unique : une déclinaison décochée
--      reste masquée dans les DEUX audiences, comme aujourd'hui. Le `WHERE`
--      ne touche que les lignes décochées (les autres valent déjà `true`).
--
-- L'ancienne colonne RESTE (CLAUDE.md §0) : le code ne la lit ni ne l'écrit
-- plus. Elle garde donc, figée, la valeur au moment de cette migration.
--
-- Retour arrière : le code précédent relit `price_per_kg_shown`, inchangée ;
-- une case décochée APRÈS cette migration y serait perdue (redécocher).

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "price_per_kg_shown_public" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "price_per_kg_shown_pro" BOOLEAN NOT NULL DEFAULT true;

UPDATE "pim"."product_variant"
   SET "price_per_kg_shown_public" = "price_per_kg_shown",
       "price_per_kg_shown_pro" = "price_per_kg_shown"
 WHERE "price_per_kg_shown" = false;
