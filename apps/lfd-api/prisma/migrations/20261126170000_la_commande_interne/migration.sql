-- LA COMMANDE INTERNE — lot L2 de
-- documentation/comptabilite/facturation/plan-restaurants-maison.md (D4).
--
-- Additive : le CHECK `orders_offer_nature_known` est remplacé par sa liste
-- élargie de `in_house`, la commande d'un de nos restaurants (payeur marqué
-- « maison »). Aucune ligne n'est touchée : toute valeur admise avant l'est
-- encore. Une nature ne se retire jamais : une ligne qui la porte doit rester
-- lisible.
--
-- Le remplacement tient dans la transaction de la migration : il n'y a pas
-- d'instant où la colonne n'est pas gardée.
--
-- Retour arrière : prisma/rollback/20261126170000_la_commande_interne.sql.

ALTER TABLE "public"."orders"
  DROP CONSTRAINT "orders_offer_nature_known",
  ADD CONSTRAINT "orders_offer_nature_known" CHECK (
    "offer_nature" IS NULL
    OR "offer_nature" IN ('tasting', 'event', 'goodwill', 'replacement', 'sample', 'in_house')
  );
