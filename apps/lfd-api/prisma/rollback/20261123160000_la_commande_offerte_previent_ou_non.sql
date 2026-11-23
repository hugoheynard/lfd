-- Retour arrière de 20261123160000_la_commande_offerte_previent_ou_non : le
-- CHECK « tout ou rien » de l'offre revient à ses cinq colonnes, et la colonne
-- `offer_notifies_customer` est retirée.
--
-- ⚠️ DÉTRUIT le choix « prévenir le client » des commandes offertes passées
-- depuis. Après le retour arrière, l'image d'avant O5 envoie les e-mails de
-- toute commande, offerte ou non. Compter d'abord ce qui serait perdu :
--   SELECT count(*) FROM "public"."orders" WHERE "offer_notifies_customer" IS NOT NULL;
--
-- À jouer avec l'image d'avant O5, dans une transaction (`psql -1`). La
-- dernière instruction retire la migration du journal de Prisma.

ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_offer_together";

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_offer_together" CHECK (
    ("offer_nature" IS NULL) = ("offer_note" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_total_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_shares" IS NULL)
  );

ALTER TABLE "public"."orders" DROP COLUMN IF EXISTS "offer_notifies_customer";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261123160000_la_commande_offerte_previent_ou_non';
