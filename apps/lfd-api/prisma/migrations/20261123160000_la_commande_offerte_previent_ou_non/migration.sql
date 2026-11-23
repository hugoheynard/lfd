-- LA COMMANDE OFFERTE PRÉVIENT-ELLE LE CLIENT ? — lot O5 de
-- documentation/commandes/passation/plan-commande-offerte.md (§ 4).
--
-- Décidé par Hugo le 2026-11-23 : une commande offerte ne prévient pas le
-- client par défaut (une dégustation, la commerciale l'apporte). Le choix est
-- figé avec le motif de l'offre.
--
-- Additive : une colonne nullable, NULL pour toute commande payée. Une
-- commande offerte existante (aucune en production : la passation offerte
-- n'est pas encore déployée) reçoit `false`, le défaut décidé. Le CHECK
-- « tout ou rien » de l'offre est remplacé pour l'inclure.
--
-- Retour arrière : prisma/rollback/20261123160000_la_commande_offerte_previent_ou_non.sql.

ALTER TABLE "public"."orders" ADD COLUMN "offer_notifies_customer" BOOLEAN;

UPDATE "public"."orders"
   SET "offer_notifies_customer" = false
 WHERE "offer_nature" IS NOT NULL;

ALTER TABLE "public"."orders" DROP CONSTRAINT "orders_offer_together";

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_offer_together" CHECK (
    ("offer_nature" IS NULL) = ("offer_note" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_total_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_shares" IS NULL)
    AND ("offer_nature" IS NULL) = ("offer_notifies_customer" IS NULL)
  );
