-- ───────────────────────────────────────────────────────────────────────────
-- LE LIBELLÉ DÉFINITIF D'UNE INTENTION — `payment.card_intent_relabel`.
--
-- Plan documentation/payment/plan-pointage-stripe.md, lot 2.
-- ADDITIVE : un type et une table neufs, vides. Une ligne par paiement dont
-- le sujet a redit le libellé une fois enregistré (la commande et son
-- numéro) ; posée chez le prestataire après validation, reprise par le
-- balayage `admin/card-payments/labels/sweep`. Aucune donnée personnelle.
--
-- La clé vers `card_payment` suit sa suppression (CASCADE) : la purge du
-- scénario, qui seule supprime un paiement, n'a rien à en savoir.
--
-- Retour arrière, à tout moment (la table n'est qu'une file de pointage) :
--   DROP TABLE "payment"."card_intent_relabel";
--   DROP TYPE "payment"."CardIntentRelabelState";
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TYPE "payment"."CardIntentRelabelState" AS ENUM ('pending', 'posted', 'abandoned');

CREATE TABLE "payment"."card_intent_relabel" (
    "payment_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" "payment"."CardIntentRelabelState" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "last_failure" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_intent_relabel_pkey" PRIMARY KEY ("payment_id")
);

CREATE INDEX "card_intent_relabel_state_next_attempt_at_idx"
    ON "payment"."card_intent_relabel" ("state", "next_attempt_at");

ALTER TABLE "payment"."card_intent_relabel"
    ADD CONSTRAINT "card_intent_relabel_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payment"."card_payment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
