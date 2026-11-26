-- Retour arrière de 20261126170000_la_commande_interne : le CHECK reprend la
-- liste d'avant, sans `in_house`.
--
-- ⚠️ ÉCHOUE tant qu'une commande interne existe : la contrainte refuserait
-- sa ligne. Avant de jouer, compter ce qui bloquerait :
--   SELECT count(*) FROM "public"."orders" WHERE "offer_nature" = 'in_house';
-- Une commande interne ne se supprime pas : si le compte n'est pas nul, ne
-- pas jouer ce retour arrière.
--
-- À jouer avec l'image d'avant L2, dans une transaction (`psql -1`). La
-- dernière instruction retire la migration du journal de Prisma.

ALTER TABLE "public"."orders"
  DROP CONSTRAINT "orders_offer_nature_known",
  ADD CONSTRAINT "orders_offer_nature_known" CHECK (
    "offer_nature" IS NULL
    OR "offer_nature" IN ('tasting', 'event', 'goodwill', 'replacement', 'sample')
  );

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261126170000_la_commande_interne';
