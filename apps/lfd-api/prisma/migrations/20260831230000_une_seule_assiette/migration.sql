-- **Une seule assiette.** Le prix d'une déclinaison EST un prix public TTC ;
-- le hors taxe se déduit du taux de chaque canal, il ne se saisit plus.
--
-- Le stock est du seed (92 lignes `ht`, aucune en production) : on ne convertit
-- pas, on repart d'un catalogue semé. Une conversion aurait de toute façon
-- demandé de choisir UN taux par déclinaison, alors qu'un prix public en a un
-- par contexte de vente — c'est tout l'objet de ce modèle.
ALTER TABLE "pim"."product_variant" DROP COLUMN "price_basis";

DROP TYPE "pim"."price_basis";
