-- LE PRÉLÈVEMENT SUIT LA FACTURE — lot F2
-- (`documentation/facturation/plan-le-prelevement-suit-la-facture.md`)
--
-- Une ligne de débit prélève désormais le total TTC de la facture calculée en
-- une fois sur ses bons, et non plus la somme des bons. Deux ajouts, tous deux
-- additifs :
--
-- 1. `unbillable` : un bon qu'on ne sait pas facturer (total qui ne se
--    recompose pas, surtaxe sans taux, taux de ligne illisible) est ÉCARTÉ du
--    lot, nommé, et revient au lot suivant — il ne bloque pas les autres
--    payeurs de l'entité. Aucune ligne ne l'emploie dans cette transaction
--    (une valeur d'enum ne s'emploie pas dans la transaction qui l'ajoute).
--    ⚠️ IRRÉVERSIBLE et sans conséquence : Postgres ne sait pas ôter une
--    valeur d'enum ; un retour arrière la laisse en place, inutilisée.
--
-- 2. `orders_total_cents` : la somme des bons de la ligne, à côté de son
--    montant facturé — l'écart se lit sans jointure. NULLABLE : les lignes des
--    lots constitués avant ce lot n'ont jamais calculé de facture, et on
--    n'invente pas leur valeur.

ALTER TYPE "public"."CollectionExclusionReason" ADD VALUE IF NOT EXISTS 'unbillable';

ALTER TABLE "public"."collection_batch_line" ADD COLUMN "orders_total_cents" INTEGER;
