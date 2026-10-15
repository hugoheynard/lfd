-- LES DÉCLINAISONS DES FICHES REÇUES — lot 3 de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md` (vue
-- « Catalogue publié »).
--
-- `catalog_entries` ne rangeait d'une fiche que ses manques : une fiche
-- inactive et complète paraissait sans aucune déclinaison, puisque
-- `catalog_items` ne garde que ce qui se vend. Deux colonnes, écrites par le
-- SEUL récepteur de `pim.catalog_product_changed`, sous la même condition
-- `applied_seq` que le reste de la ligne :
--   - `variants` : les déclinaisons COMPLÈTES telles que le fait les porte
--     (sku, nom, défaut, prix pro HT proposé, TTC public proposé) ;
--   - `audience_inherited` : la fiche hérite-t-elle l'audience de sa famille.
--
-- ADDITIF : `variants` naît `[]` et `audience_inherited` `NULL` (« on ne sait
-- pas ») sur toute ligne existante — le prochain fait, ou « réémettre tout »,
-- les remplit. Retour arrière : supprimer les deux colonnes.

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_entries"
  ADD COLUMN "variants" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "audience_inherited" BOOLEAN;
