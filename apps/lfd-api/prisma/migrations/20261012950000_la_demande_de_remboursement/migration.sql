-- LA DEMANDE DE REMBOURSEMENT — l'argent à rendre, devenu un état persisté
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C4 (C4.5,
-- C4.7, C4.11, C4.11 bis).
--
-- 1. L'énumération `OrderRefundCause`, CRÉÉE avec ses trois valeurs : un type
--    neuf s'emploie dans la transaction qui le crée (seul un `ADD VALUE` ne le
--    peut pas).
-- 2. `public.order_refund_request` : une demande par commande (clé primaire
--    sur `order_id`), écrite dans la transaction de l'annulation ; Stripe est
--    appelé après, par un exécuteur unique qui prend un bail.
--
-- Aucun statut stocké : l'état se lit au carnet (`order_refund`). Les
-- contraintes tiennent ce que l'agrégat tient aussi : un montant annoncé
-- positif, et un `re_…` qui va avec son instant d'émission.
--
-- 🔴 Les valeurs de `OrderRefundCause` sont IRRÉVERSIBLES dès la première ligne
-- (CLAUDE.md §8, valeurs de données).
--
-- ADDITIVE : aucune colonne existante touchée, aucune donnée réécrite, aucun
-- droit accordé. Retour arrière : `DROP TABLE "public"."order_refund_request"`
-- puis `DROP TYPE "public"."OrderRefundCause"` — à ne faire qu'avant tout
-- remboursement réel.

CREATE TYPE "public"."OrderRefundCause" AS ENUM ('cancellation', 'paid_after_cancellation', 'refund_reversed');

CREATE TABLE "public"."order_refund_request" (
    "order_id" TEXT NOT NULL,
    "cause" "public"."OrderRefundCause" NOT NULL,
    "announced_cents" INTEGER NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_by" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "stripe_refund_id" TEXT,
    "issued_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failure" TEXT,
    "last_attempt_at" TIMESTAMPTZ(3),
    "round" INTEGER NOT NULL DEFAULT 1,
    "claimed_until" TIMESTAMPTZ(3),
    "claim_token" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3),

    CONSTRAINT "order_refund_request_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "order_refund_request_announced_positive" CHECK ("announced_cents" > 0),
    CONSTRAINT "order_refund_request_issued_pair" CHECK (("stripe_refund_id" IS NULL) = ("issued_at" IS NULL)),
    CONSTRAINT "order_refund_request_generation_positive" CHECK ("generation" >= 1),
    CONSTRAINT "order_refund_request_round_positive" CHECK ("round" >= 1),
    CONSTRAINT "order_refund_request_attempts_positive" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "order_refund_request_stripe_refund_id_key" ON "public"."order_refund_request"("stripe_refund_id");

CREATE INDEX "order_refund_request_next_attempt_at_idx" ON "public"."order_refund_request"("next_attempt_at");

ALTER TABLE "public"."order_refund_request" ADD CONSTRAINT "order_refund_request_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
