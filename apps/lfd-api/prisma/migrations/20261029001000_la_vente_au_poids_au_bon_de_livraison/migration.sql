-- LA VENTE AU POIDS AU BON DE LIVRAISON — lot P5 de `documentation/pricing/plan-vente-au-poids.md`.
--
-- Une ligne de BL est recopiée de sa ligne de commande, et en recopie
-- désormais l'unité : `piece` (la quantité compte des pièces) ou `weight`
-- (elle compte des grammes, et le prix unitaire s'entend au kilo). Sans elle,
-- un départ partiel recomposerait une ligne au poids en pièces, et le bon
-- dirait « 1250 » au lieu de « 1,25 kg ».
--
-- ADDITIF : une colonne ; elle naît `piece` partout, ce qu'est toute ligne
-- existante (aucun article au poids n'a pu partir avant ce lot).
--
-- Retour arrière : supprimer la colonne et sa contrainte, tant qu'aucune ligne
-- `weight` n'a été écrite.

SET lock_timeout = '5s';

ALTER TABLE "public"."delivery_note_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "delivery_note_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
