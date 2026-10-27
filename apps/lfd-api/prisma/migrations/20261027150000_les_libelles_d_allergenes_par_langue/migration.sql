-- LES LIBELLÉS D'ALLERGÈNES PAR LANGUE — plan
-- `documentation/pim/plan-allergenes-en-boutique.md`.
--
-- ADDITIVE : une colonne neuve et nullable sur `catalog_items`, rien de
-- supprimé ni de resserré. `NULL` = « on ne sait pas », l'état de toute ligne
-- reçue avant ce champ ; la boutique n'affiche alors rien. Le prochain fait de
-- chaque fiche la remplit.

ALTER TABLE "public"."catalog_items" ADD COLUMN "allergen_texts" JSONB;
