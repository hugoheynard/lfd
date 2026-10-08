-- LES REMBOURSEMENTS CONSTATÉS — lot R1
-- (`documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`, § 3, § 10)
--
-- Une table : une ligne par remboursement Stripe (`re_…`) constaté sur une
-- commande, et l'énumération de son statut tel que Stripe l'écrit. On le
-- CONSTATE (webhooks `refund.created`, `refund.updated`, `refund.failed`), on
-- ne l'initie pas.
--
-- ADDITIVE : une énumération et une table neuves. Aucune ligne existante
-- modifiée, aucune colonne resserrée, aucun droit accordé à un rôle.
-- `orders.payment_status` reçoit enfin la valeur `refunded`, qui existait
-- déjà dans l'énumération et que rien n'écrivait : pas de changement de type.
--
-- Retour arrière du SCHÉMA (EN AVANT, tant qu'aucun remboursement n'a été
-- constaté en production) : `DROP TABLE "order_refund"` puis
-- `DROP TYPE "OrderRefundStatus"`. Après le premier : NE PAS le faire — la
-- ligne est la seule trace chez nous d'un argent rendu.

SET lock_timeout = '5s';

CREATE TYPE "public"."OrderRefundStatus" AS ENUM ('pending', 'requires_action', 'succeeded', 'failed', 'canceled');

CREATE TABLE "public"."order_refund" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "stripe_refund_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "public"."OrderRefundStatus" NOT NULL,
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "credit_note_id" TEXT,

    CONSTRAINT "order_refund_pkey" PRIMARY KEY ("id"),
    -- Un remboursement rend de l'argent : jamais zéro, jamais négatif. Le
    -- refus de la devise, lui, est tenu par l'agrégat (il doit se VOIR, pas
    -- seulement échouer).
    CONSTRAINT "order_refund_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX "order_refund_stripe_refund_id_key" ON "public"."order_refund"("stripe_refund_id");

CREATE INDEX "order_refund_order_id_idx" ON "public"."order_refund"("order_id");

ALTER TABLE "public"."order_refund"
    ADD CONSTRAINT "order_refund_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
