-- La pile d'un poste (documentation/fournil/les-postes-du-fournil.md,
-- « La pile d'un poste ») : la place de chaque produit dans son poste.
-- Additive et nullable : aucune recopie. Un produit sans place vient après
-- ceux qui en ont une, dans l'ordre reçu ; la pile d'avant ne bouge pas tant
-- que personne ne la règle.
ALTER TABLE "production"."production_workstation_product" ADD COLUMN "position" INTEGER;
