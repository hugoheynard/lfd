-- LA FACTURE CARTE ET L'AVOIR D'UN REMBOURSEMENT — lots E5a et E5b
-- (`documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`, § 2 bis, § 11)
--
-- 1. `invoice.prepaid_cents` et `invoice.paid_on` : ce qu'une facture carte
--    a déjà encaissé (BT-113) et le jour de l'encaissement — la facture est
--    ACQUITTÉE. Les deux ensemble ou aucun ; jamais sur un avoir ; jamais
--    au-delà du TTC. Le déclencheur `invoice_immutable` les couvre déjà : il
--    compare la ligne entière (`to_jsonb`), colonnes neuves comprises.
-- 2. `card_invoice_outcome` : l'issue de la facture carte PAR COMMANDE —
--    émise (sa facture) ou signalée (le refus, en clair), comme
--    `invoice_monthly_outcome`. Une émise ne redevient jamais signalée.
-- 3. `order_refund.credit_note_id` (colonne de R1, nulle partout) : une clé
--    étrangère vers l'avoir, unique, posée UNE fois.
--
-- ADDITIVE : deux colonnes nullables, une table neuve, des contraintes sur
-- des colonnes encore vides (vérifié le 2026-10-08 : `credit_note_id` n'est
-- écrit par aucun code de R1, et aucune facture n'a de `prepaid_cents`).
-- Aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (EN AVANT, tant qu'aucune facture carte n'a été
-- émise en production) : `DROP TABLE "card_invoice_outcome"`, la fonction
-- `card_invoice_outcome_final`, la fonction `order_refund_credit_note_once`,
-- la contrainte `order_refund_credit_note_id_fkey`, l'index
-- `order_refund_credit_note_id_key`, puis les deux colonnes de `invoice`.
-- Après la première : NE PAS le faire — une facture émise ne se défait pas.

SET lock_timeout = '5s';

-- 1. Le déjà payé.
ALTER TABLE "public"."invoice" ADD COLUMN "prepaid_cents" INTEGER;
ALTER TABLE "public"."invoice" ADD COLUMN "paid_on" DATE;

ALTER TABLE "public"."invoice"
    ADD CONSTRAINT "invoice_prepaid_together" CHECK (("prepaid_cents" IS NULL) = ("paid_on" IS NULL)),
    ADD CONSTRAINT "invoice_prepaid_bounds" CHECK (
        "prepaid_cents" IS NULL OR ("prepaid_cents" > 0 AND "prepaid_cents" <= "total_ttc_cents")
    ),
    ADD CONSTRAINT "invoice_prepaid_not_on_credit_note" CHECK ("type" = '380' OR "prepaid_cents" IS NULL),
    ADD CONSTRAINT "invoice_paid_before_issue" CHECK ("paid_on" IS NULL OR "paid_on" <= "issued_on");

-- 2. L'issue par commande.
CREATE TABLE "public"."card_invoice_outcome" (
    "order_id"         TEXT           NOT NULL,
    "order_number"     TEXT           NOT NULL,
    -- Nulle quand aucune entité ne pouvait émettre (aucune, ou plusieurs).
    "legal_entity_id"  TEXT,
    "payer_company_id" TEXT           NOT NULL,
    "payer_name"       TEXT           NOT NULL,
    "outcome"          TEXT           NOT NULL,
    "invoice_id"       TEXT,
    "message"          TEXT,
    "recorded_at"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "card_invoice_outcome_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "card_invoice_outcome_kind" CHECK ("outcome" IN ('issued', 'blocked')),
    -- Émise ⇔ sa facture (et son entité) ; signalée ⇔ son refus en clair.
    CONSTRAINT "card_invoice_outcome_issued_has_invoice" CHECK (
        ("outcome" = 'issued') = ("invoice_id" IS NOT NULL)
        AND ("outcome" = 'blocked') = ("message" IS NOT NULL)
        AND ("outcome" = 'blocked' OR "legal_entity_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "card_invoice_outcome_invoice_id_key"
    ON "public"."card_invoice_outcome"("invoice_id");

CREATE INDEX "card_invoice_outcome_outcome_idx"
    ON "public"."card_invoice_outcome"("outcome");

ALTER TABLE "public"."card_invoice_outcome"
    ADD CONSTRAINT "card_invoice_outcome_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."card_invoice_outcome"
    ADD CONSTRAINT "card_invoice_outcome_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."card_invoice_outcome"
    ADD CONSTRAINT "card_invoice_outcome_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une issue `issued` est définitive : ni supprimée, ni rendue `blocked`.
CREATE FUNCTION "public"."card_invoice_outcome_final"() RETURNS trigger AS $$
BEGIN
    IF OLD."outcome" = 'issued' THEN
        RAISE EXCEPTION 'card_invoice_outcome_final: la commande % est déjà facturée, sa facture ne se défait pas', OLD."order_number";
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "card_invoice_outcome_final"
    BEFORE UPDATE OR DELETE ON "public"."card_invoice_outcome"
    FOR EACH ROW EXECUTE FUNCTION "public"."card_invoice_outcome_final"();

-- 3. L'avoir d'un remboursement : une pièce, un remboursement, posé une fois.
CREATE UNIQUE INDEX "order_refund_credit_note_id_key"
    ON "public"."order_refund"("credit_note_id");

ALTER TABLE "public"."order_refund"
    ADD CONSTRAINT "order_refund_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "public"."order_refund_credit_note_once"() RETURNS trigger AS $$
BEGIN
    IF OLD."credit_note_id" IS NOT NULL
        AND NEW."credit_note_id" IS DISTINCT FROM OLD."credit_note_id" THEN
        RAISE EXCEPTION 'order_refund_credit_note_once: le remboursement % a déjà son avoir', OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_refund_credit_note_once"
    BEFORE UPDATE ON "public"."order_refund"
    FOR EACH ROW EXECUTE FUNCTION "public"."order_refund_credit_note_once"();
