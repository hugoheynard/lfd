-- Retour arrière de 20261123150100_la_commande_offerte : les trois contraintes
-- et les cinq colonnes de l'offre sont retirées.
--
-- ⚠️ DÉTRUIT le motif et la valeur de toute commande offerte passée depuis.
-- Avant de jouer, compter ce qui serait perdu (aucune ligne attendue tant que
-- le lot O3 n'est pas déployé) :
--   SELECT count(*) FROM "public"."orders" WHERE "offer_nature" IS NOT NULL;
--
-- À jouer avec l'image d'avant O2, dans une transaction (`psql -1`). La
-- dernière instruction retire la migration du journal de Prisma. La valeur
-- d'enum `b2b_offer_order` (20261123150000) reste en place, inutilisée.

ALTER TABLE "public"."orders"
  DROP CONSTRAINT IF EXISTS "orders_offered_is_free",
  DROP CONSTRAINT IF EXISTS "orders_offer_nature_known",
  DROP CONSTRAINT IF EXISTS "orders_offer_together";

ALTER TABLE "public"."orders"
  DROP COLUMN IF EXISTS "offered_vat_shares",
  DROP COLUMN IF EXISTS "offered_vat_cents",
  DROP COLUMN IF EXISTS "offered_total_cents",
  DROP COLUMN IF EXISTS "offer_note",
  DROP COLUMN IF EXISTS "offer_nature";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261123150100_la_commande_offerte';
