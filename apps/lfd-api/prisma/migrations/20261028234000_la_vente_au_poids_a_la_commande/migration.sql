-- LA VENTE AU POIDS À LA COMMANDE — lot P3 de `documentation/pricing/plan-vente-au-poids.md`.
--
-- Chaque ligne de commande porte l'unité de sa quantité, figée à la passation
-- comme son prix : `piece` (la quantité compte des pièces) ou `weight` (elle
-- compte des grammes, et le prix unitaire s'entend au kilo).
--
-- ADDITIF : une colonne ; elle naît `piece` partout, ce qu'est toute ligne
-- existante (aucun article au poids n'a pu être commandé avant ce lot).
--
-- Retour arrière : supprimer la colonne et sa contrainte, tant qu'aucune ligne
-- `weight` n'a été écrite.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_lines"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "order_lines_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
