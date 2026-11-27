-- LES FAVORIS AU PLANIFICATEUR, ET LE BALAYAGE PAR L'INSTANT DE CONVERSION
-- (documentation/commandes/planificateur/plan-planificateur-de-commandes.md, lot L4).
--
-- 1. La liste d'envies du planificateur, ce sont les favoris de la boutique
--    (§ 6.2) : la table `recurring.wishlist_items` sort. Jamais déployée hors
--    de dev, vide ; aucun binaire déployé ne la lit.
-- 2. Le balayage lit aussi les brouillons dont l'instant de conversion est
--    atteint, quel que soit leur jour : un article qui ferme plus de deux
--    jours avant le jour servi passait sous la fenêtre des deux prochains
--    jours. Index partiel neuf, additif.
--
-- Retour arrière : `prisma/rollback/20261127235000_les_favoris_au_planificateur.sql`.
SET lock_timeout = '5s';

DROP TABLE "recurring"."wishlist_items";

CREATE INDEX "planned_columns_draft_converts_at_idx"
  ON "recurring"."planned_columns" ("converts_at")
  WHERE "status" = 'draft';
