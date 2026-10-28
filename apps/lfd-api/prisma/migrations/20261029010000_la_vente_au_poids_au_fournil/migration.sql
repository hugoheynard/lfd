-- LA VENTE AU POIDS AU FOURNIL ET AU COLISAGE — lot P6 de
-- `documentation/pricing/plan-vente-au-poids.md`.
--
-- Une ligne de commande porte son unité depuis P3 (`order_lines.sale_unit`).
-- Le fournil la recopie à l'arrêt, sur la ligne figée et sur le compte à
-- produire ; le colisage la recopie de la liste à coliser. Sans elle, une
-- ligne de 1 250 grammes se lirait « 1 250 pièces » au four comme au bac.
--
-- ADDITIF : trois colonnes ; elles naissent `piece` partout, ce qu'est toute
-- ligne existante (aucun article au poids n'a pu être inscrit avant ce lot).
--
-- Retour arrière : supprimer les colonnes et leurs contraintes, tant
-- qu'aucune ligne `weight` n'a été écrite.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_order_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "production_order_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));

ALTER TABLE "production"."production_count"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "production_count_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));

ALTER TABLE "packing"."packing_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "packing_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
