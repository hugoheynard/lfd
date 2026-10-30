-- LA TRACE DE LA DÉCLINAISON D'ORIGINE — `documentation/catalogue/plan-pro-voit-les-declinaisons.md`,
-- § « Trace de la déclinaison d'origine » (décision de Hugo du 2026-10-30).
--
-- Au référentiel, la déclinaison qu'un détachement fait naître garde la
-- déclinaison dont elle est la copie ; au commerce, chaque article garde le
-- SKU de cette déclinaison d'origine. La succession des références suit
-- désormais cette trace plutôt que le défaut de la fiche née.
--
-- ADDITIF : deux colonnes nullables, sans défaut, et une clé étrangère sur
-- une colonne entièrement NULL. `NULL` = pas une copie de détachement, ou
-- détachée avant ce lot — non reconstituable, la règle du défaut s'applique.
-- Aucune donnée réécrite.
--
-- Retour arrière : supprimer la contrainte et les deux colonnes.

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "detached_from_variant_id" TEXT;

ALTER TABLE "pim"."product_variant"
  ADD CONSTRAINT "product_variant_detached_from_variant_id_fkey"
  FOREIGN KEY ("detached_from_variant_id") REFERENCES "pim"."product_variant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "detached_from_variant_sku" TEXT;
