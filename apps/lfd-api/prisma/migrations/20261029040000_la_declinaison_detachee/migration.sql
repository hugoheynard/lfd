-- LA DÉCLINAISON DÉTACHÉE — lots G1/G2 de
-- `documentation/catalogue/plan-gestes-de-declinaison.md`.
--
-- Faire d'une déclinaison un produit laisse deux traces, posées dans la même
-- transaction que le détachement : le produit né sait de quelle déclinaison il
-- vient, et la déclinaison archivée sait quel produit elle est devenue — ce qui
-- interdit de la désarchiver (elle se vendrait deux fois).
--
-- ADDITIF : deux colonnes nullables, `NULL` partout pour l'existant (aucun
-- détachement n'a pu avoir lieu avant ce lot). RESTRICT : ni l'une ni l'autre
-- ligne ne se supprime, on archive.
--
-- Retour arrière : supprimer les deux colonnes et leurs contraintes.

SET lock_timeout = '5s';

ALTER TABLE "pim"."product"
  ADD COLUMN "origin_variant_id" TEXT,
  ADD CONSTRAINT "product_origin_variant_id_fkey" FOREIGN KEY ("origin_variant_id")
    REFERENCES "pim"."product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "detached_to_product_id" TEXT,
  ADD CONSTRAINT "product_variant_detached_to_product_id_fkey" FOREIGN KEY ("detached_to_product_id")
    REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
