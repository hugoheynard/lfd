-- LA LIGNE D'ENCAISSEMENT FERMÉE — une valeur d'enum neuve, SEULE
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C5 (C5.4).
-- `cancelled` : l'état TERMINAL de `order_collection` quand l'équipe annule
-- une commande au compte. Écrit dans la transaction de l'annulation ; aucune
-- transition de l'agrégat `OrderCollection` ne l'accepte ensuite — ni le
-- lot, ni « réglée autrement », ni la perte, ni la reprise après rejet.
-- Fermer plutôt que filtrer : `saveAll` est un upsert, un simple contrôle
-- serait écrasé.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute. Aucune donnée n'est réécrite : le code
-- l'emploie ensuite.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."OrderCollectionState" ADD VALUE IF NOT EXISTS 'cancelled';
