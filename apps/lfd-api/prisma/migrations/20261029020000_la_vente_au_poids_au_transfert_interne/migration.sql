-- LA VENTE AU POIDS AU TRANSFERT INTERNE — reliquat du lot P6 de
-- `documentation/pricing/plan-vente-au-poids.md`.
--
-- Le manifeste figé d'un transfert recopie au départ les lignes des
-- commandes qu'il porte. Une ligne au poids porte des grammes : sans son
-- unité, « 1250 » se lirait « 1 250 pièces » à la réception au site.
--
-- ADDITIF : une colonne ; elle naît `piece` partout, ce qu'est tout
-- manifeste existant (aucun article au poids n'a pu partir avant ce lot ; un
-- réassort est toujours à la pièce).
--
-- Retour arrière : supprimer la colonne et sa contrainte, tant qu'aucune
-- ligne `weight` n'a été écrite.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_internal_transfer_manifest_line"
  ADD COLUMN "sale_unit" TEXT NOT NULL DEFAULT 'piece',
  ADD CONSTRAINT "delivery_internal_transfer_manifest_line_sale_unit_check" CHECK ("sale_unit" IN ('piece', 'weight'));
