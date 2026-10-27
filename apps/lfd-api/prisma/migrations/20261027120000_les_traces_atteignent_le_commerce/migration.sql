-- LES TRACES ATTEIGNENT LE COMMERCE — règle B de
-- `documentation/pim/plan-allergenes-jamais-bloquants.md`.
--
-- ADDITIVE : deux colonnes neuves sur `catalog_items`, rien de supprimé ni de
-- resserré. `may_contain` nullable (`NULL` = « on ne sait pas », l'état de
-- toute ligne reçue avant ce champ) ; `allergens_precautionary` à `false`,
-- le sens d'avant. Le prochain fait de chaque fiche les réécrit.

ALTER TABLE "public"."catalog_items" ADD COLUMN "may_contain" JSONB;
ALTER TABLE "public"."catalog_items" ADD COLUMN "allergens_precautionary" BOOLEAN NOT NULL DEFAULT false;
