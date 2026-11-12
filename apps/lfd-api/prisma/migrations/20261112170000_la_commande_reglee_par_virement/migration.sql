-- LA COMMANDE RÉGLÉE PAR VIREMENT — une valeur d'enum neuve, SEULE
--
-- Plan documentation/comptabilite/plan-paiement-au-compte-par-virement.md,
-- lot T3 (V7). `settled_by_transfer` : l'état TERMINAL de `order_collection`
-- quand un virement reçu règle la facture d'une commande. Écrit par
-- l'agrégat `OrderCollection` dans la transaction du geste « virement reçu ».
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute (le CHECK qui la lit est dans la suivante).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."OrderCollectionState" ADD VALUE IF NOT EXISTS 'settled_by_transfer';
